import type { FlightProvider, FlightQuery, FlightResult } from './FlightProvider';

/**
 * Proveedor de pruebas. No hace llamadas de red.
 * - Con fixedPrice: precio determinista (util en tests).
 * - Sin fixedPrice: precio derivado de la ruta + jitter (util para /checknow sin API).
 */
export class MockFlightProvider implements FlightProvider {
  readonly name = 'mock';

  constructor(private readonly fixedPrice?: number) {}

  async search(query: FlightQuery): Promise<FlightResult | null> {
    if (this.fixedPrice != null) {
      return { price: this.fixedPrice, currency: query.currency, provider: this.name };
    }
    const key = `${query.origin}${query.destination}${query.date}`;
    let base = 0;
    for (const ch of key) base += ch.charCodeAt(0);
    base = 50 + (base % 150); // 50..199
    const jitter = Math.floor(Math.random() * 60) - 30; // -30..+29
    return { price: Math.max(20, base + jitter), currency: query.currency, provider: this.name };
  }
}
