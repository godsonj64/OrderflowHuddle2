/**
 * Business-hours logic shared by the storefront (display, scheduling slots) and the
 * server (enforcement at checkout). Isomorphic: no DOM or Firebase imports.
 *
 * Hours are stored as "HH:MM" strings per weekday name (e.g. businessHours.Monday).
 * They are interpreted in the restaurant's IANA time zone (profile.timezone). A closing
 * time earlier than (or equal to) the opening time means the shift runs past midnight.
 */
import type { BusinessHours, DayHours } from '../types';

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
/** JavaScript getDay() order (0 = Sunday). */
const JS_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DEFAULT_DAY_HOURS: DayHours = { open: '09:00', close: '17:00', closed: false };

const MINUTE = 60_000;
const SLOT_MINUTES = 15;

export function parseHHMM(value?: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59) return null;
  return h * 60 + m;
}

export function formatHHMM(value?: string | null): string {
  const mins = parseHHMM(value);
  if (mins === null) return value || '';
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "9 AM – 5 PM", or "Open 24 hours" when a shift covers the whole day. */
export function formatShift(open?: string, close?: string): string {
  if (open && close && open === close) return 'Open 24 hours';
  return `${formatHHMM(open)} – ${formatHHMM(close)}`;
}

/** Fills in all seven days so the stored data matches what owners see in the editor. */
export function normalizeHours(hours?: BusinessHours | null): BusinessHours {
  const result: BusinessHours = {};
  for (const day of WEEK_DAYS) {
    result[day] = { ...DEFAULT_DAY_HOURS, ...(hours?.[day] || {}) };
  }
  return result;
}

export function hasHoursConfigured(hours?: BusinessHours | null): boolean {
  return !!hours && Object.keys(hours).length > 0;
}

/** Returns the open intervals of a day in minutes since local midnight. `end` may exceed 1440 (overnight). */
export function daySlots(day?: DayHours | null): Array<[number, number]> {
  const d = day || DEFAULT_DAY_HOURS;
  if (d.closed) return [];
  const slots: Array<[number, number]> = [];
  const push = (open?: string, close?: string) => {
    const s = parseHHMM(open);
    let e = parseHHMM(close);
    if (s === null || e === null) return;
    if (e <= s) e += 1440; // runs past midnight
    slots.push([s, e]);
  };
  push(d.open, d.close);
  if (d.hasSecondSlot) push(d.open2, d.close2);
  return slots;
}

interface ZonedParts {
  weekday: number; // 0 = Sunday
  minutes: number; // minutes since local midnight
  dateKey: string; // YYYY-MM-DD in the zone
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone?: string): Intl.DateTimeFormat {
  const key = timeZone || 'local';
  let fmt = partsFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || undefined,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatters.set(key, fmt);
  }
  return fmt;
}

export function isValidTimeZone(timeZone?: string | null): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date: Date, timeZone?: string): ZonedParts {
  const tz = isValidTimeZone(timeZone) ? timeZone : undefined;
  const parts = getPartsFormatter(tz).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekdayShort = get('weekday');
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayShort);
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return {
    weekday: weekday < 0 ? date.getDay() : weekday,
    minutes: hour * 60 + minute,
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

/** True when the restaurant is inside its configured business hours at `date`. */
export function isOpenAt(hours: BusinessHours | undefined | null, date: Date, timeZone?: string): boolean {
  if (!hasHoursConfigured(hours)) return true; // No hours configured: never block orders.
  const { weekday, minutes } = zonedParts(date, timeZone);
  const today = JS_DAYS[weekday];
  const yesterday = JS_DAYS[(weekday + 6) % 7];

  for (const [s, e] of daySlots(hours?.[today])) {
    if (minutes >= s && minutes < Math.min(e, 1440)) return true;
  }
  // Overnight shift that started yesterday.
  for (const [, e] of daySlots(hours?.[yesterday])) {
    if (e > 1440 && minutes < e - 1440) return true;
  }
  return false;
}

/** Start of the next 15-minute boundary at or after `date`. Every real time zone offset is a multiple of 15 minutes. */
export function ceilToSlot(date: Date, slotMinutes = SLOT_MINUTES): Date {
  const step = slotMinutes * MINUTE;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

/** When the current open period ends (null if closed now or no hours configured). */
export function closingTimeAfter(hours: BusinessHours | undefined | null, from: Date, timeZone?: string): Date | null {
  if (!hasHoursConfigured(hours) || !isOpenAt(hours, from, timeZone)) return null;
  let t = ceilToSlot(new Date(from.getTime() + 1));
  for (let i = 0; i < 4 * 48; i++) {
    if (!isOpenAt(hours, t, timeZone)) return t;
    t = new Date(t.getTime() + SLOT_MINUTES * MINUTE);
  }
  return null; // open around the clock
}

/** Next moment the restaurant opens, searching up to 8 days ahead. */
export function nextOpeningAfter(hours: BusinessHours | undefined | null, from: Date, timeZone?: string): Date | null {
  if (!hasHoursConfigured(hours)) return null;
  let t = ceilToSlot(from);
  for (let i = 0; i < 4 * 24 * 8; i++) {
    if (isOpenAt(hours, t, timeZone)) return t;
    t = new Date(t.getTime() + SLOT_MINUTES * MINUTE);
  }
  return null;
}

export interface TimeSlot {
  /** ISO string (UTC) — what the client sends to the server. */
  iso: string;
  date: Date;
  dateKey: string;
  dayLabel: string;
  timeLabel: string;
}

const labelFormatters = new Map<string, { day: Intl.DateTimeFormat; time: Intl.DateTimeFormat }>();

function getLabelFormatters(timeZone?: string) {
  const tz = isValidTimeZone(timeZone) ? timeZone : undefined;
  const key = tz || 'local';
  let f = labelFormatters.get(key);
  if (!f) {
    f = {
      day: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }),
      time: new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }),
    };
    labelFormatters.set(key, f);
  }
  return f;
}

