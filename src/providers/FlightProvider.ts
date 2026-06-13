export interface FlightQuery {
  origin: string;
  destination: string;
  /** YYYY-MM-DD */
  date: string;
  currency: string;
}

export interface FlightResult {
  /** Precio mas barato encontrado para la consulta. */
  price: number;
  currency: string;
  provider: string;
}

/**
 * Interfaz comun de proveedores de vuelos.
 * Implementaciones: AmadeusFlightProvider (principal), MockFlightProvider (pruebas).
 */
export interface FlightProvider {
  readonly name: string;
  /** Devuelve el precio mas barato o null si no hay ofertas. Puede lanzar en error de API. */
  search(query: FlightQuery): Promise<FlightResult | null>;
}
