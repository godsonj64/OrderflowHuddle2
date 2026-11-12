import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Timestamp, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { MapPin, Phone, Search } from 'lucide-react';
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

function OrderCard({ order, isManager, onAdvance, onCollectCash, onUndoCash, onCancel, onRefund, onCheckPayment }: CardProps) {
  const step = nextStep(order);
  const pay = paymentSummary(order);
  const cashDue = isCashDue(order);
  const canRefund =
    isManager && order.paymentMethod !== 'cash' && !!order.paymentIntentId && !order.paymentIntentId.startsWith('mock_') && ['paid', 'partially_refunded'].includes(order.paymentStatus || '');
  const scheduled = order.scheduledTime;

  const payTextCls =
    pay.tone === 'good'
      ? 'text-emerald-700'
      : pay.tone === 'warn'
        ? 'text-amber-700 font-semibold'
        : pay.tone === 'bad'
          ? 'text-red-600 font-semibold'
          : 'text-gray-500';

  return (
    <article className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 flex flex-col gap-3.5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-extrabold text-lg font-mono tabular-nums tracking-tight text-gray-900">#{orderCode(order)}</h3>
            <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLE[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="font-semibold text-gray-900">{order.customerName || 'Guest'}</span>
            <span aria-hidden="true">·</span>
            <span>{order.type === 'delivery' ? 'Delivery' : 'Pickup'}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{timeAgo(order.createdAt)}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-extrabold text-lg font-mono tabular-nums text-gray-900">{formatMoney(order.total)}</p>
          <p className={`text-xs ${payTextCls}`}>{pay.label}</p>
          {!!order.refundAmount && <p className="text-[11px] text-red-600 tabular-nums">−{formatMoney(order.refundAmount)} refunded</p>}
        </div>
      </header>

      {scheduled && (
        <div className="text-xs sm:text-sm font-semibold text-indigo-800 bg-indigo-50/80 border border-indigo-100 rounded-xl px-3 py-2">
          Scheduled for {scheduled}
        </div>
      )}

      {(order.customerPhone || (order.type === 'delivery' && order.deliveryAddress) || order.driverName) && (
        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-600">
          {order.customerPhone && (
            <a
              href={`tel:${order.customerPhone}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium transition"
            >
              <Phone size={13} />
              <span className="tabular-nums">{order.customerPhone}</span>
            </a>
          )}
          {order.type === 'delivery' && order.deliveryAddress && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium transition max-w-full"
            >
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">{order.deliveryAddress}</span>
            </a>
          )}
          {order.driverName && <span className="text-xs text-gray-500">Driver: {order.driverName}</span>}
        </div>
      )}

      <ul className="bg-gray-50/80 border border-gray-100 rounded-xl p-3 space-y-2">
        {order.items.map((item, i) => (
          <li key={i} className="text-sm">
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-gray-900">
                <span className="font-mono tabular-nums text-gray-500 mr-1.5">{item.quantity}×</span>
                {item.name}
              </span>
              <span className="text-gray-500 font-mono tabular-nums shrink-0">{formatMoney(item.price * item.quantity)}</span>
            </div>
            {item.selectedModifiers?.length > 0 && (
              <p className="text-xs text-gray-500 pl-6 mt-0.5">{groupModifiers(item.selectedModifiers)}</p>
            )}
            {item.prepNotes && <p className="text-xs font-semibold text-red-700 pl-6 mt-0.5">Note: “{item.prepNotes}”</p>}
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
        <p className="text-xs text-emerald-700">
          Cash collected by {order.paymentCollectedBy}
          {order.paidAt ? ` · ${formatDateTime(order.paidAt, { timeStyle: 'short' })}` : ''}
        </p>
      )}

      <footer className="mt-auto pt-1 space-y-2">
        {step && order.status !== 'payment_pending' && (
          <button
            onClick={() => onAdvance(order)}
            className="w-full min-h-[44px] bg-gray-900 hover:bg-black text-white rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.99]"
          >
            {step.status === 'completed' && cashDue ? `Collect ${formatMoney(order.total)} & complete` : step.label}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {cashDue && step?.status !== 'completed' && (
            <button
              onClick={() => onCollectCash(order)}
              className="min-h-[38px] bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap"
            >
              Mark paid (cash)
            </button>
          )}
          {order.paymentMethod === 'cash' && order.paymentStatus === 'paid' && order.status !== 'cancelled' && (
            <button
              onClick={() => onUndoCash(order)}
              className="min-h-[38px] text-gray-600 hover:bg-gray-100 rounded-xl px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap"
              title="Undo cash payment"
            >
              Undo paid
            </button>
          )}
          {order.status === 'payment_pending' && (
            <button
              onClick={() => onCheckPayment(order)}
              className="min-h-[38px] bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition whitespace-nowrap"
            >
              Check payment
            </button>
          )}
          {canRefund && (
            <button
              onClick={() => onRefund(order)}
              className="min-h-[38px] text-amber-800 hover:bg-amber-50 rounded-xl px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap"
            >
              Refund
            </button>
          )}
          {!['completed', 'cancelled'].includes(order.status) && (
            <button
              onClick={() => onCancel(order)}
              className="min-h-[38px] text-red-600 hover:bg-red-50 rounded-xl px-3 py-1.5 text-xs font-semibold transition ml-auto whitespace-nowrap"
            >
              Cancel order
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}

export const AdminDashboard: React.FC = () => {
  const { isManager } = useAuth();
  const actions = useOrderActions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');
  const [viewMode, setViewMode] = useState<ViewMode>('orders');
  const [search, setSearch] = useState('');

  const [cashOrder, setCashOrder] = useState<{ order: Order; complete: boolean } | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    // Live window of the last 30 days (single-field range query: no composite index).
    const since = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const unsub = onSnapshot(
      query(collection(db, 'orders'), where('createdAt', '>=', since), orderBy('createdAt', 'desc')),
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

  const advance = (order: Order) => {
    const step = nextStep(order);
    if (!step) return;
    if (step.status === 'completed' && isCashDue(order)) {
      setCashOrder({ order, complete: true });
      return;
    }
    actions.setStatus(order, step.status);
  };

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
        // Direct Firestore fallback for staff cancellation
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

  const checkPayment = async (order: Order) => {
    try {
      const res = await api.confirmPayment(order.id);
      toast(res.paid ? 'Payment confirmed — order sent to the kitchen.' : `Not paid yet (${res.stripeStatus || 'no payment'}).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not check the payment.');
    }
  };

  if (loading) return <PageSpinner label="Loading orders…" />;

  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'unpaid', label: 'Cash due', count: counts.unpaid },
    { id: 'completed', label: 'Completed', count: counts.completed },
    { id: 'cancelled', label: 'Cancelled', count: counts.cancelled },
    { id: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <StoreControls />

      {/* Top-level view toggle for managers so financial charts don't clutter the live orders feed on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="grid grid-cols-3 gap-2 sm:gap-3 flex-1">
          <div className="bg-white rounded-2xl border border-gray-200/80 px-3 py-2.5 sm:p-4">
            <p className="text-[11px] font-medium text-gray-500 truncate">Orders today</p>
            <p className="text-lg sm:text-2xl font-extrabold font-mono tabular-nums mt-0.5">{today.count}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200/80 px-3 py-2.5 sm:p-4">
            <p className="text-[11px] font-medium text-gray-500 truncate">Sales today</p>
            <p className="text-lg sm:text-2xl font-extrabold font-mono tabular-nums mt-0.5">{formatMoney(today.sales)}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setViewMode('orders');
              setFilter('unpaid');
            }}
            className={`text-left rounded-2xl border px-3 py-2.5 sm:p-4 transition ${
              today.cashOutstanding > 0 ? 'bg-amber-50 border-amber-200 hover:bg-amber-100/70' : 'bg-white border-gray-200/80 hover:bg-gray-50'
            }`}
          >
            <p className={`text-[11px] font-medium truncate ${today.cashOutstanding > 0 ? 'text-amber-800' : 'text-gray-500'}`}>Cash due</p>
            <p className={`text-lg sm:text-2xl font-extrabold font-mono tabular-nums mt-0.5 ${today.cashOutstanding > 0 ? 'text-amber-900' : 'text-gray-900'}`}>
              {formatMoney(today.cashOutstanding)}
            </p>
          </button>
        </div>

        {isManager && (
          <div className="flex items-center p-1 bg-gray-200/70 rounded-xl self-start sm:self-stretch shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('orders')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
                viewMode === 'orders' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Live orders ({counts.active})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('insights')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
                viewMode === 'insights' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Sales & insights
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
          <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
            <div className="flex items-center gap-0.5 sm:gap-1 p-1 bg-gray-200/60 rounded-xl overflow-x-auto hide-scrollbar">
              {filters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`flex-1 sm:flex-initial shrink-0 min-h-[36px] px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-sm font-semibold transition whitespace-nowrap text-center ${
                    filter === f.id ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {f.label}
                  {f.count !== undefined && <span className="ml-1 font-mono tabular-nums opacity-65">{f.count}</span>}
                </button>
              ))}
            </div>
            <div className="relative sm:ml-auto sm:w-72">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order #, name, phone, item…"
                className={`${adminInput} pl-9`}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
              {filter === 'active' ? 'No active orders right now. New orders will appear here automatically.' : 'No orders match this filter.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {visible.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isManager={isManager}
                  onAdvance={advance}
                  onCollectCash={(o) => setCashOrder({ order: o, complete: false })}
                  onUndoCash={actions.undoCashPaid}
                  onCancel={(o) => {
                    setCancelReason('');
                    setCancelOrder(o);
                  }}
                  onRefund={(o) => {
                    setRefundOrder(o);
                    setRefundAmount(fromCents(toCents(o.total) - toCents(o.refundAmount || 0)).toFixed(2));
                  }}
                  onCheckPayment={checkPayment}
                />
              ))}
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
              Collect <strong className="text-gray-900 text-base font-mono tabular-nums">{formatMoney(cashOrder.order.total)}</strong> in cash from{' '}
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
            <button onClick={() => setRefundOrder(null)} disabled={working} className="flex-1 py-3 rounded-2xl bg-gray-100 font-semibold">
              Cancel
            </button>
            <button onClick={confirmRefund} disabled={working} className="flex-1 py-3 rounded-2xl bg-amber-600 text-white font-semibold flex items-center justify-center gap-2">
              {working && <Spinner size={16} />} Refund
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-3 text-sm text-gray-600">
          <p>
            Paid {formatMoney(refundOrder?.total)}
            {refundOrder?.refundAmount ? `, already refunded ${formatMoney(refundOrder.refundAmount)}` : ''}. You can refund up to{' '}
            <strong className="text-gray-900 font-mono tabular-nums">{formatMoney(refundable)}</strong>.
          </p>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input type="number" inputMode="decimal" step="0.01" min="0.01" max={refundable} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className={`${adminInput} pl-7 font-mono tabular-nums`} />
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
