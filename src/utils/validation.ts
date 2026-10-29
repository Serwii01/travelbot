export const isIata = (s: string): boolean => /^[A-Za-z]{3}$/.test(s);

export const isCurrency = (s: string): boolean => /^[A-Za-z]{3}$/.test(s);

export function parsePositiveNumber(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
