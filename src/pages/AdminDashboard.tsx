import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Timestamp, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { BarChart3, ClipboardList, Clock, MapPin, Phone, Search, User } from 'lucide-react';
import { db } from '../firebase';
import type { Order } from '../types';
import { useAuth } from '../context/AuthContext';
import { useOrderActions } from '../hooks/useOrderActions';
import { StoreControls } from '../components/StoreControls';
import { ConfirmDialog, PageSpinner, Sheet, Spinner, adminInput } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatMoney, fromCents, toCents } from '../lib/money';
import { orderCode } from '../lib/ids';
import { formatDateTime, timeAgo, toMillis } from '../lib/dates';
import { ACTIVE_STATUSES, STATUS_LABEL, STATUS_STYLE, isCashDue, nextStep, paymentSummary } from '../lib/orderStatus';
import { reportError } from '../utils/errorHandling';

const AdminFinancials = lazy(() => import('../components/AdminFinancials').then((m) => ({ default: m.AdminFinancials })));

type Filter = 'active' | 'completed' | 'cancelled' | 'unpaid' | 'all';
type ViewMode = 'orders' | 'insights';

const PAGE_SIZE = 40;

/** "Size: Double · Extras: Extra cheese, Bacon" */
function groupModifiers(mods: Order['items'][number]['selectedModifiers']): string {
  const groups = new Map<string, string[]>();
  for (const m of mods) {
    const key = m.groupName || '';
    groups.set(key, [...(groups.get(key) || []), m.name]);
  }
  return [...groups.entries()].map(([g, names]) => (g ? `${g}: ${names.join(', ')}` : names.join(', '))).join(' · ');
}

interface CardProps {
  order: Order;
  isManager: boolean;
  onAdvance: (order: Order) => void;
  onCollectCash: (order: Order) => void;
  onUndoCash: (order: Order) => void;
  onCancel: (order: Order) => void;
  onRefund: (order: Order) => void;
  onCheckPayment: (order: Order) => void;
}

