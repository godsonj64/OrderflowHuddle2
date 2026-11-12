import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import type { Order } from '../types';
import { orderCode } from '../lib/ids';
import { formatMoney } from '../lib/money';
import { toMillis } from '../lib/dates';
import { reportError } from '../utils/errorHandling';

const SOUND_KEY = 'orderflow_admin_sound';
const REMINDER_MS = 45_000;

let audioCtx: AudioContext | null = null;

function getAudio(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = Ctor ? new Ctor() : null;
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** A short, bright three-note chime generated with Web Audio (no audio files needed). */
export function playChime() {
  const ctx = getAudio();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  const start = ctx.currentTime + 0.02;
  [880, 1174.66, 1567.98].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = start + i * 0.16;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.55);
  });
}

function readSoundPref() {
  try {
    return localStorage.getItem(SOUND_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Watches for new (not yet accepted) orders. Plays a chime, vibrates, shows a toast and
 * keeps a count in the browser tab title. While orders stay unaccepted the chime repeats.
 */
export function useNewOrderAlerts(enabled: boolean) {
  const [newOrders, setNewOrders] = useState<Order[]>([]);
  const [soundOn, setSoundOn] = useState(readSoundPref);
  const soundRef = useRef(soundOn);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    if (!enabled) return;
    const unsub = onSnapshot(
      query(collection(db, 'orders'), where('status', '==', 'new')),
      (snap) => {
        const orders = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Order)
          .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
        setNewOrders(orders);
        if (seen.current === null) {
          seen.current = new Set(orders.map((o) => o.id));
          return;
        }
        const fresh = orders.filter((o) => !seen.current!.has(o.id));
        fresh.forEach((o) => seen.current!.add(o.id));
        if (!fresh.length) return;
        if (soundRef.current) playChime();
        navigator.vibrate?.([200, 100, 200]);
        for (const o of fresh) {
          const pay = o.paymentMethod === 'cash' ? ' · cash' : '';
          toast(`New ${o.type} order #${orderCode(o)} · ${formatMoney(o.total)}${pay}`, { duration: 8000, id: `new-${o.id}` });
        }
      },
      (err) => reportError(err, 'order-alerts', { toast: false }),
    );
    return () => {
      unsub();
      seen.current = null;
    };
  }, [enabled]);

  // Reminder chime while orders wait to be accepted.
  useEffect(() => {
    if (!enabled || !newOrders.length) return;
    const timer = window.setInterval(() => {
      if (soundRef.current) playChime();
    }, REMINDER_MS);
    return () => window.clearInterval(timer);
  }, [enabled, newOrders.length]);

  // "(2) Dashboard" in the tab title.
  useEffect(() => {
    if (!enabled) return;
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = newOrders.length ? `(${newOrders.length}) ${base}` : base;
  }, [enabled, newOrders.length]);

  // Browsers only allow audio after a user gesture: unlock it on the first tap.
  useEffect(() => {
    if (!soundOn) return;
    const unlock = () => getAudio()?.resume().catch(() => undefined);
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [soundOn]);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      if (next) playChime();
      return next;
    });
  }, []);

  return { newOrders, soundOn, toggleSound };
}
