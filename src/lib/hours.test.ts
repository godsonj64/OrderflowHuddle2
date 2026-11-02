import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BusinessHours, RestaurantProfile } from '../types';
import {
  closingTimeAfter,
  formatHHMM,
  generateTimeSlots,
  isOpenAt,
  isValidScheduledTime,
  nextOpeningAfter,
  normalizeHours,
  zonedParts,
} from './hours';
import { getStoreStatus } from './storeStatus';

const TZ = 'America/Chicago'; // UTC-5 in June (CDT)

const hours: BusinessHours = {
  Monday: { open: '11:00', close: '14:00', closed: false, hasSecondSlot: true, open2: '17:00', close2: '21:00' },
  Tuesday: { open: '11:00', close: '21:00', closed: false },
  Wednesday: { open: '11:00', close: '21:00', closed: true },
  Thursday: { open: '11:00', close: '21:00', closed: false },
  Friday: { open: '18:00', close: '02:00', closed: false }, // overnight
  Saturday: { open: '10:00', close: '22:00', closed: false },
  Sunday: { open: '10:00', close: '22:00', closed: false },
};

// 2026-06-01 is a Monday.
const at = (iso: string) => new Date(iso);

test('zoned parts respect the restaurant time zone', () => {
  const p = zonedParts(at('2026-06-01T16:30:00Z'), TZ); // 11:30 CDT
  assert.equal(p.weekday, 1);
  assert.equal(p.minutes, 11 * 60 + 30);
  assert.equal(p.dateKey, '2026-06-01');
});

test('split shifts', () => {
  assert.equal(isOpenAt(hours, at('2026-06-01T16:30:00Z'), TZ), true); // Mon 11:30
  assert.equal(isOpenAt(hours, at('2026-06-01T20:00:00Z'), TZ), false); // Mon 15:00 (between shifts)
  assert.equal(isOpenAt(hours, at('2026-06-01T23:00:00Z'), TZ), true); // Mon 18:00
  assert.equal(isOpenAt(hours, at('2026-06-02T02:00:00Z'), TZ), false); // Mon 21:00 (closing time is exclusive)
});

test('closed days', () => {
  assert.equal(isOpenAt(hours, at('2026-06-03T17:00:00Z'), TZ), false); // Wed 12:00, closed all day
});

test('overnight shifts carry into the next day', () => {
  assert.equal(isOpenAt(hours, at('2026-06-06T04:00:00Z'), TZ), true); // Fri 23:00
  assert.equal(isOpenAt(hours, at('2026-06-06T06:30:00Z'), TZ), true); // Sat 01:30 (from Friday)
  assert.equal(isOpenAt(hours, at('2026-06-06T07:00:00Z'), TZ), false); // Sat 02:00
});

test('no hours configured means always open', () => {
  assert.equal(isOpenAt(undefined, at('2026-06-03T08:00:00Z'), TZ), true);
  assert.equal(isOpenAt({}, at('2026-06-03T08:00:00Z'), TZ), true);
});

test('closing and next opening times', () => {
  const closing = closingTimeAfter(hours, at('2026-06-01T16:30:00Z'), TZ);
  assert.equal(closing?.toISOString(), '2026-06-01T19:00:00.000Z'); // 14:00 CDT
  const next = nextOpeningAfter(hours, at('2026-06-01T20:00:00Z'), TZ);
  assert.equal(next?.toISOString(), '2026-06-01T22:00:00.000Z'); // 17:00 CDT
  const afterWed = nextOpeningAfter(hours, at('2026-06-03T17:00:00Z'), TZ);
  assert.equal(afterWed?.toISOString(), '2026-06-04T16:00:00.000Z'); // Thu 11:00 CDT
});

