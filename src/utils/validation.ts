export const isIata = (s: string): boolean => /^[A-Za-z]{3}$/.test(s);

export const isCurrency = (s: string): boolean => /^[A-Za-z]{3}$/.test(s);

/** Valida formato YYYY-MM-DD, fecha real y que no este en el pasado. */
export function isFutureDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() + 1 !== m ||
    date.getUTCDate() !== d
  ) {
    return false;
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return date.getTime() >= todayUtc;
}

export function parsePositiveNumber(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
