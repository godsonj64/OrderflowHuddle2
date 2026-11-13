import React, { useEffect, useMemo, useState } from 'react';
import { Timestamp, collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { Download } from 'lucide-react';
import { db } from '../firebase';
import type { Order } from '../types';
import { formatMoney, fromCents, toCents } from '../lib/money';
import { orderCode } from '../lib/ids';
import { toDate, toMillis } from '../lib/dates';
import { isCashDue, paymentMethodOf } from '../lib/orderStatus';
import { adminInput, Spinner } from './ui';
import { reportError } from '../utils/errorHandling';

type Range = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

const RANGE_LABEL: Record<Range, string> = { today: 'Today', yesterday: 'Yesterday', '7d': '7 days', '30d': '30 days', custom: 'Custom' };

/** Orders that represent real sales: placed (not abandoned) and not cancelled. */
const isSale = (o: Order) => o.status !== 'payment_pending' && o.status !== 'cancelled';

function csvCell(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function bounds(range: Range, customStart: string, customEnd: string): [Date, Date] | null {
  const now = new Date();
  switch (range) {
    case 'today':
      return [startOfDay(now), endOfDay(now)];
    case 'yesterday': {
      const y = subDays(now, 1);
      return [startOfDay(y), endOfDay(y)];
    }
    case '7d':
      return [startOfDay(subDays(now, 6)), endOfDay(now)];
    case '30d':
      return [startOfDay(subDays(now, 29)), endOfDay(now)];
    case 'custom':
      if (!customStart || !customEnd) return null;
      return [startOfDay(new Date(`${customStart}T00:00`)), endOfDay(new Date(`${customEnd}T00:00`))];
  }
}

export const AdminFinancials: React.FC<{ orders: Order[] }> = ({ orders }) => {
  const [range, setRange] = useState<Range>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customOrders, setCustomOrders] = useState<Order[] | null>(null);
  const [loadingCustom, setLoadingCustom] = useState(false);

  const window_ = bounds(range, customStart, customEnd);

  // The dashboard streams the last 30 days; older custom ranges are fetched on demand.
  useEffect(() => {
    if (range !== 'custom' || !window_) {
      setCustomOrders(null);
      return;
    }
    let cancelled = false;
    setLoadingCustom(true);
    getDocs(
      query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(window_[0])),
        where('createdAt', '<=', Timestamp.fromDate(window_[1])),
        orderBy('createdAt', 'desc'),
      ),
    )
      .then((snap) => !cancelled && setCustomOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order)))
      .catch((err) => reportError(err, 'financials-range'))
      .finally(() => !cancelled && setLoadingCustom(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customStart, customEnd]);

  const inRange = useMemo(() => {
    if (!window_) return [];
    const source = range === 'custom' ? customOrders || [] : orders;
    const [start, end] = window_;
    return source.filter((o) => {
      const t = toMillis(o.createdAt, Date.now());
      return t >= start.getTime() && t <= end.getTime();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, customOrders, range, customStart, customEnd]);

  const stats = useMemo(() => {
    const sales = inRange.filter(isSale);
    let net = 0;
    let card = 0;
    let cash = 0;
    let cashDue = 0;
    let tips = 0;
    let tax = 0;
    let discounts = 0;
    let refunds = 0;
    let pickup = 0;
    let delivery = 0;
    for (const o of inRange) refunds += toCents(o.refundAmount || 0);
    for (const o of sales) {
      const netCents = toCents(o.total) - toCents(o.refundAmount || 0);
      net += netCents;
      if (paymentMethodOf(o) === 'cash') {
        if (o.paymentStatus === 'paid') cash += netCents;
        else if (isCashDue(o)) cashDue += toCents(o.total);
      } else if (['paid', 'partially_refunded'].includes(o.paymentStatus || '')) {
        card += netCents;
      }
      tips += toCents(o.restaurantTip || 0) + toCents(o.deliveryTip || 0);
      tax += toCents(o.tax || 0);
      discounts += toCents(o.discountAmount || 0);
      if (o.type === 'delivery') delivery++;
      else pickup++;
    }
    return {
      count: sales.length,
      cancelled: inRange.filter((o) => o.status === 'cancelled' && o.paymentStatus !== 'failed').length,
      net: fromCents(net),
      avg: sales.length ? fromCents(net / sales.length) : 0,
      card: fromCents(card),
      cash: fromCents(cash),
      cashDue: fromCents(cashDue),
      tips: fromCents(tips),
      tax: fromCents(tax),
      discounts: fromCents(discounts),
      refunds: fromCents(refunds),
      pickup,
      delivery,
    };
  }, [inRange]);

  const chart = useMemo(() => {
    if (!window_) return [];
    const sales = inRange.filter(isSale);
    const [start, end] = window_;
    const singleDay = end.getTime() - start.getTime() <= 24 * 60 * 60 * 1000;
    const buckets = new Map<string, number>();
    if (singleDay) {
      for (let h = 0; h < 24; h++) buckets.set(`${h}`, 0);
      for (const o of sales) {
        const d = toDate(o.createdAt);
        if (d) buckets.set(`${d.getHours()}`, (buckets.get(`${d.getHours()}`) || 0) + toCents(o.total) - toCents(o.refundAmount || 0));
      }
      return [...buckets.entries()]
        .map(([h, cents]) => ({ label: format(new Date(2000, 0, 1, Number(h)), 'ha'), revenue: fromCents(cents) }))
        .filter((_, i, all) => i >= 6 || all.slice(0, 6).some((x) => x.revenue > 0));
    }
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) buckets.set(format(d, 'MMM d'), 0);
    for (const o of sales) {
      const d = toDate(o.createdAt);
      if (!d) continue;
      const key = format(d, 'MMM d');
      buckets.set(key, (buckets.get(key) || 0) + toCents(o.total) - toCents(o.refundAmount || 0));
    }
    return [...buckets.entries()].map(([label, cents]) => ({ label, revenue: fromCents(cents) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRange]);

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const o of inRange.filter(isSale)) {
      for (const item of o.items) {
        const entry = map.get(item.itemId) || { name: item.name, quantity: 0, revenue: 0 };
        entry.quantity += item.quantity;
        entry.revenue += toCents(item.price) * item.quantity;
        map.set(item.itemId, entry);
      }
    }
    return [...map.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8);
  }, [inRange]);

  const exportCsv = () => {
    const header = [
      'Order', 'Date', 'Customer', 'Phone', 'Type', 'Status', 'Payment method', 'Payment status', 'Subtotal', 'Discount', 'Promo',
      'Delivery fee', 'Service fee', 'Tax', 'Tip', 'Driver tip', 'Total', 'Refunded', 'Items',
    ];
    const rows = inRange
      .filter((o) => o.status !== 'payment_pending')
      .map((o) =>
        [
          orderCode(o),
          toDate(o.createdAt)?.toISOString() || '',
          o.customerName || '',
          o.customerPhone || '',
          o.type,
          o.status,
          paymentMethodOf(o),
          o.paymentStatus || '',
          (o.subtotal ?? '').toString(),
          (o.discountAmount || 0).toFixed(2),
          o.promoCode || '',
          (o.deliveryFee || 0).toFixed(2),
          (o.serviceFee || 0).toFixed(2),
          (o.tax || 0).toFixed(2),
          (o.restaurantTip || 0).toFixed(2),
          (o.deliveryTip || 0).toFixed(2),
          o.total.toFixed(2),
          (o.refundAmount || 0).toFixed(2),
          o.items.map((i) => `${i.quantity}x ${i.name}${i.selectedModifiers?.length ? ` (${i.selectedModifiers.map((m) => m.name).join(', ')})` : ''}`).join('; '),
        ]
          .map(csvCell)
          .join(','),
      );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_${range}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Stat = ({ label, value, hint, tone = '' }: { label: string; value: string; hint?: string; tone?: string }) => (
    <div className={`rounded-2xl border p-3.5 sm:p-4 shadow-[0_2px_10px_rgba(15,23,42,0.025)] ${tone || 'bg-white border-gray-200/80'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-xl sm:text-2xl font-display font-extrabold tracking-tight tabular-nums mt-1 text-gray-900">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1 tabular-nums">{hint}</p>}
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-0.5">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`shrink-0 h-9 px-3.5 rounded-xl text-xs font-semibold border transition whitespace-nowrap ${
                range === r
                  ? 'bg-[#287350] text-white border-[#287350] shadow-2xs'
                  : 'bg-white text-gray-600 border-gray-200/80 hover:border-gray-300 hover:text-gray-900'
              }`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <button
          onClick={exportCsv}
          disabled={!inRange.length}
          className="self-start sm:self-auto h-9 flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-semibold bg-white border border-gray-200/90 hover:bg-gray-50 text-gray-800 shadow-2xs disabled:opacity-40 whitespace-nowrap transition"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={`${adminInput} max-w-[165px]`} aria-label="Start date" />
          <span className="text-gray-400">–</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={`${adminInput} max-w-[165px]`} aria-label="End date" />
          {loadingCustom && <Spinner className="text-gray-400" />}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <Stat label="Net sales" value={formatMoney(stats.net)} hint={`${stats.count} orders · avg ${formatMoney(stats.avg)}`} />
        <Stat label="Card collected" value={formatMoney(stats.card)} />
        <Stat label="Cash collected" value={formatMoney(stats.cash)} />
        <Stat label="Cash outstanding" value={formatMoney(stats.cashDue)} tone={stats.cashDue > 0 ? 'bg-gradient-to-br from-amber-50/90 via-white to-white border-amber-300/80' : ''} />
        <Stat label="Tips" value={formatMoney(stats.tips)} />
        <Stat label="Tax collected" value={formatMoney(stats.tax)} />
        <Stat label="Discounts given" value={formatMoney(stats.discounts)} hint={stats.refunds ? `Refunds ${formatMoney(stats.refunds)}` : undefined} />
        <Stat label="Pickup / delivery" value={`${stats.pickup} / ${stats.delivery}`} hint={stats.cancelled ? `${stats.cancelled} cancelled` : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 shadow-[0_2px_10px_rgba(15,23,42,0.025)] p-4 sm:p-5">
          <h3 className="font-display font-bold text-sm sm:text-base mb-3 text-gray-900">Revenue breakdown</h3>
          <div className="h-56 sm:h-64">
            {chart.some((c) => c.revenue > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={52} />
                  <Tooltip cursor={{ fill: '#F1F5F9' }} contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)' }} formatter={(v: number) => [formatMoney(v), 'Revenue']} />
                  <Bar dataKey="revenue" fill="#287350" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">No sales recorded in this period</div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-[0_2px_10px_rgba(15,23,42,0.025)] p-4 sm:p-5">
          <h3 className="font-display font-bold text-sm sm:text-base mb-3 text-gray-900">Top selling items</h3>
          {topItems.length ? (
            <ol className="space-y-3">
              {topItems.map((item, i) => {
                const max = topItems[0].quantity || 1;
                return (
                  <li key={item.name + i} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold truncate text-gray-900">
                        <span className="font-display font-bold tabular-nums text-gray-400 mr-1.5">{i + 1}.</span>
                        {item.name}
                      </span>
                      <span className="text-gray-600 font-display font-semibold tabular-nums whitespace-nowrap text-xs">
                        {item.quantity} sold · {formatMoney(fromCents(item.revenue))}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 mt-1.5">
                      <div className="h-full rounded-full bg-[#287350]" style={{ width: `${(item.quantity / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-gray-400">No items sold in this period</p>
          )}
        </div>
      </div>
    </section>
  );
};
