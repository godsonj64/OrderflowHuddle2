/** ID helpers. Isomorphic (uses the Web Crypto API available in browsers and Node 19+). */

// No 0/O, 1/I/L: easy to read aloud at the counter.
const ORDER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomInts(count: number, max: number): number[] {
  const out: number[] = [];
  const cryptoObj = (globalThis as any).crypto as Crypto | undefined;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(count);
    cryptoObj.getRandomValues(buf);
    for (const n of buf) out.push(n % max);
  } else {
    for (let i = 0; i < count; i++) out.push(Math.floor(Math.random() * max));
  }
  return out;
}

/** Short order code such as "K7Q2XM" (31^6 ≈ 887M combinations). */
export function generateOrderCode(length = 6): string {
  return randomInts(length, ORDER_ALPHABET.length)
    .map((i) => ORDER_ALPHABET[i])
    .join('');
}

/** Random id for modifier groups / modifiers. */
export function uid(prefix = ''): string {
  const cryptoObj = (globalThis as any).crypto as Crypto | undefined;
  const raw = cryptoObj?.randomUUID ? cryptoObj.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${raw}` : raw;
}

/** Display code for an order, compatible with older orders that had no orderNumber. */
export function orderCode(order: { id: string; orderNumber?: string }): string {
  return (order.orderNumber || order.id.slice(-6)).toUpperCase();
}
