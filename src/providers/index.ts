import { config } from '../config.js';
import type { FlightProvider } from './FlightProvider.js';
import { TravelpayoutsFlightProvider } from './TravelpayoutsFlightProvider.js';
import { MockFlightProvider } from './MockFlightProvider.js';

/** Factory: selecciona el proveedor segun FLIGHT_PROVIDER. */
export function createProvider(): FlightProvider {
  switch (config.provider) {
    case 'mock':
      return new MockFlightProvider();
    case 'travelpayouts':
    default:
      return new TravelpayoutsFlightProvider({
        token: config.travelpayouts.token,
        marker: config.travelpayouts.marker || undefined,
        minIntervalMs: config.requestDelayMs,
      });
  }
}

export type { FlightProvider };
