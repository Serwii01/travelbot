import type { DateRange } from '../models/types.js';

const DAY_MS = 86_400_000;

/** Maximo de dias que puede abarcar un rango (mantiene las llamadas a la API acotadas). */
export const MAX_RANGE_DAYS = 31;

/** Fecha de hoy en UTC como YYYY-MM-DD. */
export const todayUtc = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/** Parsea YYYY-MM-DD validando que sea una fecha real. */
export function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

export const inRange = (date: string, range: DateRange): boolean =>
  date >= range.from && date <= range.to;

/** Meses (YYYY-MM) que cubre un rango, en orden. */
export function monthsOf(range: DateRange): string[] {
  const months: string[] = [];
  let [y, m] = range.from.slice(0, 7).split('-').map(Number);
  const last = range.to.slice(0, 7);
  for (;;) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    months.push(month);
    if (month >= last) return months;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
}

export type DateSpecResult = { ok: true; value: DateRange } | { ok: false; error: string };

/**
 * Interpreta una fecha del usuario:
 *   2026-08-20             fecha exacta
 *   2026-08-15..2026-08-25 rango (max 31 dias)
 *   2026-08                mes completo
 * Los dias ya pasados se recortan; si todo el rango es pasado, es un error.
 */
export function parseDateSpec(spec: string, today: string = todayUtc()): DateSpecResult {
  let from: string;
  let to: string;

  const month = /^(\d{4})-(\d{2})$/.exec(spec);
  if (month) {
    const y = Number(month[1]);
    const m = Number(month[2]);
    if (m < 1 || m > 12) return { ok: false, error: `Mes inválido: "${spec}".` };
    from = `${spec}-01`;
    to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  } else if (spec.includes('..')) {
    [from, to] = spec.split('..');
    if (!parseIsoDate(from) || !parseIsoDate(to)) {
      return { ok: false, error: `Rango inválido: "${spec}". Usa YYYY-MM-DD..YYYY-MM-DD.` };
    }
    if (to < from) return { ok: false, error: `Rango al revés: "${spec}".` };
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
      return { ok: false, error: `Rango demasiado largo: máximo ${MAX_RANGE_DAYS} días.` };
    }
  } else {
    if (!parseIsoDate(spec)) {
      return {
        ok: false,
        error: `Fecha inválida: "${spec}". Usa YYYY-MM-DD, YYYY-MM-DD..YYYY-MM-DD o YYYY-MM.`,
      };
    }
    from = to = spec;
  }

  if (to < today) return { ok: false, error: `La fecha "${spec}" ya ha pasado.` };
  if (from < today) from = today;
  return { ok: true, value: { from, to } };
}

/** "2026-08-20" o "2026-08-15..2026-08-25". */
export const formatRange = (r: DateRange): string => (r.from === r.to ? r.from : `${r.from}..${r.to}`);
