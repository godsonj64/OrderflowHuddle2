import React, { useState } from 'react';
import { Timestamp, doc, updateDoc } from 'firebase/firestore';
import { Minus, Pause, Play, Plus, Power } from 'lucide-react';
import { db } from '../firebase';
import type { RestaurantProfile } from '../types';
import { useStore } from '../context/StoreContext';
import { prepMinutes } from '../lib/storeStatus';
import { formatTimeLabel } from '../lib/hours';
import { friendlyError, reportError } from '../utils/errorHandling';

/** One-tap operational controls for busy services (staff and above). */
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

  const surface = dark ? 'bg-[#1A211A] border-[#293429] text-[#F2EBE1]' : 'bg-white border-gray-100 text-gray-900';
  const chip = dark ? 'bg-[#293429] hover:bg-[#384738] text-[#F2EBE1]' : 'bg-gray-100 hover:bg-gray-200 text-gray-800';
  const muted = dark ? 'text-[#9BA89B]' : 'text-gray-500';

  return (
    <div className={`rounded-3xl border p-3 sm:p-4 flex flex-col lg:flex-row gap-3 lg:items-center ${surface}`}>
      <button
        type="button"
        disabled={busy}
        onClick={() => update({ isAcceptingOrders: !accepting })}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold text-sm transition ${
          accepting ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}
        role="switch"
        aria-checked={accepting}
      >
        <Power size={18} />
        <span className="text-left">
          <span className="block">{accepting ? 'Accepting orders' : 'Online ordering OFF'}</span>
          <span className="block text-[11px] font-medium opacity-85">Tap to {accepting ? 'stop' : 'start'} taking orders</span>
        </span>
      </button>

      <div className="flex items-center gap-2 flex-wrap">
        {paused ? (
          <>
            <span className="text-sm font-semibold text-amber-500 flex items-center gap-1.5">
              <Pause size={16} /> Paused until {formatTimeLabel(status.pausedUntil!, status.timeZone)}
            </span>
            <button type="button" disabled={busy} onClick={() => update({ pausedUntil: null })} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold bg-emerald-600 text-white">
              <Play size={15} /> Resume now
            </button>
          </>
        ) : (
          <>
            <span className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Busy? Pause</span>
            {[15, 30, 60].map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy || !accepting}
                onClick={() => update({ pausedUntil: Timestamp.fromMillis(Date.now() + m * 60_000) })}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-40 ${chip}`}
              >
                {m === 60 ? '1 hr' : `${m} min`}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 lg:ml-auto">
        <span className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Wait time</span>
        <button type="button" disabled={busy || prep <= 5} onClick={() => update({ estimatedPrepMinutes: Math.max(5, prep - 5) })} className={`p-2 rounded-xl disabled:opacity-40 ${chip}`} aria-label="Shorter wait">
          <Minus size={15} />
        </button>
        <span className="w-16 text-center font-bold tabular-nums">{prep} min</span>
        <button type="button" disabled={busy || prep >= 240} onClick={() => update({ estimatedPrepMinutes: Math.min(240, prep + 5) })} className={`p-2 rounded-xl disabled:opacity-40 ${chip}`} aria-label="Longer wait">
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
