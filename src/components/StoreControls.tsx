import React, { useState } from 'react';
import { Timestamp, doc, updateDoc } from 'firebase/firestore';
import { Clock, Minus, PauseCircle, Plus } from 'lucide-react';
import { db } from '../firebase';
import type { RestaurantProfile } from '../types';
import { useStore } from '../context/StoreContext';
import { prepMinutes } from '../lib/storeStatus';
import { formatTimeLabel } from '../lib/hours';
import { friendlyError, reportError } from '../utils/errorHandling';

/** Sleek, compact operational command bar for busy services (staff and above). */
export function StoreControls({ dark = false }: { dark?: boolean }) {
  const { profile, status } = useStore();
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  const update = async (patch: Partial<RestaurantProfile>) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'restaurant', 'profile'), patch as Record<string, unknown>);
    } catch (err) {
      reportError(err, 'store-controls', { message: friendlyError(err, 'Could not update the store.') });
    } finally {
      setBusy(false);
    }
  };

  const prep = prepMinutes(profile);
  const paused = status.state === 'paused';
  const accepting = profile.isAcceptingOrders;

  const surface = dark
    ? 'bg-[#111715] border-[#222E29] text-[#F1F5F3]'
    : 'bg-white border-gray-200/80 text-gray-900 shadow-[0_2px_10px_rgba(15,23,42,0.03)]';
  const stepperShell = dark
    ? 'bg-[#18211E] border-[#26332E]'
    : 'bg-gray-50 border-gray-200/80';
  const stepperBtn = dark
    ? 'hover:bg-[#222E29] text-[#F1F5F3]'
    : 'hover:bg-white hover:shadow-2xs text-gray-700';
  const pauseChip = dark
    ? 'bg-[#18211E] hover:bg-[#222E29] text-[#CBD5D0] border border-[#26332E]'
    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200/80';
  const muted = dark ? 'text-[#8C9E95]' : 'text-gray-500';
  const divider = dark ? 'border-[#1E2A25]' : 'border-gray-100';

  return (
    <div className={`rounded-2xl border p-2.5 sm:px-4 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 font-sans ${surface}`}>
      {/* Primary Row: Accepting Orders Switch + Integrated Wait Stepper */}
      <div className="flex items-center justify-between sm:justify-start gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => update({ isAcceptingOrders: !accepting })}
          className={`h-9 flex items-center gap-2 rounded-xl px-3.5 font-semibold text-xs sm:text-sm transition whitespace-nowrap shrink-0 shadow-2xs ${
            accepting
              ? 'bg-gradient-to-b from-[#2E825B] to-[#236646] hover:from-[#287350] hover:to-[#1E5A3E] text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
          role="switch"
          aria-checked={accepting}
        >
          <span className={`w-2 h-2 rounded-full bg-white ${accepting ? 'animate-pulse' : 'opacity-80'}`} />
          <span>{accepting ? 'Accepting orders' : 'Ordering off'}</span>
        </button>

        {/* Compact Wait Time Stepper */}
        <div className={`h-9 inline-flex items-center gap-1 rounded-xl border px-1.5 ${stepperShell}`}>
          <Clock size={13} className={`ml-1 shrink-0 ${muted}`} />
          <span className={`text-[11px] font-medium mr-0.5 ${muted}`}>Wait</span>
          <button
            type="button"
            disabled={busy || prep <= 5}
            onClick={() => update({ estimatedPrepMinutes: Math.max(5, prep - 5) })}
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition disabled:opacity-35 ${stepperBtn}`}
            aria-label="Shorter wait"
          >
            <Minus size={13} />
          </button>
          <span className="min-w-[38px] text-center text-xs sm:text-sm font-display font-bold tabular-nums">
            {prep}m
          </span>
          <button
            type="button"
            disabled={busy || prep >= 240}
            onClick={() => update({ estimatedPrepMinutes: Math.min(240, prep + 5) })}
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition disabled:opacity-35 ${stepperBtn}`}
            aria-label="Longer wait"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Quick Pause Strip / Active Pause Banner */}
      <div className={`flex items-center justify-between sm:justify-end gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 ${divider}`}>
        {paused ? (
          <div className="flex items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto">
            <span className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
              <PauseCircle size={14} />
              Paused until {formatTimeLabel(status.pausedUntil!, status.timeZone)}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => update({ pausedUntil: null })}
              className="h-8 rounded-lg px-3 text-xs font-bold bg-[#287350] hover:bg-[#1E5A3E] text-white whitespace-nowrap shrink-0 transition"
            >
              Resume now
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-1.5">
            <span className={`text-[11px] font-medium flex items-center gap-1 mr-1 ${muted}`}>
              <PauseCircle size={13} />
              Quick pause
            </span>
            <div className="flex items-center gap-1.5">
              {[
                { mins: 15, label: '15m' },
                { mins: 30, label: '30m' },
                { mins: 60, label: '1h' },
              ].map(({ mins, label }) => (
                <button
                  key={mins}
                  type="button"
                  disabled={busy || !accepting}
                  onClick={() => update({ pausedUntil: Timestamp.fromMillis(Date.now() + mins * 60_000) })}
                  className={`h-7 rounded-lg px-2.5 text-xs font-display font-semibold tabular-nums transition disabled:opacity-40 whitespace-nowrap shrink-0 ${pauseChip}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
