/**
 * Configuracion central leida de variables de entorno.
 * Todo es sustituible (proveedor, almacenamiento) sin tocar la logica.
 */
export interface Config {
  telegramToken: string;
  amadeus: {
    clientId: string;
    clientSecret: string;
    hostname: string;
  };
  provider: 'amadeus' | 'mock';
  storage: 'json';
  dataFile: string;
  defaultCurrency: string;
  requestDelayMs: number;
}

const env = process.env;

export const config: Config = {
  telegramToken: env.TELEGRAM_BOT_TOKEN ?? '',
  amadeus: {
    clientId: env.AMADEUS_CLIENT_ID ?? '',
    clientSecret: env.AMADEUS_CLIENT_SECRET ?? '',
    hostname: env.AMADEUS_HOSTNAME ?? 'test.api.amadeus.com',
  },
  provider: (env.FLIGHT_PROVIDER as Config['provider']) ?? 'amadeus',
  storage: 'json',
  dataFile: env.DATA_FILE ?? 'data/db.json',
  defaultCurrency: (env.DEFAULT_CURRENCY ?? 'EUR').toUpperCase(),
  requestDelayMs: Number(env.REQUEST_DELAY_MS ?? '1200'),
};

/** Lanza si falta configuracion imprescindible para ejecutar el job. */
export function assertRuntimeConfig(c: Config = config): void {
  if (!c.telegramToken) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  if (c.provider === 'amadeus' && (!c.amadeus.clientId || !c.amadeus.clientSecret)) {
    throw new Error('Faltan AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET');
  }
}
