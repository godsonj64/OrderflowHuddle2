import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Maximize, Sun } from 'lucide-react';
import { db } from '../firebase';
import type { Order, OrderStatus } from '../types';
import { useStore } from '../context/StoreContext';
import { useOrderActions } from '../hooks/useOrderActions';
import { StoreControls } from '../components/StoreControls';
import { ConfirmDialog, Sheet, Toggle } from '../components/ui';
import { orderCode } from '../lib/ids';
import { formatMoney } from '../lib/money';
import { toDate, toMillis } from '../lib/dates';
import { isCashDue, nextStep } from '../lib/orderStatus';
import { formatTimeLabel } from '../lib/hours';
import { prepMinutes } from '../lib/storeStatus';
import { friendlyError, reportError } from '../utils/errorHandling';

const COLUMNS: { id: OrderStatus; title: string; shortTitle: string; accent: string }[] = [
  { id: 'new', title: 'New', shortTitle: 'New', accent: 'border-sky-500/35' },
  { id: 'confirmed', title: 'To prepare', shortTitle: 'Prep', accent: 'border-yellow-500/35' },
  { id: 'preparing', title: 'Cooking', shortTitle: 'Cooking', accent: 'border-orange-500/35' },
  { id: 'ready', title: 'Ready', shortTitle: 'Ready', accent: 'border-emerald-500/35' },
];

/** When the ticket is due: the scheduled time, or order time + prep time for ASAP orders. */
function dueTime(order: Order, prep: number): number {
  const scheduled = toDate(order.scheduledFor);
  if (scheduled) return scheduled.getTime();
  return toMillis(order.createdAt, Date.now()) + prep * 60_000;
}

const Ticket = React.memo(function Ticket({
  order,
  now,
  prep,
  timeZone,
  onAction,
}: {
  order: Order;
  now: number;
  prep: number;
  timeZone?: string;
  onAction: (order: Order) => void;
}) {
  const step = nextStep(order);
  const cashDue = isCashDue(order);
  const scheduled = toDate(order.scheduledFor);
  const due = dueTime(order, prep);
  const minsToDue = Math.round((due - now) / 60_000);
  const elapsed = Math.max(0, Math.floor((now - toMillis(order.createdAt, now)) / 60_000));

  let timerCls = 'text-emerald-300 bg-emerald-400/10';
  let timerText = `${elapsed}m`;
  if (scheduled && minsToDue > 30) {
    timerCls = 'text-sky-300 bg-sky-400/10';
    timerText = `Due ${formatTimeLabel(scheduled, timeZone)}`;
  } else if (minsToDue < 0) {
    timerCls = 'text-red-300 bg-red-500/20';
    timerText = `${-minsToDue}m late`;
  } else if (minsToDue <= 5) {
    timerCls = 'text-yellow-300 bg-yellow-400/15';
    timerText = scheduled ? `In ${minsToDue}m` : `${elapsed}m`;
  }

  const waitingForDriver = order.type === 'delivery' && order.status === 'ready';

  return (
    <article className="bg-[#151B15] rounded-2xl border border-white/10 overflow-hidden flex flex-col">
      <header className="px-3.5 py-3 bg-[#232D23] flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-extrabold font-mono tabular-nums tracking-tight">#{orderCode(order)}</h3>
          <p className="text-xs text-[#9EB09E] mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className={order.type === 'delivery' ? 'text-sky-300 font-semibold' : 'text-emerald-300 font-semibold'}>
              {order.type === 'delivery' ? 'Delivery' : 'Pickup'}
            </span>
            {cashDue && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-300 font-semibold tabular-nums">Cash {formatMoney(order.total)}</span>
              </>
            )}
            {order.customerName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-[130px]">{order.customerName}</span>
              </>
            )}
          </p>
        </div>
        <span className={`shrink-0 px-2 py-1 rounded-lg text-xs font-bold font-mono tabular-nums ${timerCls}`}>
          {timerText}
        </span>
      </header>

      <ul className="p-3.5 space-y-2.5 flex-1">
        {order.items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-[#232D23] text-[#FAF6F0] font-mono tabular-nums text-xs font-extrabold flex items-center justify-center shrink-0">
              {item.quantity}×
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-[#FAF6F0] leading-snug">{item.name}</p>
              {item.selectedModifiers?.length > 0 && (
                <p className="mt-0.5 text-xs text-[#D8CBB8] leading-relaxed">
                  {item.selectedModifiers.map((m) => m.name).join(' · ')}
                </p>
              )}
              {item.prepNotes && (
                <p className="mt-1 text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-md">
                  “{item.prepNotes}”
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {order.notes && (
        <div className="mx-3.5 mb-3 text-xs font-semibold text-red-200 bg-red-500/15 border border-red-500/30 rounded-xl px-3 py-2">
          Note: {order.notes}
        </div>
      )}

      {step && (
        <div className="p-3.5 pt-0">
          <button
            onClick={() => onAction(order)}
            className={`w-full min-h-[44px] py-3 rounded-xl font-extrabold text-xs sm:text-sm uppercase tracking-wider transition active:scale-[0.98] ${
              order.status === 'new'
                ? 'bg-sky-500 hover:bg-sky-600 text-white'
                : order.status === 'ready'
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-[#EADDC5] hover:bg-[#D8CBB8] text-[#151B15]'
            }`}
          >
            {step.status === 'completed' && cashDue ? `Collect ${formatMoney(order.total)} & done` : waitingForDriver && order.driverName ? `Hand to ${order.driverName}` : step.label}
          </button>
          {waitingForDriver && !order.driverName && <p className="text-[11px] text-center text-[#9EB09E] mt-1.5">Waiting for driver assignment</p>}
        </div>
      )}
    </article>
  );
});

function useWakeLock() {
  const [wanted, setWanted] = useState(false);
  const lock = useRef<any>(null);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!wanted || !supported) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock.current = await (navigator as any).wakeLock.request('screen');
      } catch {
        if (!cancelled) setWanted(false);
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock.current?.release?.().catch(() => undefined);
      lock.current = null;
    };
  }, [wanted, supported]);

  return { supported, on: wanted, toggle: () => setWanted((w) => !w) };
}

