/**
 * Normalizes the many shapes a timestamp can take in this app: Firestore client
 * Timestamps, firebase-admin Timestamps, `{ seconds, nanoseconds }` objects,
 * Dates, ISO strings and epoch milliseconds.
 */
export function toDate(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function toMillis(value: any, fallback = 0): number {
  return toDate(value)?.getTime() ?? fallback;
}

export function formatDateTime(value: any, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  const d = toDate(value);
  return d ? new Intl.DateTimeFormat('en-US', opts).format(d) : '';
}

export function timeAgo(value: any, now = Date.now()): string {
  const ms = toMillis(value, now);
  const mins = Math.max(0, Math.round((now - ms) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
