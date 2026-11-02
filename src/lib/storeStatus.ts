/**
 * Whether the restaurant can take orders right now, shared by the storefront and the
 * server. Isomorphic.
 */
import type { RestaurantProfile } from '../types';
import { toDate } from './dates';
import {
  closingTimeAfter,
  formatSlotLabel,
  formatTimeLabel,
  hasHoursConfigured,
  isOpenAt,
  isValidTimeZone,
  nextOpeningAfter,
} from './hours';

export type StoreState = 'open' | 'closed' | 'paused' | 'offline';

export interface StoreStatus {
  state: StoreState;
  /** Short badge text, e.g. "Open now". */
  badge: string;
  /** Detail, e.g. "Until 9 PM" or "Opens Tomorrow · 11:00 AM". */
  detail: string;
  /** ASAP orders are accepted. */
  canOrderNow: boolean;
  /** Orders can be scheduled for a later time. */
  canSchedule: boolean;
  pausedUntil: Date | null;
  timeZone?: string;
}

export interface StoreStatusOptions {
  /**
   * The server runs in UTC. If the owner has not saved a time zone yet we cannot know
   * what "9 AM" means, so the server skips hours enforcement instead of rejecting
   * orders during real opening hours.
   */
  assumeOpenWithoutTimezone?: boolean;
}

export const DEFAULT_PREP_MINUTES = 20;
export const DEFAULT_SCHEDULE_DAYS = 7;

export function prepMinutes(profile?: RestaurantProfile | null): number {
  const n = Number(profile?.estimatedPrepMinutes);
  return Number.isFinite(n) && n > 0 ? Math.min(240, Math.round(n)) : DEFAULT_PREP_MINUTES;
}

export function scheduleDaysAhead(profile?: RestaurantProfile | null): number {
  const n = Number(profile?.scheduleDaysAhead);
  return Number.isFinite(n) && n >= 1 ? Math.min(30, Math.round(n)) : DEFAULT_SCHEDULE_DAYS;
}

export function effectiveHours(profile: RestaurantProfile | null | undefined, options: StoreStatusOptions = {}) {
  const tz = isValidTimeZone(profile?.timezone) ? profile!.timezone : undefined;
  if (!tz && options.assumeOpenWithoutTimezone) return { hours: undefined, timeZone: undefined };
  return { hours: profile?.businessHours, timeZone: tz };
}

export function getStoreStatus(
  profile: RestaurantProfile | null | undefined,
  now: Date = new Date(),
  options: StoreStatusOptions = {},
): StoreStatus {
  if (!profile) {
    return { state: 'offline', badge: 'Unavailable', detail: '', canOrderNow: false, canSchedule: false, pausedUntil: null };
  }
  const { hours, timeZone } = effectiveHours(profile, options);
  const scheduling = !!profile.isSchedulePickupEnabled;

  if (!profile.isAcceptingOrders) {
    return {
      state: 'offline',
      badge: 'Not taking orders',
      detail: 'Online ordering is paused right now',
      canOrderNow: false,
      canSchedule: false,
      pausedUntil: null,
      timeZone,
    };
  }

  const pausedUntil = toDate(profile.pausedUntil);
  const isPaused = !!pausedUntil && pausedUntil.getTime() > now.getTime();
  const openNow = isOpenAt(hours, now, timeZone);

  if (isPaused) {
    return {
      state: 'paused',
      badge: 'Busy',
      detail: `Taking orders again at ${formatTimeLabel(pausedUntil!, timeZone)}`,
      canOrderNow: false,
      canSchedule: scheduling,
      pausedUntil,
      timeZone,
    };
  }

  if (openNow) {
    const closing = closingTimeAfter(hours, now, timeZone);
    return {
      state: 'open',
      badge: 'Open now',
      detail: closing ? `Until ${formatTimeLabel(closing, timeZone)}` : '',
      canOrderNow: true,
      canSchedule: scheduling,
      pausedUntil: null,
      timeZone,
    };
  }

  const next = hasHoursConfigured(hours) ? nextOpeningAfter(hours, now, timeZone) : null;
  return {
    state: 'closed',
    badge: 'Closed',
    detail: next ? `Opens ${formatSlotLabel(next, timeZone, now)}` : '',
    canOrderNow: false,
    canSchedule: scheduling,
    pausedUntil: null,
    timeZone,
  };
}