export const KitchenDashboard: React.FC = () => {
  const { profile, items, categories, status } = useStore();
  const actions = useOrderActions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<OrderStatus>('new');
  const [stockOpen, setStockOpen] = useState(false);
  const [cashOrder, setCashOrder] = useState<Order | null>(null);
  const wake = useWakeLock();
  const prep = prepMinutes(profile);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'orders'), where('status', 'in', ['new', 'confirmed', 'preparing', 'ready']), limit(200)),
      (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order)),
      (err) => reportError(err, 'kitchen-orders'),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setNow(Date.now());
      }
    };
    const t = window.setInterval(tick, 10_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const byColumn = useMemo(() => {
    const map = new Map<OrderStatus, Order[]>();
    for (const c of COLUMNS) map.set(c.id, []);
    for (const o of orders) map.get(o.status)?.push(o);
    for (const list of map.values()) list.sort((a, b) => dueTime(a, prep) - dueTime(b, prep));
    return map;
  }, [orders, prep]);

  const onAction = useCallback(
    (order: Order) => {
      const step = nextStep(order);
      if (!step) return;
      if (step.status === 'completed' && isCashDue(order)) {
        setCashOrder(order);
        return;
      }
      actions.setStatus(order, step.status);
    },
    [actions],
  );

  const toggleSoldOut = async (id: string, value: boolean) => {
    try {
      await updateDoc(doc(db, 'items', id), { isSoldOut: value });
      toast.success(value ? 'Marked sold out' : 'Back in stock', { id: `stock-${id}` });
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const activeCategories = categories.filter((c) => c.active !== false);
  const soldOutCount = items.filter((i) => i.active && i.isSoldOut).length;

  return (
    <div className="bg-[#151B15] text-[#FAF6F0] min-h-[calc(100dvh-56px)] p-3 sm:p-5 lg:p-6 space-y-3.5">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Kitchen display</h1>
          <p className="text-xs sm:text-sm text-[#9EB09E] tabular-nums">{orders.length} open tickets · target {prep} min</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStockOpen(true)}
            className="min-h-[40px] flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold bg-[#232D23] hover:bg-[#374437] transition whitespace-nowrap"
          >
            <span>86 / Sold out</span>
            {soldOutCount > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[11px] font-mono tabular-nums">{soldOutCount}</span>}
          </button>
          {wake.supported && (
            <button
              onClick={wake.toggle}
              className={`min-h-[40px] flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
                wake.on ? 'bg-emerald-600 text-white' : 'bg-[#232D23] hover:bg-[#374437]'
              }`}
            >
              <Sun size={15} />
              <span className="hidden sm:inline">{wake.on ? 'Screen awake' : 'Keep awake'}</span>
            </button>
          )}
          <button
            onClick={fullscreen}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#232D23] hover:bg-[#374437] transition"
            aria-label="Full screen"
          >
            <Maximize size={15} />
          </button>
        </div>
      </div>

      <StoreControls dark />

      {/* Phones: 4-column segmented stage switcher — all stages visible at once */}
      <div className="lg:hidden grid grid-cols-4 gap-1 p-1 bg-[#232D23] rounded-xl">
        {COLUMNS.map((c) => {
          const n = byColumn.get(c.id)?.length || 0;
          const active = tab === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`min-h-[40px] flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition whitespace-nowrap ${
                active ? 'bg-[#EADDC5] text-[#151B15] shadow-xs' : 'text-[#9EB09E] hover:text-[#FAF6F0]'
              }`}
            >
              <span>{c.shortTitle}</span>
              <span
                className={`min-w-4 h-4 px-1 rounded-full text-[10px] font-mono tabular-nums flex items-center justify-center ${
                  n && c.id === 'new' ? 'bg-red-500 text-white' : active ? 'bg-[#151B15]/20 text-[#151B15]' : 'bg-white/10 text-[#FAF6F0]'
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3.5 items-start">
        {COLUMNS.map((col) => {
          const list = byColumn.get(col.id) || [];
          return (
            <section key={col.id} className={`${tab === col.id ? '' : 'hidden'} lg:block bg-[#232D23]/60 rounded-2xl border ${col.accent} p-3`}>
              <h2 className="hidden lg:flex items-center justify-between px-1 pb-3 text-sm font-bold tracking-wide">
                <span>{col.title}</span>
                <span className="text-xs font-mono tabular-nums text-[#9EB09E]">{list.length}</span>
              </h2>
              <div className="space-y-3">
                {list.length === 0 ? (
                  <p className="text-center text-xs text-[#6B7D6B] border border-dashed border-white/10 rounded-xl py-8">No tickets in {col.title.toLowerCase()}</p>
                ) : (
                  list.map((o) => <Ticket key={o.id} order={o} now={now} prep={prep} timeZone={status.timeZone} onAction={onAction} />)
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet open={stockOpen} onClose={() => setStockOpen(false)} surface="admin" title="Sold out today" size="md">
        <div className="p-5 space-y-5">
          <p className="text-sm text-gray-500">Sold-out items stay on the menu but can't be ordered. Turn them back on when restocked.</p>
          {activeCategories.map((cat) => {
            const list = items.filter((i) => i.categoryId === cat.id && i.active);
            if (!list.length) return null;
            return (
              <div key={cat.id}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">{cat.name}</h3>
                <div className="divide-y divide-gray-100">
                  {list.map((item) => (
                    <Toggle key={item.id} label={item.name} description={item.isSoldOut ? 'Sold out' : 'Available'} checked={!item.isSoldOut} onChange={(available) => toggleSoldOut(item.id, !available)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!cashOrder}
        title="Collect cash"
        message={
          cashOrder && (
            <>
              Collect <strong className="text-gray-900 text-base font-mono tabular-nums">{formatMoney(cashOrder.total)}</strong> from {cashOrder.customerName || 'the customer'} before handing over order #{orderCode(cashOrder)}.
            </>
          )
        }
        confirmLabel="Cash received · Done"
        onCancel={() => setCashOrder(null)}
        onConfirm={async () => {
          if (cashOrder) await actions.markCashPaid(cashOrder, true);
          setCashOrder(null);
        }}
      />
    </div>
  );
};
