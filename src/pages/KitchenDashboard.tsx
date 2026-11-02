import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { AlertTriangle, Banknote, Ban, CalendarClock, ChefHat, CheckCircle2, Clock, Maximize, Package, Sun, Truck, Utensils } from 'lucide-react';
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

const COLUMNS: { id: OrderStatus; title: string; icon: React.ElementType; accent: string }[] = [
  { id: 'new', title: 'New', icon: Package, accent: 'border-sky-500/40' },
  { id: 'confirmed', title: 'To prepare', icon: ChefHat, accent: 'border-yellow-500/40' },
  { id: 'preparing', title: 'Cooking', icon: Utensils, accent: 'border-orange-500/40' },
  { id: 'ready', title: 'Ready', icon: CheckCircle2, accent: 'border-emerald-500/40' },
];

/** When the ticket is due: the scheduled time, or order time + prep time for ASAP orders. */
function dueTime(order: Order, prep: number): number {
  const scheduled = toDate(order.scheduledFor);
  if (scheduled) return scheduled.getTime();
  return toMillis(order.createdAt, Date.now()) + prep * 60_000;
}

function Ticket({
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
  let timerText = `${elapsed} min`;
  if (scheduled && minsToDue > 30) {
    timerCls = 'text-sky-300 bg-sky-400/10';
    timerText = `Due ${formatTimeLabel(scheduled, timeZone)}`;
  } else if (minsToDue < 0) {
    timerCls = 'text-red-300 bg-red-500/15 animate-pulse';
    timerText = `${-minsToDue} min late`;
  } else if (minsToDue <= 5) {
    timerCls = 'text-yellow-300 bg-yellow-400/10';
    timerText = scheduled ? `Due in ${minsToDue} min` : `${elapsed} min`;
  }

  const waitingForDriver = order.type === 'delivery' && order.status === 'ready';

  return (
    <article className="bg-[#0B0E0B] rounded-2xl border border-[#384738] overflow-hidden flex flex-col">
      <header className="px-3.5 py-3 bg-[#1A211A] border-b border-[#293429] flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xl font-extrabold font-mono tracking-tight text-[#F2EBE1]">#{orderCode(order)}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                order.type === 'delivery' ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
              }`}
            >
              {order.type === 'delivery' ? 'Delivery' : 'Pickup'}
            </span>
            {cashDue && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                <Banknote size={11} /> Cash {formatMoney(order.total)}
              </span>
            )}
            <span className="text-xs text-[#9BA89B] truncate max-w-[140px]">{order.customerName}</span>
          </div>
        </div>
        <span className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold tabular-nums ${timerCls}`}>
          {scheduled && minsToDue > 30 ? <CalendarClock size={13} /> : <Clock size={13} />}
          {timerText}
        </span>
      </header>

      <ul className="p-3.5 space-y-3 flex-1">
        {order.items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-[#293429] text-[#F2EBE1] font-extrabold flex items-center justify-center shrink-0">{item.quantity}</span>
            <div className="min-w-0">
              <p className="font-semibold text-[#F2EBE1] leading-tight">{item.name}</p>
              {item.selectedModifiers?.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-1">
                  {item.selectedModifiers.map((m, j) => (
                    <li key={j} className="text-[11px] font-semibold text-[#EADDC5] bg-[#384738] px-1.5 py-0.5 rounded-md">
                      {m.name}
                    </li>
                  ))}
                </ul>
              )}
              {item.prepNotes && <p className="mt-1.5 text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-md">{item.prepNotes}</p>}
            </div>
          </li>
        ))}
      </ul>

      {order.notes && (
        <div className="mx-3.5 mb-3 text-sm font-semibold text-red-200 bg-red-500/15 border border-red-500/30 rounded-xl px-3 py-2 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{order.notes}</span>
        </div>
      )}

      {step && (
        <div className="p-3.5 pt-0">
          <button
            onClick={() => onAction(order)}
            className={`w-full py-3.5 rounded-xl font-extrabold text-sm uppercase tracking-wider transition active:scale-[0.98] ${
              order.status === 'new' ? 'bg-sky-500 text-white' : order.status === 'ready' ? 'bg-emerald-500 text-white' : 'bg-[#EADDC5] text-[#0B0E0B]'
            }`}
          >
            {step.status === 'completed' && cashDue ? `Collect ${formatMoney(order.total)} & done` : waitingForDriver && order.driverName ? `Hand to ${order.driverName}` : step.label}
          </button>
          {waitingForDriver && !order.driverName && <p className="text-[11px] text-center text-[#9BA89B] mt-1.5 flex items-center justify-center gap-1"><Truck size={12} /> Waiting for a driver</p>}
        </div>
      )}
    </article>
  );
}

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
      query(collection(db, 'orders'), where('status', 'in', ['new', 'confirmed', 'preparing', 'ready'])),
      (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order)),
      (err) => reportError(err, 'kitchen-orders'),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(t);
  }, []);

  const byColumn = useMemo(() => {
    const map = new Map<OrderStatus, Order[]>();
    for (const c of COLUMNS) map.set(c.id, []);
    for (const o of orders) map.get(o.status)?.push(o);
    for (const list of map.values()) list.sort((a, b) => dueTime(a, prep) - dueTime(b, prep));
    return map;
  }, [orders, prep]);

  const onAction = (order: Order) => {
    const step = nextStep(order);
    if (!step) return;
    if (step.status === 'completed' && isCashDue(order)) {
      setCashOrder(order);
      return;
    }
    actions.setStatus(order, step.status);
  };

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
    <div className="bg-[#0B0E0B] text-[#F2EBE1] min-h-[calc(100dvh-104px)] p-3 sm:p-5 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Kitchen</h1>
          <p className="text-sm text-[#9BA89B]">{orders.length} open tickets · target {prep} min</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStockOpen(true)} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold bg-[#293429] hover:bg-[#384738]">
            <Ban size={16} /> Sold out {soldOutCount > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 text-xs">{soldOutCount}</span>}
          </button>
          {wake.supported && (
            <button onClick={wake.toggle} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${wake.on ? 'bg-emerald-600 text-white' : 'bg-[#293429] hover:bg-[#384738]'}`}>
              <Sun size={16} /> {wake.on ? 'Screen stays on' : 'Keep screen on'}
            </button>
          )}
          <button onClick={fullscreen} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold bg-[#293429] hover:bg-[#384738]" aria-label="Full screen">
            <Maximize size={16} />
          </button>
        </div>
      </div>

      <StoreControls dark />

      {/* Phones: one column at a time */}
      <div className="lg:hidden flex gap-1.5 overflow-x-auto hide-scrollbar">
        {COLUMNS.map((c) => {
          const n = byColumn.get(c.id)?.length || 0;
          return (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold ${tab === c.id ? 'bg-[#EADDC5] text-[#0B0E0B]' : 'bg-[#1A211A] text-[#F2EBE1]'}`}
            >
              {c.title}
              <span className={`min-w-5 px-1.5 rounded-full text-xs ${n && c.id === 'new' ? 'bg-red-500 text-white' : 'bg-black/20'}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        {COLUMNS.map((col) => {
          const list = byColumn.get(col.id) || [];
          const Icon = col.icon;
          return (
            <section key={col.id} className={`${tab === col.id ? '' : 'hidden'} lg:block bg-[#1A211A] rounded-2xl border ${col.accent} p-2.5 sm:p-3`}>
              <h2 className="hidden lg:flex items-center gap-2 px-1 pb-3 font-bold">
                <Icon size={18} /> {col.title} <span className="ml-auto text-xs text-[#9BA89B]">{list.length}</span>
              </h2>
              <div className="space-y-3">
                {list.length === 0 ? (
                  <p className="text-center text-sm text-[#6B7D6B] border border-dashed border-[#384738] rounded-xl py-8">No tickets</p>
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
              Collect <strong className="text-gray-900 text-base">{formatMoney(cashOrder.total)}</strong> from {cashOrder.customerName || 'the customer'} before handing over order #{orderCode(cashOrder)}.
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
