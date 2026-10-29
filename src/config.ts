/**
 * Configuracion central leida de variables de entorno.
 * Todo es sustituible (proveedor, almacenamiento) sin tocar la logica.
 */
export type ProviderName = 'travelpayouts' | 'mock';

export interface Config {
  telegramToken: string;
  travelpayouts: {
    token: string;
    /** Marker de afiliado de Travelpayouts (opcional, para ganar comision). */
    marker: string;
    /** Mercado de los precios cacheados (es, us, ru…). */
    market: string;
  };
  provider: ProviderName;
  storage: 'json';
  dataFile: string;
  defaultCurrency: string;
  /** Espera minima entre llamadas reales a la API de vuelos. */
  requestDelayMs: number;
  /** Bajada minima (%) para avisar cuando el precio sigue por encima del objetivo. */
  minDropPct: number;
  /** Modo 24/7: cada cuantos minutos se comprueban precios. */
  checkIntervalMin: number;
}

const env = process.env;

const num = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return value != null && value !== '' && Number.isFinite(n) ? n : fallback;
};

export const config: Config = {
  telegramToken: env.TELEGRAM_BOT_TOKEN ?? '',
  travelpayouts: {
    token: env.TRAVELPAYOUTS_TOKEN ?? '',
    marker: env.TRAVELPAYOUTS_MARKER ?? '',
    market: (env.TRAVELPAYOUTS_MARKET || 'es').toLowerCase(),
  },
  provider: (env.FLIGHT_PROVIDER as ProviderName) || 'travelpayouts',
  storage: 'json',
  dataFile: env.DATA_FILE || 'data/db.json',
  defaultCurrency: (env.DEFAULT_CURRENCY || 'EUR').toUpperCase(),
  requestDelayMs: num(env.REQUEST_DELAY_MS, 1200),
  minDropPct: num(env.MIN_DROP_PCT, 3),
  checkIntervalMin: Math.max(15, num(env.CHECK_INTERVAL_MIN, 180)),
};

/** Lanza si falta configuracion imprescindible para ejecutar el bot. */
export function assertRuntimeConfig(c: Config = config): void {
  if (!c.telegramToken) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  if (c.provider === 'travelpayouts' && !c.travelpayouts.token) {
    throw new Error('Falta TRAVELPAYOUTS_TOKEN');
  }
}
