import { isIata, isFutureDate, parsePositiveNumber } from '../utils/validation';

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
  date: string;
  targetPrice: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Valida y normaliza los argumentos de /add. */
export function parseAddArgs(args: string[]): Result<AddArgs> {
  if (args.length !== 4) {
    return {
      ok: false,
      error: 'Uso: /add ORG DEST YYYY-MM-DD precioMax\nEjemplo: /add MAD PRG 2026-08-20 120',
    };
  }
  const [origin, destination, date, priceStr] = args;

  if (!isIata(origin)) {
    return { ok: false, error: `Origen inválido: "${origin}". Usa código IATA de 3 letras (ej. MAD).` };
  }
  if (!isIata(destination)) {
    return { ok: false, error: `Destino inválido: "${destination}". Usa código IATA de 3 letras (ej. PRG).` };
  }
  if (!isFutureDate(date)) {
    return { ok: false, error: `Fecha inválida: "${date}". Usa formato YYYY-MM-DD y una fecha futura.` };
  }
  const price = parsePositiveNumber(priceStr);
  if (price == null) {
    return { ok: false, error: `Precio inválido: "${priceStr}". Debe ser un número positivo.` };
  }

  return {
    ok: true,
    value: {
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      date,
      targetPrice: Math.round(price),
    },
  };
}
