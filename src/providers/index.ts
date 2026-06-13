import { config } from '../config';
import type { FlightProvider } from './FlightProvider';
import { AmadeusFlightProvider } from './AmadeusFlightProvider';
import { MockFlightProvider } from './MockFlightProvider';

/** Factory: selecciona el proveedor segun FLIGHT_PROVIDER. */
export function createProvider(): FlightProvider {
  if (config.provider === 'mock') return new MockFlightProvider();
  return new AmadeusFlightProvider({
    clientId: config.amadeus.clientId,
    clientSecret: config.amadeus.clientSecret,
    hostname: config.amadeus.hostname,
  });
}

export type { FlightProvider };
