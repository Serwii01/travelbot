import type { DateRange } from '../models/types.js';
import type { FlightProvider, FlightQuery, FlightResult } from './FlightProvider.js';
import { inRange, monthsOf } from '../utils/dates.js';
import { sleep } from '../utils/sleep.js';

interface TravelpayoutsOptions {
  token: string;
  /** Marker de afiliado (opcional): se anade a los enlaces de compra. */
  marker?: string;
  /**
   * Mercado del que salen los precios cacheados (por defecto de la API: "ru").
   * Las busquedas de usuarios espanoles estan en "es": con "ru" muchas rutas salen vacias.
   */
  market?: string;
  hostname?: string;
  /** Espera minima entre llamadas reales a la API (las respuestas cacheadas no esperan). */
  minIntervalMs?: number;
  /** Tiempo que se reutiliza una respuesta. Los datos de origen ya son de ~48h. */
  cacheTtlMs?: number;
  /** Inyectable para tests. */
  fetchFn?: typeof fetch;
}

export interface TravelpayoutsTicket {
  price?: number;
  airline?: string;
  departure_at?: string;
  return_at?: string;
  transfers?: number;
  return_transfers?: number;
  link?: string;
}

interface TravelpayoutsResponse {
  success?: boolean;
  error?: string | null;
  data?: TravelpayoutsTicket[];
}

const DEFAULT_TTL_MS = 20 * 60_000;

/**
 * Proveedor principal: Travelpayouts / Aviasales Data API (gratis, sin tarjeta).
 * Endpoint "prices_for_dates": billetes mas baratos encontrados por usuarios de
 * Aviasales en las ultimas ~48h (precios cacheados, suficientes para alertas).
 *
 * Optimizaciones:
 *  - Fecha exacta -> se pide ese dia; rango -> se pide por meses y se filtra en local.
 *  - Cache en memoria por URL: alertas distintas que comparten mes/ruta reutilizan la
 *    misma respuesta, y /checknow repetido no gasta llamadas.
 *  - Throttle solo para llamadas reales.
 */
export class TravelpayoutsFlightProvider implements FlightProvider {
  readonly name = 'travelpayouts';
  private readonly hostname: string;
  private readonly fetchFn: typeof fetch;
  private readonly cache = new Map<string, { at: number; tickets: TravelpayoutsTicket[] }>();
  private lastCallAt = 0;

  constructor(private readonly opts: TravelpayoutsOptions) {
    this.hostname = opts.hostname ?? 'api.travelpayouts.com';
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async search(query: FlightQuery): Promise<FlightResult | null> {
    let best: TravelpayoutsTicket | null = null;

    for (const departAt of periodsFor(query.departRange)) {
      const returnPeriods = query.returnRange ? periodsFor(query.returnRange) : [null];
      for (const returnAt of returnPeriods) {
        const tickets = await this.fetchTickets(query, departAt, returnAt);
        for (const t of tickets) {
          if (!matches(t, query)) continue;
          if (!best || Number(t.price) < Number(best.price)) best = t;
        }
      }
    }

    if (!best) return null;
    return {
      price: Number(best.price),
      currency: query.currency,
      provider: this.name,
      departDate: best.departure_at!.slice(0, 10),
      returnDate: best.return_at ? best.return_at.slice(0, 10) : null,
      airline: best.airline ?? null,
      transfers:
        best.transfers == null ? null : best.transfers + (query.returnRange ? (best.return_transfers ?? 0) : 0),
      link: this.buildLink(best.link),
    };
  }

  private async fetchTickets(
    query: FlightQuery,
    departAt: string,
    returnAt: string | null,
  ): Promise<TravelpayoutsTicket[]> {
    const url = new URL(`https://${this.hostname}/aviasales/v3/prices_for_dates`);
    url.searchParams.set('origin', query.origin);
    url.searchParams.set('destination', query.destination);
    url.searchParams.set('departure_at', departAt);
    if (returnAt) url.searchParams.set('return_at', returnAt);
    url.searchParams.set('one_way', String(!query.returnRange));
    url.searchParams.set('direct', String(query.directOnly));
    url.searchParams.set('currency', query.currency.toLowerCase());
    if (this.opts.market) url.searchParams.set('market', this.opts.market);
    url.searchParams.set('sorting', 'price');
    url.searchParams.set('unique', 'false');
    // Un mes devuelve muchos billetes; necesitamos margen para filtrar por rango.
    url.searchParams.set('limit', departAt.length === 7 || returnAt?.length === 7 ? '1000' : '100');

    const key = url.toString();
    const ttl = this.opts.cacheTtlMs ?? DEFAULT_TTL_MS;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < ttl) return cached.tickets;

    const wait = this.lastCallAt + (this.opts.minIntervalMs ?? 0) - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();

    const res = await this.fetchFn(url, {
      headers: { 'X-Access-Token': this.opts.token },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`Travelpayouts ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const body = (await res.json()) as TravelpayoutsResponse;
    if (body.success === false) {
      throw new Error(`Travelpayouts error: ${body.error ?? 'desconocido'}`);
    }

    const tickets = body.data ?? [];
    this.pruneCache(ttl);
    this.cache.set(key, { at: Date.now(), tickets });
    return tickets;
  }

  private pruneCache(ttl: number): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.at >= ttl) this.cache.delete(key);
    }
  }

  private buildLink(path: string | undefined): string | null {
    if (!path) return null;
    const url = new URL(path, 'https://www.aviasales.com');
    if (this.opts.marker) url.searchParams.set('marker', this.opts.marker);
    return url.toString();
  }
}

/** Fecha exacta -> ese dia; rango -> los meses que cubre. */
function periodsFor(range: DateRange): string[] {
  return range.from === range.to ? [range.from] : monthsOf(range);
}

function matches(t: TravelpayoutsTicket, q: FlightQuery): boolean {
  const price = Number(t.price);
  if (!Number.isFinite(price) || price <= 0 || !t.departure_at) return false;
  const depart = t.departure_at.slice(0, 10);
  if (!inRange(depart, q.departRange)) return false;

  if (q.returnRange) {
    if (!t.return_at) return false;
    const ret = t.return_at.slice(0, 10);
    if (!inRange(ret, q.returnRange) || ret < depart) return false;
  }

  if (q.directOnly && ((t.transfers ?? 0) > 0 || (q.returnRange && (t.return_transfers ?? 0) > 0))) {
    return false;
  }
  return true;
}
