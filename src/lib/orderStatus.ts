/** Shared labels / colors for order and payment states. */
import type { Order, OrderStatus } from '../types';
import { toCents, fromCents } from './money';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  payment_pending: 'Awaiting payment',
  new: 'New',
  confirmed: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Admin badge colors. */
export const STATUS_STYLE: Record<OrderStatus, string> = {
  payment_pending: 'bg-gray-100 text-gray-600 border-gray-200',
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  confirmed: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  preparing: 'bg-amber-50 text-amber-800 border-amber-200',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  out_for_delivery: 'bg-purple-50 text-purple-700 border-purple-200',
  completed: 'bg-stone-100 text-stone-700 border-stone-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

export function customerStatusLabel(order: Pick<Order, 'status' | 'type'>): string {
  if (order.status === 'new') return 'Order received';
  if (order.status === 'ready') return order.type === 'delivery' ? 'Ready — waiting for driver' : 'Ready for pickup';
  return STATUS_LABEL[order.status] || order.status;
}

export const ACTIVE_STATUSES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];

export function isActive(order: Pick<Order, 'status'>) {
  return ACTIVE_STATUSES.includes(order.status);
}

/** Older orders have no paymentMethod: they were card (Stripe) or mock payments. */
export function paymentMethodOf(order: Pick<Order, 'paymentMethod'>) {
  return order.paymentMethod || 'card';
}

/** Cash that still has to be collected from the customer. */
export function isCashDue(order: Pick<Order, 'paymentMethod' | 'paymentStatus' | 'status'>) {
  return order.paymentMethod === 'cash' && order.paymentStatus !== 'paid' && order.status !== 'cancelled';
}

export type Tone = 'good' | 'warn' | 'bad' | 'muted';

export function paymentSummary(order: Pick<Order, 'paymentMethod' | 'paymentStatus' | 'status' | 'refundAmount'>): { label: string; tone: Tone } {
  const method = paymentMethodOf(order) === 'cash' ? 'Cash' : 'Card';
  switch (order.paymentStatus) {
    case 'paid':
      return { label: `Paid · ${method}`, tone: 'good' };
    case 'refunded':
      return { label: 'Refunded', tone: 'bad' };
    case 'partially_refunded':
      return { label: `Partly refunded ($${(order.refundAmount || 0).toFixed(2)})`, tone: 'warn' };
    case 'failed':
      return { label: 'Payment failed', tone: 'bad' };
    default:
      if (order.paymentMethod === 'cash') return { label: order.status === 'cancelled' ? 'Cash · not collected' : 'Cash · collect payment', tone: 'warn' };
      return { label: order.status === 'payment_pending' ? 'Awaiting payment' : 'Unpaid', tone: 'muted' };
  }
}

export const TONE_STYLE: Record<Tone, string> = {
  good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-300',
  bad: 'bg-red-50 text-red-700 border-red-200',
  muted: 'bg-gray-100 text-gray-600 border-gray-200',
};

/** Amount kept after refunds. */
export function netAmount(order: Pick<Order, 'total' | 'refundAmount'>) {
  return fromCents(toCents(order.total) - toCents(order.refundAmount || 0));
}

/** The next step in the kitchen workflow and the label for its button. */
export function nextStep(order: Pick<Order, 'status' | 'type'>): { status: OrderStatus; label: string } | null {
  switch (order.status) {
    case 'new':
      return { status: 'confirmed', label: 'Accept order' };
    case 'confirmed':
      return { status: 'preparing', label: 'Start preparing' };
    case 'preparing':
      return { status: 'ready', label: order.type === 'delivery' ? 'Ready for driver' : 'Mark ready' };
    case 'ready':
      return order.type === 'delivery' ? { status: 'out_for_delivery', label: 'Out for delivery' } : { status: 'completed', label: 'Picked up' };
    case 'out_for_delivery':
      return { status: 'completed', label: 'Mark delivered' };
    default:
      return null;
  }
}