test('time slots honour lead time and opening hours', () => {
  const now = at('2026-06-01T16:30:00Z'); // Mon 11:30
  const slots = generateTimeSlots(hours, TZ, now, { leadMinutes: 20, daysAhead: 1 });
  assert.equal(slots[0].iso, '2026-06-01T17:00:00.000Z'); // 11:50 rounded up to 12:00
  assert.equal(slots[0].dayLabel, 'Today');
  // No slots during the afternoon break.
  assert.ok(!slots.some((s) => s.iso === '2026-06-01T20:00:00.000Z'));
  // Last lunch slot is 13:45 (closing at 14:00 is exclusive).
  assert.ok(slots.some((s) => s.iso === '2026-06-01T18:45:00.000Z'));
  assert.ok(!slots.some((s) => s.iso === '2026-06-01T19:00:00.000Z'));
});

test('scheduled time validation', () => {
  const now = at('2026-06-01T16:30:00Z');
  const opts = { leadMinutes: 20, daysAhead: 7 };
  assert.equal(isValidScheduledTime(hours, TZ, at('2026-06-01T23:00:00Z'), now, opts), null);
  assert.match(isValidScheduledTime(hours, TZ, at('2026-06-01T16:35:00Z'), now, opts)!, /too soon/);
  assert.match(isValidScheduledTime(hours, TZ, at('2026-06-01T20:00:00Z'), now, opts)!, /closed/);
  assert.match(isValidScheduledTime(hours, TZ, at('2026-06-20T17:00:00Z'), now, opts)!, /up to 7 days/);
  assert.match(isValidScheduledTime(hours, TZ, new Date('nope'), now, opts)!, /valid time/);
});

test('store status: offline, paused, open, closed', () => {
  const profile: RestaurantProfile = { name: 'Huddle', isAcceptingOrders: true, businessHours: hours, timezone: TZ };
  const lunch = at('2026-06-01T16:30:00Z');
  assert.equal(getStoreStatus(profile, lunch).state, 'open');
  assert.equal(getStoreStatus(profile, lunch).canOrderNow, true);
  assert.equal(getStoreStatus({ ...profile, isAcceptingOrders: false }, lunch).state, 'offline');
  const paused = getStoreStatus({ ...profile, pausedUntil: at('2026-06-01T17:00:00Z') }, lunch);
  assert.equal(paused.state, 'paused');
  assert.equal(paused.canOrderNow, false);
  const closed = getStoreStatus({ ...profile, isSchedulePickupEnabled: true }, at('2026-06-03T17:00:00Z'));
  assert.equal(closed.state, 'closed');
  assert.equal(closed.canSchedule, true);
  assert.equal(closed.detail, 'Opens Tomorrow · 11:00 AM');
  const weekend = getStoreStatus(profile, at('2026-06-02T03:00:00Z')); // Mon 22:00 → opens Tue 11:00
  assert.equal(weekend.detail, 'Opens Tomorrow · 11:00 AM');
  const twoDays = getStoreStatus({ ...profile, businessHours: { ...hours, Tuesday: { ...hours.Tuesday, closed: true } } }, at('2026-06-02T03:00:00Z'));
  assert.equal(twoDays.detail, 'Opens Thu, Jun 4 · 11:00 AM');
});

test('server skips hours enforcement when no time zone was saved', () => {
  const profile: RestaurantProfile = { name: 'Huddle', isAcceptingOrders: true, businessHours: hours };
  const wednesday = at('2026-06-03T17:00:00Z');
  assert.equal(getStoreStatus(profile, wednesday, { assumeOpenWithoutTimezone: true }).canOrderNow, true);
});

test('formatting and normalization helpers', () => {
  assert.equal(formatHHMM('17:00'), '5 PM');
  assert.equal(formatHHMM('09:30'), '9:30 AM');
  assert.equal(formatHHMM('00:00'), '12 AM');
  const normalized = normalizeHours({ Monday: { open: '08:00', close: '12:00', closed: false } });
  assert.equal(Object.keys(normalized).length, 7);
  assert.equal(normalized.Monday.open, '08:00');
  assert.equal(normalized.Sunday.open, '09:00');
});
