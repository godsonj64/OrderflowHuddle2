/** Small client for the app's own server API (server.ts). Attaches the Firebase ID token. */
import { auth } from '../firebase';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: any = null,
  ) {
    super(message);
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response (e.g. the dev server is restarting).
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status}). Please try again.`, res.status, data);
  }
  return data as T;
}

export const apiGet = <T>(path: string) => request<T>('GET', path);
export const apiPost = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);

// ---------------------------------------------------------------------------
// Typed endpoints
// ---------------------------------------------------------------------------

import type { OrderTotals, ModifierSelection, TipChoice } from './pricing';
import type { OrderStatus, OrderType, PaymentMethod, PaymentStatus } from '../types';

export interface CheckoutRequest {
  items: { itemId: string; quantity: number; selections: ModifierSelection[]; notes?: string }[];
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  notes?: string;
  scheduledFor?: string | null;
  promoCode?: string | null;
  tip?: { restaurant?: TipChoice; delivery?: TipChoice };
  expectedTotalCents?: number;
  replacesOrderId?: string | null;
}

export interface CheckoutResponse {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  totals: OrderTotals;
  clientSecret: string | null;
}

export interface PaymentStateResponse {
  paid: boolean;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  stripeStatus?: string;
  processing?: boolean;
}

export const api = {
  config: () => apiGet<{ cardPayments: boolean }>('/api/config'),
  health: () => apiGet<{ status: string; firestore: 'ok' | 'error'; cardPayments: boolean; webhooks: boolean }>('/api/health'),
  checkout: (body: CheckoutRequest) => apiPost<CheckoutResponse>('/api/checkout', body),
  confirmPayment: (orderId: string) => apiPost<PaymentStateResponse>(`/api/orders/${encodeURIComponent(orderId)}/confirm-payment`),
  abandon: (orderId: string) => apiPost<PaymentStateResponse>(`/api/orders/${encodeURIComponent(orderId)}/abandon`),
  cancel: (orderId: string, reason?: string) =>
    apiPost<{ status: OrderStatus; refunded?: boolean; paymentStatus?: PaymentStatus }>(`/api/orders/${encodeURIComponent(orderId)}/cancel`, { reason }),
  refund: (orderId: string, amount?: number, reason?: string) =>
    apiPost<{ refundAmount: number; paymentStatus: PaymentStatus; status: OrderStatus }>(`/api/orders/${encodeURIComponent(orderId)}/refund`, { amount, reason }),
  rate: (orderId: string, rating: number, comment?: string) =>
    apiPost<{ ok: true }>(`/api/orders/${encodeURIComponent(orderId)}/rate`, { rating, comment }),
};