const OrderCard = React.memo<CardProps>(function OrderCard({
  order,
  isManager,
  onAdvance,
  onCollectCash,
  onUndoCash,
  onCancel,
  onRefund,
  onCheckPayment,
}) {
  const step = nextStep(order);
  const pay = paymentSummary(order);
  const cashDue = isCashDue(order);
  const canRefund =
    isManager && order.paymentMethod !== 'cash' && !!order.paymentIntentId && !order.paymentIntentId.startsWith('mock_') && ['paid', 'partially_refunded'].includes(order.paymentStatus || '');
  const scheduled = order.scheduledTime;

  const payBadgeCls =
    pay.tone === 'good'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
      : pay.tone === 'warn'
        ? 'bg-amber-50 text-amber-800 border-amber-200/90'
        : pay.tone === 'bad'
          ? 'bg-red-50 text-red-700 border-red-200/80'
          : 'bg-gray-50 text-gray-600 border-gray-200/80';

  return (
    <article className="bg-white rounded-2xl border border-gray-200/80 shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-4 sm:p-5 flex flex-col gap-3.5 transition hover:border-gray-300/90">
      {/* Ticket Header: Order ID + Status Badge on Left, Price + Payment Pill on Right */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-extrabold text-lg sm:text-xl tracking-tight text-gray-900 tabular-nums">
              #{orderCode(order)}
            </h3>
            <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wider ${STATUS_STYLE[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                order.type === 'delivery' ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-700'
              }`}
            >
              {order.type === 'delivery' ? 'Delivery' : 'Pickup'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1 font-semibold text-gray-900 text-xs sm:text-sm">
              <User size={13} className="text-gray-400 shrink-0" />
              {order.customerName || 'Guest'}
            </span>
            <span className="inline-flex items-center gap-1 text-gray-400 font-medium">
              <Clock size={12} className="shrink-0" />
              {timeAgo(order.createdAt)}
            </span>
            {order.customerPhone && (
              <a
                href={`tel:${order.customerPhone}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-gray-200/80 text-gray-700 font-display font-semibold tabular-nums text-xs transition"
              >
                <Phone size={11} className="text-gray-500" />
                <span>{order.customerPhone}</span>
              </a>
            )}
          </div>
        </div>

        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          <p className="font-display font-extrabold text-xl sm:text-2xl tracking-tight text-gray-900 tabular-nums leading-none">
            {formatMoney(order.total)}
          </p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${payBadgeCls}`}>
            {pay.label}
          </span>
          {!!order.refundAmount && (
            <p className="text-[11px] font-display font-semibold text-red-600 tabular-nums">
              −{formatMoney(order.refundAmount)} refunded
            </p>
          )}
        </div>
      </header>

      {scheduled && (
        <div className="text-xs sm:text-sm font-semibold text-indigo-800 bg-indigo-50/80 border border-indigo-100 rounded-xl px-3 py-2 flex items-center gap-2">
          <Clock size={14} className="shrink-0 text-indigo-600" />
          <span>Scheduled for {scheduled}</span>
        </div>
      )}

      {((order.type === 'delivery' && order.deliveryAddress) || order.driverName) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          {order.type === 'delivery' && order.deliveryAddress && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gray-50 border border-gray-200/80 hover:bg-gray-100 text-gray-800 font-medium transition max-w-full"
            >
              <MapPin size={13} className="shrink-0 text-[#287350]" />
              <span className="truncate">{order.deliveryAddress}</span>
            </a>
          )}
          {order.driverName && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold text-xs">
              Driver: {order.driverName}
            </span>
          )}
        </div>
      )}

      {/* Order Line Items Box */}
      <ul className="bg-[#F8FAFC] border border-gray-200/70 rounded-xl p-3 space-y-2">
        {order.items.map((item, i) => (
          <li key={i} className="text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold text-gray-900 flex items-baseline gap-2 min-w-0">
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-[#EBF5F0] text-[#287350] font-display font-bold text-xs tabular-nums shrink-0">
                  {item.quantity}×
                </span>
                <span className="leading-snug">{item.name}</span>
              </span>
              <span className="text-gray-600 font-display font-semibold tabular-nums text-xs sm:text-sm shrink-0">
                {formatMoney(item.price * item.quantity)}
              </span>
            </div>
            {item.selectedModifiers?.length > 0 && (
              <p className="text-xs text-gray-500 pl-8 mt-0.5 leading-relaxed">{groupModifiers(item.selectedModifiers)}</p>
            )}
            {item.prepNotes && (
              <p className="text-xs font-semibold text-red-700 bg-red-50/80 border border-red-100 rounded-lg px-2.5 py-1 ml-8 mt-1">
                Note: “{item.prepNotes}”
              </p>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="text-xs sm:text-sm bg-red-50/80 border border-red-200/80 text-red-900 rounded-xl px-3 py-2 font-medium">
          Order note: {order.notes}
        </p>
      )}

      {order.cancelReason && order.status === 'cancelled' && (
        <p className="text-xs text-gray-500">Cancelled by {order.cancelledBy || 'staff'}: {order.cancelReason}</p>
      )}
      {order.paymentCollectedBy && order.paymentStatus === 'paid' && order.paymentMethod === 'cash' && (
        <p className="text-xs text-emerald-700 font-medium">
          Cash collected by {order.paymentCollectedBy}
          {order.paidAt ? ` · ${formatDateTime(order.paidAt, { timeStyle: 'short' })}` : ''}
        </p>
      )}

      <footer className="mt-auto pt-1 space-y-2">
        {step && order.status !== 'payment_pending' && (
          <button
            onClick={() => onAdvance(order)}
            className="w-full min-h-[44px] bg-gradient-to-b from-[#2E825B] to-[#236646] hover:from-[#287350] hover:to-[#1E5A3E] text-white rounded-xl px-4 py-2.5 text-sm font-bold shadow-xs transition active:scale-[0.99]"
          >
            {step.status === 'completed' && cashDue ? `Collect ${formatMoney(order.total)} & complete` : step.label}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {cashDue && step?.status !== 'completed' && (
            <button
              onClick={() => onCollectCash(order)}
              className="min-h-[36px] bg-amber-100/90 hover:bg-amber-200/80 text-amber-900 border border-amber-200/80 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap"
            >
              Mark paid (cash)
            </button>
          )}
          {order.paymentMethod === 'cash' && order.paymentStatus === 'paid' && order.status !== 'cancelled' && (
            <button
              onClick={() => onUndoCash(order)}
              className="min-h-[36px] text-gray-600 hover:bg-gray-100 rounded-xl px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap"
              title="Undo cash payment"
            >
              Undo paid
            </button>
          )}
          {order.status === 'payment_pending' && (
            <button
              onClick={() => onCheckPayment(order)}
              className="min-h-[36px] bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition whitespace-nowrap"
            >
              Check payment
            </button>
          )}
          {canRefund && (
            <button
              onClick={() => onRefund(order)}
              className="min-h-[36px] text-amber-800 hover:bg-amber-50 rounded-xl px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap"
            >
              Refund
            </button>
          )}
          {!['completed', 'cancelled'].includes(order.status) && (
            <button
              onClick={() => onCancel(order)}
              className="min-h-[36px] text-red-600 hover:bg-red-50 rounded-xl px-3 py-1.5 text-xs font-semibold transition ml-auto whitespace-nowrap"
            >
              Cancel order
            </button>
          )}
        </div>
      </footer>
    </article>
  );
});

export const AdminDashboard: React.FC = () => {
  const { isManager } = useAuth();
  const actions = useOrderActions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');
  const [viewMode, setViewMode] = useState<ViewMode>('orders');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [cashOrder, setCashOrder] = useState<{ order: Order; complete: boolean } | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, search]);

  useEffect(() => {
    const since = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const unsub = onSnapshot(
      query(collection(db, 'orders'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(500)),
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order));
        setLoading(false);
      },
      (err) => {
        reportError(err, 'dashboard-orders');
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const counts = useMemo(() => {
    const c = { active: 0, completed: 0, cancelled: 0, unpaid: 0, all: 0 };
    for (const o of orders) {
      if (o.status === 'payment_pending') continue;
      c.all++;
      if (ACTIVE_STATUSES.includes(o.status)) c.active++;
      if (o.status === 'completed') c.completed++;
      if (o.status === 'cancelled') c.cancelled++;
      if (isCashDue(o)) c.unpaid++;
    }
    return c;
  }, [orders]);

  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const list = orders.filter((o) => toMillis(o.createdAt, Date.now()) >= start.getTime() && !['payment_pending', 'cancelled'].includes(o.status));
    const sales = list.reduce((sum, o) => sum + toCents(o.total) - toCents(o.refundAmount || 0), 0);
    const cashOutstanding = orders.filter(isCashDue).reduce((sum, o) => sum + toCents(o.total), 0);
    return { count: list.length, sales: fromCents(sales), cashOutstanding: fromCents(cashOutstanding) };
  }, [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (o.status === 'payment_pending') return false;
        if (filter === 'active' && !ACTIVE_STATUSES.includes(o.status)) return false;
        if (filter === 'completed' && o.status !== 'completed') return false;
        if (filter === 'cancelled' && o.status !== 'cancelled') return false;
        if (filter === 'unpaid' && !isCashDue(o)) return false;
        if (!q) return true;
        return (
          orderCode(o).toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          o.customerName?.toLowerCase().includes(q) ||
          o.customerPhone?.includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) =>
        filter === 'active' ? toMillis(a.createdAt, Date.now()) - toMillis(b.createdAt, Date.now()) : toMillis(b.createdAt, Date.now()) - toMillis(a.createdAt, Date.now()),
      );
  }, [orders, filter, search]);

  const advance = useCallback(
    (order: Order) => {
      const step = nextStep(order);
      if (!step) return;
      if (step.status === 'completed' && isCashDue(order)) {
        setCashOrder({ order, complete: true });
        return;
      }
      actions.setStatus(order, step.status);
    },
    [actions],
  );

  const handleCollectCash = useCallback((o: Order) => {
    setCashOrder({ order: o, complete: false });
  }, []);

  const handleOpenCancel = useCallback((o: Order) => {
    setCancelReason('');
    setCancelOrder(o);
  }, []);

  const handleOpenRefund = useCallback((o: Order) => {
    setRefundOrder(o);
    setRefundAmount(fromCents(toCents(o.total) - toCents(o.refundAmount || 0)).toFixed(2));
  }, []);

  const confirmCash = async () => {
    if (!cashOrder) return;
    setWorking(true);
    await actions.markCashPaid(cashOrder.order, cashOrder.complete);
    setWorking(false);
    setCashOrder(null);
  };

  const confirmCancel = async () => {
    if (!cancelOrder) return;
    setWorking(true);
    try {
      try {
        const res = await api.cancel(cancelOrder.id, cancelReason.trim() || undefined);
        toast.success(res.refunded ? `Cancelled and refunded #${orderCode(cancelOrder)}` : `Cancelled #${orderCode(cancelOrder)}`);
      } catch {
        await updateDoc(doc(db, 'orders', cancelOrder.id), {
          status: 'cancelled',
          cancelledBy: 'staff',
          cancelReason: cancelReason.trim() || 'Cancelled by staff',
          updatedAt: serverTimestamp(),
        });
        toast.success(`Cancelled #${orderCode(cancelOrder)}`);
      }
      setCancelOrder(null);
      setCancelReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel the order.');
    } finally {
      setWorking(false);
    }
  };

  const refundable = refundOrder ? fromCents(toCents(refundOrder.total) - toCents(refundOrder.refundAmount || 0)) : 0;
  const confirmRefund = async () => {
    if (!refundOrder) return;
    const amount = Number(refundAmount);
    if (!(amount > 0) || amount > refundable) {
      toast.error(`Enter an amount between $0.01 and ${formatMoney(refundable)}.`);
      return;
    }
    setWorking(true);
    try {
      const res = await api.refund(refundOrder.id, amount);
      toast.success(`Refunded ${formatMoney(amount)} · ${res.paymentStatus === 'refunded' ? 'fully refunded' : 'partial refund'}`);
      setRefundOrder(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Refund failed.');
    } finally {
      setWorking(false);
    }
  };

  const checkPayment = useCallback(async (order: Order) => {
    try {
      const res = await api.confirmPayment(order.id);
      toast(res.paid ? 'Payment confirmed — order sent to the kitchen.' : `Not paid yet (${res.stripeStatus || 'no payment'}).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not check the payment.');
    }
  }, []);

  if (loading) return <PageSpinner label="Loading orders…" />;

  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'unpaid', label: 'Cash due', count: counts.unpaid },
    { id: 'completed', label: 'Completed', count: counts.completed },
    { id: 'cancelled', label: 'Cancelled', count: counts.cancelled },
    { id: 'all', label: 'All' },
  ];

  const displayedOrders = visible.slice(0, visibleCount);

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <StoreControls />

      {/* Daily Snapshot KPI Cards + View Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 flex-1">
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-[0_2px_10px_rgba(15,23,42,0.025)] px-3.5 py-3 sm:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 truncate">Orders today</p>
            <p className="text-xl sm:text-2xl font-display font-extrabold tracking-tight text-gray-900 tabular-nums mt-1">
              {today.count}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-[0_2px_10px_rgba(15,23,42,0.025)] px-3.5 py-3 sm:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 truncate">Sales today</p>
            <p className="text-xl sm:text-2xl font-display font-extrabold tracking-tight text-gray-900 tabular-nums mt-1">
              {formatMoney(today.sales)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setViewMode('orders');
              setFilter('unpaid');
            }}
            className={`text-left rounded-2xl border px-3.5 py-3 sm:p-4 transition shadow-[0_2px_10px_rgba(15,23,42,0.025)] ${
              today.cashOutstanding > 0
                ? 'bg-gradient-to-br from-amber-50/90 via-white to-white border-amber-300/80 hover:border-amber-400'
                : 'bg-white border-gray-200/80 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <p className={`text-[11px] font-semibold uppercase tracking-wider truncate ${today.cashOutstanding > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                Cash due
              </p>
              {today.cashOutstanding > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
            </div>
            <p className={`text-xl sm:text-2xl font-display font-extrabold tracking-tight tabular-nums mt-1 ${today.cashOutstanding > 0 ? 'text-amber-900' : 'text-gray-900'}`}>
              {formatMoney(today.cashOutstanding)}
            </p>
          </button>
        </div>

        {isManager && (
          <div className="grid grid-cols-2 sm:inline-flex items-center p-1 bg-gray-200/70 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('orders')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                viewMode === 'orders' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <ClipboardList size={14} />
              <span>Live orders</span>
              <span className="font-display font-bold tabular-nums text-xs px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-700">
                {counts.active}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('insights')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                viewMode === 'insights' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <BarChart3 size={14} />
              <span>Sales & insights</span>
            </button>
          </div>
        )}
      </div>

      {viewMode === 'insights' && isManager ? (
        <Suspense
          fallback={
            <div className="flex justify-center py-12 text-gray-400">
              <Spinner />
            </div>
          }
        >
          <AdminFinancials orders={orders} />
        </Suspense>
      ) : (
        <>
          {/* Filter Chips + Search Bar (Clean pill chips instead of a second stacked gray box) */}
          <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-0.5">
              {filters.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`shrink-0 h-9 px-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition whitespace-nowrap border ${
                      active
                        ? 'bg-[#287350] text-white border-[#287350] shadow-2xs'
                        : 'bg-white text-gray-600 border-gray-200/80 hover:border-gray-300 hover:text-gray-900'
                    }`}
                  >
                    <span>{f.label}</span>
                    {f.count !== undefined && (
                      <span
                        className={`font-display font-bold tabular-nums text-[11px] px-1.5 py-0.2 rounded-md ${
                          active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {f.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="relative sm:w-72">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order #, name, phone, item…"
                className={`${adminInput} pl-9 h-10`}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
              {filter === 'active' ? 'No active orders right now. New orders will appear here automatically.' : 'No orders match this filter.'}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
                {displayedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isManager={isManager}
                    onAdvance={advance}
                    onCollectCash={handleCollectCash}
                    onUndoCash={actions.undoCashPaid}
                    onCancel={handleOpenCancel}
                    onRefund={handleOpenRefund}
                    onCheckPayment={checkPayment}
                  />
                ))}
              </div>
              {visible.length > visibleCount && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="min-h-[42px] px-5 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-xs sm:text-sm font-semibold text-gray-800 transition"
                  >
                    Show more orders ({visible.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!cashOrder}
        busy={working}
        title={cashOrder?.complete ? 'Collect cash & complete' : 'Record cash payment'}
        message={
          cashOrder && (
            <>
              Collect <strong className="text-gray-900 text-base font-display font-bold tabular-nums">{formatMoney(cashOrder.order.total)}</strong> in cash from{' '}
              {cashOrder.order.customerName || 'the customer'} for order #{orderCode(cashOrder.order)}. This records the payment under your name.
            </>
          )
        }
        confirmLabel={cashOrder?.complete ? 'Cash received · Complete' : 'Cash received'}
        onCancel={() => setCashOrder(null)}
        onConfirm={confirmCash}
      />

      <ConfirmDialog
        open={!!cancelOrder}
        busy={working}
        danger
        title={`Cancel order #${cancelOrder ? orderCode(cancelOrder) : ''}?`}
        message={
          cancelOrder &&
          (cancelOrder.paymentMethod !== 'cash' && ['paid', 'partially_refunded'].includes(cancelOrder.paymentStatus || '')
            ? `The customer will automatically be refunded ${formatMoney(fromCents(toCents(cancelOrder.total) - toCents(cancelOrder.refundAmount || 0)))} to their card.`
            : cancelOrder.paymentMethod === 'cash' && cancelOrder.paymentStatus === 'paid'
              ? 'This cash order was already paid. Remember to return the cash to the customer.'
              : 'The customer will see that the order was cancelled.')
        }
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        onCancel={() => setCancelOrder(null)}
        onConfirm={confirmCancel}
      >
        <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (shown to the customer)" className={`${adminInput} mt-4`} maxLength={300} />
      </ConfirmDialog>

      <Sheet
        open={!!refundOrder}
        onClose={() => !working && setRefundOrder(null)}
        surface="admin"
        size="sm"
        title={`Refund #${refundOrder ? orderCode(refundOrder) : ''}`}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setRefundOrder(null)} disabled={working} className="flex-1 py-3 rounded-xl bg-gray-100 font-semibold">
              Cancel
            </button>
            <button onClick={confirmRefund} disabled={working} className="flex-1 py-3 rounded-xl bg-amber-600 text-white font-semibold flex items-center justify-center gap-2">
              {working && <Spinner size={16} />} Refund
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-3 text-sm text-gray-600">
          <p>
            Paid {formatMoney(refundOrder?.total)}
            {refundOrder?.refundAmount ? `, already refunded ${formatMoney(refundOrder.refundAmount)}` : ''}. You can refund up to{' '}
            <strong className="text-gray-900 font-display font-bold tabular-nums">{formatMoney(refundable)}</strong>.
          </p>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input type="number" inputMode="decimal" step="0.01" min="0.01" max={refundable} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className={`${adminInput} pl-7 font-display font-semibold tabular-nums`} />
          </div>
          <div className="flex gap-2">
            {[0.25, 0.5, 1].map((f) => (
              <button key={f} type="button" onClick={() => setRefundAmount((refundable * f).toFixed(2))} className="px-3 py-1.5 rounded-xl bg-gray-100 text-xs font-semibold">
                {f === 1 ? 'Full' : `${f * 100}%`}
              </button>
            ))}
          </div>
          <p className="text-xs">A full refund of an unfinished order also cancels it.</p>
        </div>
      </Sheet>
    </div>
  );
};
