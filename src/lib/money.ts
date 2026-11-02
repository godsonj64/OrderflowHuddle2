/**
 * Money helpers. All arithmetic is done in integer cents to avoid floating point drift
 * (e.g. 0.1 + 0.2). Amounts are still stored in Firestore as dollars with 2 decimals.
 *
 * This module is isomorphic: it is used by the browser and by server.ts.
 */

/** Converts a dollar amount to integer cents (robust against values like 1.005). */
export function toCents(amount: unknown): number {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Number((n * 100).toFixed(4)));
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Rounds a dollar amount to whole cents. */
export function roundMoney(amount: unknown): number {
  return fromCents(toCents(amount));
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | undefined | null, currency = 'USD'): string {
  const key = currency;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    formatters.set(key, fmt);
  }
  return fmt.format(roundMoney(amount ?? 0));
}

/**
 * Parses user input from a number field. Empty / invalid input becomes `fallback`
 * instead of NaN (NaN would be written to Firestore as null and break validation).
 */
export function parseAmount(value: string, fallback = 0, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  if (value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