export function formatDayLabel(date: Date, timeZone?: string, now = new Date()): string {
  const key = zonedParts(date, timeZone).dateKey;
  if (key === zonedParts(now, timeZone).dateKey) return 'Today';
  if (key === zonedParts(new Date(now.getTime() + 24 * 60 * MINUTE), timeZone).dateKey) return 'Tomorrow';
  return getLabelFormatters(timeZone).day.format(date);
}

export function formatTimeLabel(date: Date, timeZone?: string): string {
  return getLabelFormatters(timeZone).time.format(date);
}

/** "Today · 6:30 PM" style label in the restaurant's time zone. */
export function formatSlotLabel(date: Date, timeZone?: string, now = new Date()): string {
  return `${formatDayLabel(date, timeZone, now)} · ${formatTimeLabel(date, timeZone)}`;
}

/** "Mon, Jun 1 · 6:30 PM" — stored on orders, so it must not be relative to "today". */
export function formatAbsoluteSlot(date: Date, timeZone?: string): string {
  return `${getLabelFormatters(timeZone).day.format(date)} · ${formatTimeLabel(date, timeZone)}`;
}

export interface SlotOptions {
  leadMinutes: number;
  daysAhead: number;
  notBefore?: Date | null;
  intervalMinutes?: number;
}

/** All valid pickup / delivery times between now + lead time and `daysAhead` days out. */
export function generateTimeSlots(
  hours: BusinessHours | undefined | null,
  timeZone: string | undefined,
  now: Date,
  { leadMinutes, daysAhead, notBefore, intervalMinutes = SLOT_MINUTES }: SlotOptions,
): TimeSlot[] {
  const earliest = new Date(Math.max(now.getTime() + leadMinutes * MINUTE, notBefore?.getTime() ?? 0));
  const end = now.getTime() + Math.max(1, daysAhead) * 24 * 60 * MINUTE;
  const slots: TimeSlot[] = [];
  let t = ceilToSlot(earliest, intervalMinutes);
  while (t.getTime() <= end && slots.length < 2000) {
    if (isOpenAt(hours, t, timeZone)) {
      slots.push({
        iso: t.toISOString(),
        date: t,
        dateKey: zonedParts(t, timeZone).dateKey,
        dayLabel: formatDayLabel(t, timeZone, now),
        timeLabel: formatTimeLabel(t, timeZone),
      });
    }
    t = new Date(t.getTime() + intervalMinutes * MINUTE);
  }
  return slots;
}

/** Validates a requested scheduled time on the server (same rules as generateTimeSlots). */
export function isValidScheduledTime(
  hours: BusinessHours | undefined | null,
  timeZone: string | undefined,
  requested: Date,
  now: Date,
  { leadMinutes, daysAhead, notBefore }: SlotOptions,
): string | null {
  if (Number.isNaN(requested.getTime())) return 'Please choose a valid time.';
  // Allow a small grace period: the customer may have picked the slot a few minutes ago.
  const earliest = Math.max(now.getTime() + (leadMinutes - 10) * MINUTE, notBefore?.getTime() ?? 0);
  if (requested.getTime() < earliest) return 'That time is too soon. Please pick a later time.';
  if (requested.getTime() > now.getTime() + Math.max(1, daysAhead) * 24 * 60 * MINUTE + MINUTE) {
    return `You can schedule up to ${daysAhead} day${daysAhead === 1 ? '' : 's'} ahead.`;
  }
  if (!isOpenAt(hours, requested, timeZone)) return 'The restaurant is closed at that time.';
  return null;
}
