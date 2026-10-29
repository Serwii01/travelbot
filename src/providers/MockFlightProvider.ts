import type { FlightProvider, FlightQuery, FlightResult } from './FlightProvider.js';

/**
 * Proveedor de pruebas. No hace llamadas de red.
 * - Con fixedPrice: precio determinista (util en tests).
 * - Sin fixedPrice: precio derivado de la ruta + jitter (util para /checknow sin API).
 */
export class MockFlightProvider implements FlightProvider {
  readonly name = 'mock';

  constructor(private readonly fixedPrice?: number) {}

  async search(query: FlightQuery): Promise<FlightResult | null> {
    let price = this.fixedPrice;
    if (price == null) {
      const key = `${query.origin}${query.destination}${query.departRange.from}`;
      let base = 0;
      for (const ch of key) base += ch.charCodeAt(0);
      base = 50 + (base % 150); // 50..199
      if (query.returnRange) base *= 2;
      const jitter = Math.floor(Math.random() * 60) - 30; // -30..+29
      price = Math.max(20, base + jitter);
    }
    return {
      price,
      currency: query.currency,
      provider: this.name,
      departDate: query.departRange.from,
      returnDate: query.returnRange?.to ?? null,
      airline: 'XX',
      transfers: query.directOnly ? 0 : 1,
      link: null,
    };
  }
}
