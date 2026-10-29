import type { DateRange, Deal } from '../models/types.js';

export interface FlightQuery {
  origin: string;
  destination: string;
  departRange: DateRange;
  /** null = solo ida. */
  returnRange: DateRange | null;
  directOnly: boolean;
  currency: string;
}

export interface FlightResult extends Deal {
  currency: string;
  provider: string;
}

/**
 * Interfaz comun de proveedores de vuelos.
 * Implementaciones: TravelpayoutsFlightProvider (principal), MockFlightProvider (pruebas).
 */
export interface FlightProvider {
  readonly name: string;
  /** Devuelve el billete mas barato o null si no hay ofertas. Puede lanzar en error de API. */
  search(query: FlightQuery): Promise<FlightResult | null>;
}
