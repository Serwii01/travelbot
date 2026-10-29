import type { Place } from '../models/types.js';

interface AutocompleteItem {
  type?: string;
  code?: string;
  name?: string;
  city_name?: string;
  country_name?: string;
}

export type PlaceLookup = (term: string) => Promise<Place[]>;

const MAX_RESULTS = 6;
const CACHE_TTL_MS = 24 * 3600_000;

/**
 * Busca ciudades y aeropuertos por nombre ("madrid", "praga", "MAD") con el
 * autocompletado publico de Travelpayouts (gratis, sin token).
 * Las ciudades van primero: su codigo (p. ej. LON) cubre todos sus aeropuertos.
 */
export class PlacesService {
  private readonly cache = new Map<string, { at: number; places: Place[] }>();

  constructor(
    private readonly locale = 'es',
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  readonly search: PlaceLookup = async (term) => {
    const key = term.trim().toLowerCase();
    if (key.length < 2) return [];
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.places;

    const url = new URL('https://autocomplete.travelpayouts.com/places2');
    url.searchParams.set('term', key);
    url.searchParams.set('locale', this.locale);
    url.searchParams.append('types[]', 'city');
    url.searchParams.append('types[]', 'airport');

    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`autocomplete ${res.status}`);
    const places = parsePlaces((await res.json()) as AutocompleteItem[]);

    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(key, { at: Date.now(), places });
    return places;
  };
}

export function parsePlaces(items: AutocompleteItem[]): Place[] {
  const seen = new Set<string>();
  const places: Place[] = [];
  const sorted = [...items].sort((a, b) => Number(b.type === 'city') - Number(a.type === 'city'));
  for (const item of sorted) {
    if (!item.code || !/^[A-Z]{3}$/.test(item.code) || seen.has(item.code)) continue;
    seen.add(item.code);
    const isAirport = item.type === 'airport';
    const name = isAirport && item.city_name ? `${item.city_name} · ${item.name}` : (item.name ?? item.code);
    places.push({
      code: item.code,
      name: [name, item.country_name].filter(Boolean).join(', '),
      isCity: !isAirport,
    });
    if (places.length >= MAX_RESULTS) break;
  }
  return places;
}
