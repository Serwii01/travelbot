import type { FlightProvider, FlightQuery, FlightResult } from './FlightProvider';

interface AmadeusOptions {
  clientId: string;
  clientSecret: string;
  hostname: string;
}

interface AmadeusOffer {
  price?: { total?: string; grandTotal?: string };
}

/**
 * Proveedor principal: Amadeus Self-Service (Flight Offers Search).
 *
 * Entorno test (test.api.amadeus.com): GRATIS pero datos limitados y cacheados,
 * no todas las rutas/fechas devuelven ofertas y los precios no son en tiempo real.
 * Produccion (api.amadeus.com): datos reales, requiere pasar la app a produccion
 * en el portal de Amadeus. Se cambia solo con AMADEUS_HOSTNAME.
 */
export class AmadeusFlightProvider implements FlightProvider {
  readonly name = 'amadeus';
  private token: string | null = null;
  private tokenExpiry = 0;

  constructor(private readonly opts: AmadeusOptions) {}

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.tokenExpiry - 60_000) return this.token;

    const res = await fetch(`https://${this.opts.hostname}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
      }),
    });
    if (!res.ok) {
      throw new Error(`Amadeus auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    this.token = data.access_token;
    this.tokenExpiry = now + (data.expires_in ?? 1799) * 1000;
    return this.token;
  }

  async search(query: FlightQuery): Promise<FlightResult | null> {
    const token = await this.getToken();
    const url = new URL(`https://${this.opts.hostname}/v2/shopping/flight-offers`);
    url.searchParams.set('originLocationCode', query.origin);
    url.searchParams.set('destinationLocationCode', query.destination);
    url.searchParams.set('departureDate', query.date);
    url.searchParams.set('adults', '1');
    url.searchParams.set('currencyCode', query.currency);
    url.searchParams.set('max', '10');

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Amadeus search ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { data?: AmadeusOffer[] };
    const offers = data.data ?? [];
    if (offers.length === 0) return null;

    let min = Infinity;
    for (const offer of offers) {
      const raw = offer.price?.grandTotal ?? offer.price?.total;
      const price = Number(raw);
      if (Number.isFinite(price) && price < min) min = price;
    }
    if (min === Infinity) return null;
    return { price: min, currency: query.currency, provider: this.name };
  }
}
