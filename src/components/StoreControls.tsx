import React, { useState } from 'react';
import { Timestamp, doc, updateDoc } from 'firebase/firestore';
import { Minus, Plus } from 'lucide-react';
import { db } from '../firebase';
import type { RestaurantProfile } from '../types';
import { useStore } from '../context/StoreContext';
import { prepMinutes } from '../lib/storeStatus';
import { formatTimeLabel } from '../lib/hours';
import { friendlyError, reportError } from '../utils/errorHandling';

/** Compact operational strip for busy services (staff and above). */
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

  const surface = dark ? 'bg-[#232D23] border-white/10 text-[#FAF6F0]' : 'bg-white border-gray-200/80 text-gray-900';
  const chip = dark ? 'bg-white/10 hover:bg-white/15 text-[#FAF6F0]' : 'bg-gray-100 hover:bg-gray-200 text-gray-800';
  const muted = dark ? 'text-[#9EB09E]' : 'text-gray-500';
  const divider = dark ? 'border-white/10' : 'border-gray-100';

  return (
    <div className={`rounded-2xl border p-2.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 ${surface}`}>
      {/* Row 1 on mobile: Online Toggle + Wait Time Stepper */}
      <div className="flex items-center justify-between sm:justify-start gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => update({ isAcceptingOrders: !accepting })}
          className={`min-h-[38px] flex items-center gap-2 rounded-xl px-3.5 py-2 font-bold text-xs sm:text-sm transition whitespace-nowrap shrink-0 ${
            accepting ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
          role="switch"
          aria-checked={accepting}
        >
          <span className="w-2 h-2 rounded-full bg-white" />
          <span>{accepting ? 'Accepting orders' : 'Ordering off'}</span>
        </button>

        {/* Wait time stepper — compact & always reachable on the first row */}
        <div className="flex items-center gap-1.5 sm:hidden">
          <span className={`text-xs font-medium ${muted}`}>Wait</span>
          <button
            type="button"
            disabled={busy || prep <= 5}
            onClick={() => update({ estimatedPrepMinutes: Math.max(5, prep - 5) })}
            className={`w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 ${chip}`}
            aria-label="Shorter wait"
          >
            <Minus size={14} />
          </button>
          <span className="min-w-[44px] text-center text-xs font-bold font-mono tabular-nums">{prep}m</span>
          <button
            type="button"
            disabled={busy || prep >= 240}
            onClick={() => update({ estimatedPrepMinutes: Math.min(240, prep + 5) })}
            className={`w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 ${chip}`}
            aria-label="Longer wait"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Pause presets / Resume banner */}
      <div className={`flex items-center gap-1.5 flex-wrap pt-2 sm:pt-0 border-t sm:border-t-0 ${divider}`}>
        {paused ? (
          <div className="flex items-center justify-between sm:justify-start gap-2.5 w-full sm:w-auto">
            <span className="text-xs sm:text-sm font-semibold text-amber-500">
              Paused until {formatTimeLabel(status.pausedUntil!, status.timeZone)}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => update({ pausedUntil: null })}
              className="min-h-[34px] rounded-xl px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap shrink-0"
            >
              Resume now
            </button>
          </div>
        ) : (
          <>
            <span className={`text-xs font-medium mr-1 ${muted}`}>Pause:</span>
            {[15, 30, 60].map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy || !accepting}
                onClick={() => update({ pausedUntil: Timestamp.fromMillis(Date.now() + m * 60_000) })}
                className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums transition disabled:opacity-40 whitespace-nowrap shrink-0 ${chip}`}
              >
                {m === 60 ? '1 hr' : `${m} min`}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Desktop wait time stepper */}
      <div className="hidden sm:flex items-center gap-1.5 sm:ml-auto shrink-0">
        <span className={`text-xs font-medium mr-1 ${muted}`}>Prep time:</span>
        <button
          type="button"
          disabled={busy || prep <= 5}
          onClick={() => update({ estimatedPrepMinutes: Math.max(5, prep - 5) })}
          className={`w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 ${chip}`}
          aria-label="Shorter wait"
        >
          <Minus size={14} />
        </button>
        <span className="w-14 text-center text-sm font-bold font-mono tabular-nums">{prep} min</span>
        <button
          type="button"
          disabled={busy || prep >= 240}
          onClick={() => update({ estimatedPrepMinutes: Math.min(240, prep + 5) })}
          className={`w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 ${chip}`}
          aria-label="Longer wait"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
