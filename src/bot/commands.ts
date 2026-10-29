import type { DateRange } from '../models/types.js';
import { isIata, parsePositiveNumber } from '../utils/validation.js';
import { parseDateSpec, todayUtc } from '../utils/dates.js';

export interface ParsedCommand {
  name: string;
  args: string[];
}

/** Extrae nombre y argumentos de un texto de comando ("/add MAD PRG ..."). */
export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  // Soporta "/add@MiBotName" en grupos.
  const name = parts[0].slice(1).split('@')[0].toLowerCase();
  if (!name) return null;
  return { name, args: parts.slice(1) };
}

export interface AddArgs {
  origin: string;
  destination: string;
  departRange: DateRange;
  returnRange: DateRange | null;
  directOnly: boolean;
  targetPrice: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const ADD_USAGE = [
  'Uso: /add ORIGEN DESTINO IDA [VUELTA] precioMax [directo]',
  'Fechas: 2026-08-20 · 2026-08-15..2026-08-25 · 2026-08 (mes entero)',
  'Ejemplos:',
  '/add MAD PRG 2026-08-20 120',
  '/add MAD PRG 2026-08-15..2026-08-20 2026-08-22..2026-08-27 200',
  '/add MAD LON 2026-09 2026-09 150 directo',
].join('\n');

const DIRECT_WORDS = new Set(['directo', 'direct', 'directos']);

/** Valida y normaliza los argumentos de /add. */
export function parseAddArgs(rawArgs: string[], today: string = todayUtc()): Result<AddArgs> {
  const directOnly = rawArgs.some((a) => DIRECT_WORDS.has(a.toLowerCase()));
  const args = rawArgs.filter((a) => !DIRECT_WORDS.has(a.toLowerCase()));

  if (args.length !== 4 && args.length !== 5) return { ok: false, error: ADD_USAGE };

  const [origin, destination] = args;
  const departSpec = args[2];
  const returnSpec = args.length === 5 ? args[3] : null;
  const priceStr = args[args.length - 1];

  if (!isIata(origin)) {
    return { ok: false, error: `Origen inválido: "${origin}". Usa código IATA de 3 letras (ej. MAD).` };
  }
  if (!isIata(destination)) {
    return { ok: false, error: `Destino inválido: "${destination}". Usa código IATA de 3 letras (ej. PRG).` };
  }
  if (origin.toUpperCase() === destination.toUpperCase()) {
    return { ok: false, error: 'Origen y destino no pueden ser iguales.' };
  }

  const depart = parseDateSpec(departSpec, today);
  if (!depart.ok) return { ok: false, error: `Ida: ${depart.error}` };

  let returnRange: DateRange | null = null;
  if (returnSpec) {
    const ret = parseDateSpec(returnSpec, today);
    if (!ret.ok) return { ok: false, error: `Vuelta: ${ret.error}` };
    if (ret.value.to < depart.value.from) {
      return { ok: false, error: 'La vuelta no puede ser anterior a la ida.' };
    }
    returnRange = ret.value;
  }

  const price = parsePositiveNumber(priceStr);
  if (price == null) {
    return { ok: false, error: `Precio inválido: "${priceStr}". Debe ser un número positivo.\n\n${ADD_USAGE}` };
  }

  return {
    ok: true,
    value: {
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departRange: depart.value,
      returnRange,
      directOnly,
      targetPrice: Math.round(price),
    },
  };
}
