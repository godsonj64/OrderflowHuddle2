import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import Stripe from 'stripe';
import path from 'path';
import admin from 'firebase-admin';
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json';
import { initializeApp as initClientApp } from 'firebase/app';
import {
  getFirestore as getClientFirestore,
  doc as clientDoc,
  getDoc as getClientDoc,
} from 'firebase/firestore';
import {
  isManagerRole,
  isStaffRole,
  type MenuCategory,
  type MenuItem,
  type Order,
  type OrderType,
  type PaymentMethod,
  type PromoCode,
  type RestaurantProfile,
  type UserProfile,
  type UserRole,
} from './src/types';
import {
  MAX_CART_LINES,
  computeTotals,
  loyaltyPointsFor,
  priceLines,
  promoDiscountCents,
  promoError,
  tipCents,
  type CartLineInput,
} from './src/lib/pricing';
import { effectiveHours, getStoreStatus, prepMinutes, scheduleDaysAhead } from './src/lib/storeStatus';
import { formatAbsoluteSlot, isValidScheduledTime } from './src/lib/hours';
import { generateOrderCode } from './src/lib/ids';
import { fromCents, roundMoney, toCents } from './src/lib/money';
import { sanitizeGeoPoint } from './src/lib/geo';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const firebaseApp = admin.initializeApp({ projectId: firebaseConfig.projectId });
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
db.settings({ ignoreUndefinedProperties: true });

const clientApp = initClientApp(firebaseConfig, 'server-web-client');
const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

const PORT = Number(process.env.PORT) || 3000;
const CURRENCY = 'usd';
const MIN_CARD_CHARGE_CENTS = 50; // Stripe minimum for USD
const MAX_OPEN_UNPAID_CASH_ORDERS = 3;
/** Mirrors the bootstrap admin in firestore.rules. Override with ADMIN_EMAILS="a@x.com,b@y.com". */
const BOOTSTRAP_ADMINS = (process.env.ADMIN_EMAILS || 'godsonj64@gmail.com,godsonchristy25@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const route = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

let stripeClient: Stripe | null = null;
const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new HttpError(503, 'Card payments are not configured on the server.');
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

const serverTimestamp = () => FieldValue.serverTimestamp();
const ordersCol = () => db.collection('orders');

// ---------------------------------------------------------------------------
// Auth & input helpers
// ---------------------------------------------------------------------------

interface AuthedUser {
  uid: string;
  email: string;
  role: UserRole;
  profile: UserProfile | null;
}

async function authenticate(req: Request): Promise<AuthedUser> {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!match) throw new HttpError(401, 'Please sign in to continue.');
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }
  let profile: UserProfile | null = null;
  let role: UserRole = 'customer';
  try {
    const snap = await db.collection('users').doc(decoded.uid).get();
    profile = snap.exists ? (snap.data() as UserProfile) : null;
    if (profile?.role) role = profile.role;
  } catch {
    // If admin SDK has no credentials, role safely defaults to customer
  }
  if (decoded.email_verified && BOOTSTRAP_ADMINS.includes((decoded.email || '').toLowerCase())) role = 'admin';
  return { uid: decoded.uid, email: decoded.email || profile?.email || '', role, profile };
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isValidPhone(phone: string): boolean {
  return /^[+()\-.\s\d]{7,20}$/.test(phone) && phone.replace(/\D/g, '').length >= 7;
}

const rateBuckets = new Map<string, number[]>();
function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) throw new HttpError(429, 'Too many attempts. Please wait a minute and try again.');
  hits.push(now);
  rateBuckets.set(key, hits);
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (!v.some((t) => now - t < windowMs)) rateBuckets.delete(k);
  }
}

async function loadOrder(orderId: string): Promise<{ ref: DocumentReference; order: Order }> {
  const id = str(orderId, 64);
  if (!id || id.includes('/')) throw new HttpError(400, 'Invalid order id.');
  const ref = ordersCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Order not found.');
  return { ref, order: { id: snap.id, ...(snap.data() as Omit<Order, 'id'>) } };
}

function assertCanAccess(order: Order, user: AuthedUser) {
  if (order.customerId !== user.uid && !isStaffRole(user.role)) {
    throw new HttpError(403, 'You do not have access to this order.');
  }
}

// ---------------------------------------------------------------------------
// Customer / promo / menu statistics
// ---------------------------------------------------------------------------

interface StatsTargets {
  promo: DocumentSnapshot | null;
  items: DocumentSnapshot[];
}

/** Transactions must read before they write: load the docs whose counters we update. */
async function readStatsTargets(tx: Transaction, order: Order): Promise<StatsTargets> {
  const promo = order.promoCode ? await tx.get(db.collection('promos').doc(order.promoCode)) : null;
  const itemIds = [...new Set((order.items || []).map((l) => l.itemId).filter(Boolean))];
  const items = itemIds.length ? await tx.getAll(...itemIds.map((id) => db.collection('items').doc(id))) : [];
  return { promo, items };
}

/**
 * Records (direction = 1) or reverses (direction = -1) an order in the customer's
 * lifetime stats, the promo usage counter and per-item sales counts.
 */
function writeStats(tx: Transaction, order: Order, targets: StatsTargets, direction: 1 | -1) {
  const userUpdate: Record<string, unknown> = {
    totalOrders: FieldValue.increment(direction),
    totalSpent: FieldValue.increment(direction * roundMoney(order.total)),
    loyaltyPoints: FieldValue.increment(direction * loyaltyPointsFor(order.subtotal || 0, order.discountAmount || 0)),
  };
  if (direction === 1) userUpdate.lastOrderDate = serverTimestamp();
  tx.set(db.collection('users').doc(order.customerId), userUpdate, { merge: true });

  if (targets.promo?.exists) {
    tx.update(
      targets.promo.ref,
      direction === 1
        ? { usedCount: FieldValue.increment(1), usedBy: FieldValue.arrayUnion(order.customerId) }
        : { usedCount: FieldValue.increment(-1), usedBy: FieldValue.arrayRemove(order.customerId) },
    );
  }

  const qty = new Map<string, number>();
  for (const line of order.items || []) qty.set(line.itemId, (qty.get(line.itemId) || 0) + (Number(line.quantity) || 0));
  for (const snap of targets.items) {
    if (snap.exists) tx.update(snap.ref, { soldCount: FieldValue.increment(direction * (qty.get(snap.id) || 0)) });
  }
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** Marks a card order as paid after verifying the PaymentIntent. Idempotent. */
async function finalizePaidOrder(orderId: string, pi: Stripe.PaymentIntent): Promise<Order> {
  if (pi.status !== 'succeeded') throw new HttpError(409, 'Payment has not completed yet.');
  if (pi.metadata?.orderId !== orderId) throw new HttpError(409, 'This payment does not belong to this order.');

  return db.runTransaction(async (tx) => {
    const ref = ordersCol().doc(orderId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, 'Order not found.');
    const order = { id: snap.id, ...(snap.data() as Omit<Order, 'id'>) };
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded' || order.paymentStatus === 'partially_refunded') {
      return order;
    }
    if (pi.amount !== toCents(order.total) || pi.currency !== CURRENCY) {
      console.error(`[payments] Amount mismatch for order ${orderId}: intent=${pi.amount} ${pi.currency}, order=${toCents(order.total)}`);
      throw new HttpError(409, 'The payment amount does not match this order. Please contact the restaurant.');
    }
    const targets = await readStatsTargets(tx, order);
    const stillActive = order.status === 'payment_pending';
    tx.update(ref, {
      status: stillActive ? 'new' : order.status,
      paymentStatus: 'paid',
      paymentIntentId: pi.id,
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (stillActive) writeStats(tx, order, targets, 1);
    else console.warn(`[payments] Order ${orderId} was ${order.status} when its payment succeeded; staff may need to refund it.`);
    return { ...order, status: stillActive ? 'new' : order.status, paymentStatus: 'paid' as const };
  });
}

/** Cancels an unpaid card checkout (customer closed the payment sheet or retried). */
async function abandonPendingOrder(orderId: string, user: AuthedUser) {
  const { ref, order } = await loadOrder(orderId);
  assertCanAccess(order, user);
  if (order.status !== 'payment_pending') return { status: order.status, paymentStatus: order.paymentStatus };

  if (order.paymentIntentId && stripeEnabled()) {
    const stripe = getStripe();
    let pi = await stripe.paymentIntents.retrieve(order.paymentIntentId);
    if (pi.status === 'succeeded') {
      const paid = await finalizePaidOrder(order.id, pi);
      return { status: paid.status, paymentStatus: paid.paymentStatus };
    }
    if (pi.status === 'processing') return { status: order.status, paymentStatus: 'pending', processing: true };
    if (pi.status !== 'canceled') {
      try {
        pi = await stripe.paymentIntents.cancel(pi.id);
      } catch (err) {
        pi = await stripe.paymentIntents.retrieve(pi.id);
        if (pi.status === 'succeeded') {
          const paid = await finalizePaidOrder(order.id, pi);
          return { status: paid.status, paymentStatus: paid.paymentStatus };
        }
        throw err;
      }
    }
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get('status') !== 'payment_pending') return;
    tx.update(ref, {
      status: 'cancelled',
      paymentStatus: 'failed',
      cancelledBy: 'customer',
      cancelReason: 'Checkout was not completed',
      updatedAt: serverTimestamp(),
    });
  });
  return { status: 'cancelled', paymentStatus: 'failed' };
}

async function refundCardPayment(order: Order, amountCents: number, idempotencyKey: string, staffUid: string) {
  if (!order.paymentIntentId || order.paymentIntentId.startsWith('mock_')) return false;
  const stripe = getStripe();
  try {
    await stripe.refunds.create(
      { payment_intent: order.paymentIntentId, amount: amountCents, metadata: { orderId: order.id, by: staffUid } },
      { idempotencyKey },
    );
  } catch (err: any) {
    console.error(`[payments] Refund failed for order ${order.id}:`, err?.message);
    throw new HttpError(502, `The refund could not be processed (${err?.message || 'Stripe error'}). Nothing was changed.`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // Stripe webhooks need the raw body for signature verification, so this route is
  // registered before the JSON body parser.
  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    route(async (req, res) => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) throw new HttpError(400, 'Webhook secret not configured.');
      let event: Stripe.Event;
      try {
        event = getStripe().webhooks.constructEvent(req.body, String(req.headers['stripe-signature'] || ''), secret);
      } catch (err: any) {
        throw new HttpError(400, `Webhook signature verification failed: ${err?.message}`);
      }

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.orderId) await finalizePaidOrder(pi.metadata.orderId, pi);
      } else if (event.type === 'charge.refunded') {
        // Keep orders in sync when refunds are issued from the Stripe dashboard.
        const charge = event.data.object as Stripe.Charge;
        const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        if (piId) {
          const snap = await ordersCol().where('paymentIntentId', '==', piId).limit(1).get();
          const doc = snap.docs[0];
          if (doc) {
            const order = doc.data() as Order;
            const refunded = charge.amount_refunded;
            await doc.ref.update({
              refundAmount: fromCents(refunded),
              paymentStatus: refunded >= toCents(order.total) ? 'refunded' : 'partially_refunded',
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
      res.json({ received: true });
    }),
  );

  app.use(express.json({ limit: '200kb' }));

  // -------------------------------------------------------------------------
  // Public endpoints
  // -------------------------------------------------------------------------

  let health: { at: number; firestore: 'ok' | 'error' } | null = null;
  app.get(
    '/api/health',
    route(async (_req, res) => {
      if (!health || Date.now() - health.at > 60_000) {
        try {
          await Promise.race([
            getClientDoc(clientDoc(clientDb, 'restaurant', 'profile')),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
          ]);
          health = { at: Date.now(), firestore: 'ok' };
        } catch (err: any) {
          console.error('[health] Firestore is not reachable:', err?.message);
          health = { at: Date.now(), firestore: 'error' };
        }
      }
      res.json({
        status: 'ok',
        firestore: health.firestore,
        cardPayments: stripeEnabled(),
        webhooks: !!process.env.STRIPE_WEBHOOK_SECRET,
      });
    }),
  );

  app.get('/api/config', (_req, res) => {
    res.json({ cardPayments: stripeEnabled() });
  });

  app.post(
    '/api/create-payment-intent',
    route(async (req, res) => {
      const user = await authenticate(req);
      const amountCents = Math.round(Number(req.body?.amountCents));
      const orderId = str(req.body?.orderId, 64);
      if (!amountCents || amountCents < MIN_CARD_CHARGE_CENTS) {
        throw new HttpError(400, 'Invalid payment amount.');
      }
      if (!orderId) {
        throw new HttpError(400, 'Invalid order id.');
      }
      const pi = await getStripe().paymentIntents.create(
        {
          amount: amountCents,
          currency: CURRENCY,
          description: `Order #${orderId}`,
          metadata: { orderId, uid: user.uid },
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: `order-${orderId}` },
      );
      res.json({ clientSecret: pi.client_secret, paymentIntentId: pi.id });
    }),
  );

  // -------------------------------------------------------------------------
  // Checkout: the server prices the order from Firestore data. The client only
  // sends item ids, quantities and choices.
  // -------------------------------------------------------------------------

  app.post(
    '/api/checkout',
    route(async (req, res) => {
      const user = await authenticate(req);
      // Loose limit on attempts (customers fixing a form shouldn't be locked out);
      // a stricter limit applies to orders actually created, below.
      rateLimit(`checkout:${user.uid}`, 40, 10 * 60_000);

      const body = req.body || {};
      const orderType: OrderType = body.orderType === 'delivery' ? 'delivery' : 'pickup';
      const paymentMethod: PaymentMethod = body.paymentMethod === 'cash' ? 'cash' : 'card';
      const customerName = str(body.customerName, 100) || str(user.profile?.name, 100);
      const customerPhone = str(body.customerPhone, 20);
      const deliveryAddress = str(body.deliveryAddress, 500);
      const notes = str(body.notes, 1000);

      if (!customerName) throw new HttpError(400, 'Please enter your name.', { field: 'customerName' });
      if (!isValidPhone(customerPhone)) throw new HttpError(400, 'Please enter a valid phone number.', { field: 'customerPhone' });
      if (orderType === 'delivery' && deliveryAddress.length < 5) {
        throw new HttpError(400, 'Please enter your delivery address.', { field: 'deliveryAddress' });
      }

      const rawItems: any[] = Array.isArray(body.items) ? body.items : [];
      if (rawItems.length === 0) throw new HttpError(400, 'Your cart is empty.');
      if (rawItems.length > MAX_CART_LINES) throw new HttpError(400, `Orders are limited to ${MAX_CART_LINES} different items.`);
      const lines: CartLineInput[] = rawItems.map((raw) => ({
        itemId: str(raw?.itemId, 100),
        quantity: Number(raw?.quantity),
        selections: Array.isArray(raw?.selections)
          ? raw.selections.slice(0, 60).map((s: any) => ({ groupId: str(s?.groupId, 100), modifierId: str(s?.modifierId, 100) }))
          : [],
        notes: str(raw?.notes, 200),
      }));

      if (body.replacesOrderId) {
        await abandonPendingOrder(String(body.replacesOrderId), user).catch((err) =>
          console.warn('[checkout] Could not abandon previous attempt:', err?.message),
        );
      }

      const now = new Date();
      const profileSnap = await db.doc('restaurant/profile').get();
      if (!profileSnap.exists) throw new HttpError(503, 'This store is not set up for online orders yet.');
      const profile = profileSnap.data() as RestaurantProfile;
      const status = getStoreStatus(profile, now, { assumeOpenWithoutTimezone: true });
      const { hours, timeZone } = effectiveHours(profile, { assumeOpenWithoutTimezone: true });

      if (status.state === 'offline') throw new HttpError(409, 'Sorry, we are not accepting online orders right now.');
      if (orderType === 'pickup' && profile.isPickupEnabled === false) throw new HttpError(409, 'Pickup is not available right now.');
      if (orderType === 'delivery' && profile.isDeliveryEnabled === false) throw new HttpError(409, 'Delivery is not available right now.');

      let scheduledFor: Date | null = null;
      if (body.scheduledFor) {
        if (!status.canSchedule) throw new HttpError(409, 'Scheduled orders are not available right now.');
        scheduledFor = new Date(String(body.scheduledFor));
        const err = isValidScheduledTime(hours, timeZone, scheduledFor, now, {
          leadMinutes: prepMinutes(profile),
          daysAhead: scheduleDaysAhead(profile),
          notBefore: status.pausedUntil,
        });
        if (err) throw new HttpError(409, err, { field: 'scheduledFor' });
      } else if (!status.canOrderNow) {
        const why = status.state === 'paused' ? "We're very busy right now." : "We're closed right now.";
        throw new HttpError(409, `${why}${status.detail ? ` ${status.detail}.` : ''}${status.canSchedule ? ' You can schedule your order for later.' : ''}`, {
          field: 'scheduledFor',
        });
      }

      const cardAvailable = stripeEnabled() && profile.isCardPaymentEnabled !== false;
      const cashAvailable = profile.isCashPaymentEnabled === true;
      if (paymentMethod === 'card' && !cardAvailable) {
        throw new HttpError(409, cashAvailable ? 'Card payments are unavailable. Please choose cash.' : 'Online payments are not available right now.');
      }
      if (paymentMethod === 'cash' && !cashAvailable) throw new HttpError(409, 'Paying with cash is not available for online orders.');

      if (paymentMethod === 'cash') {
        const mine = await ordersCol().where('customerId', '==', user.uid).get();
        const openUnpaid = mine.docs
          .map((d) => d.data() as Order)
          .filter((o) => o.paymentMethod === 'cash' && o.paymentStatus === 'pending' && !['completed', 'cancelled', 'payment_pending'].includes(o.status));
        if (openUnpaid.length >= MAX_OPEN_UNPAID_CASH_ORDERS) {
          throw new HttpError(429, 'You already have several unpaid cash orders open. Please pay for those first or contact the restaurant.');
        }
      }

      // Authoritative catalog read.
      const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
      const itemSnaps = itemIds.length ? await db.getAll(...itemIds.map((id) => db.collection('items').doc(id))) : [];
      const items = new Map<string, MenuItem>();
      for (const s of itemSnaps) if (s.exists) items.set(s.id, { id: s.id, ...(s.data() as Omit<MenuItem, 'id'>) });
      const categoryIds = [...new Set([...items.values()].map((i) => i.categoryId).filter(Boolean))];
      const categorySnaps = categoryIds.length ? await db.getAll(...categoryIds.map((id) => db.collection('categories').doc(id))) : [];
      const activeCategoryIds = new Set(
        categorySnaps.filter((s) => s.exists && (s.data() as MenuCategory).active !== false).map((s) => s.id),
      );

      const priced = priceLines(lines, { items, activeCategoryIds });
      if (priced.hasErrors) {
        throw new HttpError(409, 'Some items in your cart need attention.', {
          code: 'CART_INVALID',
          lines: priced.lines.map((l, index) => ({ index, itemId: l.input.itemId, status: l.status, errors: l.errors })),
        });
      }
      if (priced.subtotalCents <= 0) throw new HttpError(400, 'Your cart is empty.');
      const minimumCents = toCents(profile.minimumOrder || 0);
      if (priced.subtotalCents < minimumCents) {
        throw new HttpError(409, `The minimum order is $${fromCents(minimumCents).toFixed(2)}.`);
      }

      let promoCode = '';
      let discountCents = 0;
      const requestedPromo = str(body.promoCode, 50).toUpperCase();
      if (requestedPromo) {
        const promoSnap = /^[A-Z0-9_-]+$/.test(requestedPromo) ? await db.collection('promos').doc(requestedPromo).get() : null;
        const promo = promoSnap?.exists ? ({ id: promoSnap.id, ...promoSnap.data() } as PromoCode) : null;
        const promoErr = promoError(promo, {
          uid: user.uid,
          totalOrders: Number(user.profile?.totalOrders) || 0,
          totalSpent: Number(user.profile?.totalSpent) || 0,
          subtotalCents: priced.subtotalCents,
          now,
        });
        if (promoErr) throw new HttpError(409, promoErr, { field: 'promoCode' });
        promoCode = requestedPromo;
        discountCents = promoDiscountCents(promo, priced.subtotalCents);
      }

      const tipsAllowed = paymentMethod === 'card' && profile.isTippingEnabled !== false;
      const totals = computeTotals({
        subtotalCents: priced.subtotalCents,
        orderType,
        profile,
        discountCents,
        restaurantTipCents: tipsAllowed ? tipCents(priced.subtotalCents, body.tip?.restaurant) : 0,
        deliveryTipCents: tipsAllowed && orderType === 'delivery' ? tipCents(priced.subtotalCents, body.tip?.delivery) : 0,
      });

      // The customer must have seen the same total we are about to charge.
      const expected = Number(body.expectedTotalCents);
      if (body.expectedTotalCents !== undefined && Number.isFinite(expected) && expected !== totals.totalCents) {
        throw new HttpError(409, `Prices were updated. Your new total is $${totals.total.toFixed(2)}.`, { code: 'PRICE_CHANGED', totals });
      }

      const isFree = totals.totalCents === 0;
      const chargeCard = paymentMethod === 'card' && !isFree;
      if (chargeCard && totals.totalCents < MIN_CARD_CHARGE_CENTS) throw new HttpError(409, 'Card payments must be at least $0.50.');

      const deliveryLocation = orderType === 'delivery' ? sanitizeGeoPoint(body.deliveryLocation) : null;

      const orderData: Omit<Order, 'id' | 'createdAt'> & Record<string, unknown> = {
        customerId: user.uid,
        customerName,
        customerEmail: user.email.slice(0, 150),
        customerPhone,
        items: priced.lines.map((l, i) => ({
          cartItemId: `L${i + 1}`,
          itemId: l.input.itemId,
          name: l.name,
          price: fromCents(l.unitCents),
          quantity: l.quantity,
          selectedModifiers: l.modifiers,
          ...(l.input.notes ? { prepNotes: l.input.notes } : {}),
        })),
        status: chargeCard ? 'payment_pending' : 'new',
        type: orderType,
        subtotal: totals.subtotal,
        discountAmount: totals.discount,
        promoCode: promoCode || undefined,
        deliveryFee: totals.deliveryFee,
        serviceFee: totals.serviceFee,
        tax: totals.tax,
        restaurantTip: totals.restaurantTip,
        deliveryTip: totals.deliveryTip,
        total: totals.total,
        deliveryAddress: orderType === 'delivery' ? deliveryAddress : undefined,
        deliveryLocation: deliveryLocation || undefined,
        notes: notes || undefined,
        scheduledFor: scheduledFor ? Timestamp.fromDate(scheduledFor) : undefined,
        scheduledTime: scheduledFor ? formatAbsoluteSlot(scheduledFor, timeZone) : undefined,
        paymentMethod,
        paymentStatus: isFree ? 'paid' : 'pending',
        updatedAt: serverTimestamp(),
      };

      rateLimit(`orders:${user.uid}`, 8, 10 * 60_000);

      // Create the order under a unique short code. Cash / free orders are "placed"
      // immediately, so their stats are recorded in the same transaction.
      let orderRef: DocumentReference | null = null;
      for (let attempt = 0; attempt < 6 && !orderRef; attempt++) {
        const code = generateOrderCode();
        const ref = ordersCol().doc(code);
        const created = await db.runTransaction(async (tx) => {
          const existing = await tx.get(ref);
          if (existing.exists) return false;
          const doc = { ...orderData, id: code, orderNumber: code } as unknown as Order;
          const targets = chargeCard ? null : await readStatsTargets(tx, doc);
          tx.create(ref, { ...orderData, orderNumber: code, createdAt: serverTimestamp() });
          if (targets) writeStats(tx, doc, targets, 1);
          return true;
        });
        if (created) orderRef = ref;
      }
      if (!orderRef) throw new HttpError(503, 'Could not create your order. Please try again.');

      let clientSecret: string | null = null;
      if (chargeCard) {
        try {
          const pi = await getStripe().paymentIntents.create(
            {
              amount: totals.totalCents,
              currency: CURRENCY,
              description: `Order #${orderRef.id}`,
              metadata: { orderId: orderRef.id, uid: user.uid },
              automatic_payment_methods: { enabled: true },
            },
            { idempotencyKey: `order-${orderRef.id}` },
          );
          clientSecret = pi.client_secret;
          await orderRef.update({ paymentIntentId: pi.id });
        } catch (err: any) {
          console.error('[checkout] Stripe error:', err?.message);
          await orderRef.update({ status: 'cancelled', paymentStatus: 'failed', cancelledBy: 'system', cancelReason: 'Payment could not be started' });
          throw new HttpError(502, 'We could not start the payment. Please try again in a moment.');
        }
      }

      res.json({
        orderId: orderRef.id,
        orderNumber: orderRef.id,
        status: chargeCard ? 'payment_pending' : 'new',
        paymentMethod,
        totals,
        clientSecret,
      });
    }),
  );

  // Confirms a card payment with Stripe (called by the browser after payment and as a
  // self-healing check when a "payment pending" order is opened).
  app.post(
    '/api/orders/:id/confirm-payment',
    route(async (req, res) => {
      const user = await authenticate(req);
      const { order } = await loadOrder(req.params.id);
      assertCanAccess(order, user);
      if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded' || order.paymentStatus === 'partially_refunded') {
        return res.json({ paid: true, status: order.status, paymentStatus: order.paymentStatus });
      }
      if (order.paymentMethod === 'cash' || !order.paymentIntentId) {
        return res.json({ paid: false, status: order.status, paymentStatus: order.paymentStatus });
      }
      const pi = await getStripe().paymentIntents.retrieve(order.paymentIntentId);
      if (pi.status === 'succeeded') {
        const updated = await finalizePaidOrder(order.id, pi);
        return res.json({ paid: true, status: updated.status, paymentStatus: updated.paymentStatus });
      }
      res.json({ paid: false, status: order.status, paymentStatus: order.paymentStatus, stripeStatus: pi.status });
    }),
  );

  app.post(
    '/api/orders/:id/abandon',
    route(async (req, res) => {
      const user = await authenticate(req);
      res.json(await abandonPendingOrder(req.params.id, user));
    }),
  );

  // Customers may cancel until the kitchen accepts the order; staff any time before it
  // is completed. Card payments are refunded automatically.
  app.post(
    '/api/orders/:id/cancel',
    route(async (req, res) => {
      const user = await authenticate(req);
      const { ref, order } = await loadOrder(req.params.id);
      assertCanAccess(order, user);
      const staff = isStaffRole(user.role);
      const reason = str(req.body?.reason, 300);

      if (order.status === 'cancelled') return res.json({ status: 'cancelled', paymentStatus: order.paymentStatus });
      if (order.status === 'payment_pending') return res.json(await abandonPendingOrder(order.id, user));
      if (order.status === 'completed') throw new HttpError(409, 'Completed orders cannot be cancelled. Issue a refund instead.');
      if (!staff && order.status !== 'new') {
        throw new HttpError(409, 'The kitchen has already accepted your order. Please call the restaurant to make changes.');
      }

      const paidByCard =
        order.paymentMethod !== 'cash' && !!order.paymentIntentId && ['paid', 'partially_refunded'].includes(order.paymentStatus || '');
      const remainingCents = toCents(order.total) - toCents(order.refundAmount || 0);
      let refunded = false;
      if (paidByCard && remainingCents > 0) {
        refunded = await refundCardPayment(order, remainingCents, `cancel-${order.id}`, user.uid);
      }

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = { id: snap.id, ...(snap.data() as Omit<Order, 'id'>) };
        if (current.status === 'cancelled') return;
        const targets = await readStatsTargets(tx, current);
        tx.update(ref, {
          status: 'cancelled',
          cancelledBy: staff && current.customerId !== user.uid ? 'staff' : 'customer',
          cancelReason: reason || undefined,
          ...(refunded ? { paymentStatus: 'refunded', refundAmount: current.total } : {}),
          updatedAt: serverTimestamp(),
        });
        writeStats(tx, current, targets, -1);
      });

      res.json({ status: 'cancelled', refunded, paymentStatus: refunded ? 'refunded' : order.paymentStatus });
    }),
  );

  // Partial or full refunds of card payments (managers and above).
  app.post(
    '/api/orders/:id/refund',
    route(async (req, res) => {
      const user = await authenticate(req);
      if (!isManagerRole(user.role)) throw new HttpError(403, 'Only managers can issue refunds.');
      const { ref, order } = await loadOrder(req.params.id);
      if (order.paymentMethod === 'cash' || !order.paymentIntentId) {
        throw new HttpError(409, 'Cash orders cannot be refunded online. Return the cash in person.');
      }
      if (!['paid', 'partially_refunded'].includes(order.paymentStatus || '')) {
        throw new HttpError(409, 'This order has no captured payment to refund.');
      }
      const totalCents = toCents(order.total);
      const refundedCents = toCents(order.refundAmount || 0);
      const remaining = totalCents - refundedCents;
      const rawAmount = req.body?.amount;
      const amountCents = rawAmount === undefined || rawAmount === null || rawAmount === '' ? remaining : toCents(rawAmount);
      if (!(amountCents > 0) || amountCents > remaining) {
        throw new HttpError(400, `The refund must be between $0.01 and $${fromCents(remaining).toFixed(2)}.`);
      }

      await refundCardPayment(order, amountCents, `refund-${order.id}-${refundedCents}-${amountCents}`, user.uid);

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = { id: snap.id, ...(snap.data() as Omit<Order, 'id'>) };
        const newRefunded = toCents(current.refundAmount || 0) + amountCents;
        const full = newRefunded >= toCents(current.total);
        const cancel = full && !['completed', 'cancelled'].includes(current.status);
        const targets = cancel ? await readStatsTargets(tx, current) : null;
        const update: Record<string, unknown> = {
          refundAmount: fromCents(newRefunded),
          paymentStatus: full ? 'refunded' : 'partially_refunded',
          updatedAt: serverTimestamp(),
        };
        if (cancel) {
          update.status = 'cancelled';
          update.cancelledBy = 'staff';
          update.cancelReason = str(req.body?.reason, 300) || 'Refunded';
        }
        tx.update(ref, update);
        if (targets) writeStats(tx, current, targets, -1);
        return { refundAmount: fromCents(newRefunded), paymentStatus: update.paymentStatus, status: (update.status as string) || current.status };
      });
      res.json(result);
    }),
  );

  // Ratings update the order and the restaurant / item averages shown on the menu.
  app.post(
    '/api/orders/:id/rate',
    route(async (req, res) => {
      const user = await authenticate(req);
      const rating = Math.round(Number(req.body?.rating));
      if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Please choose between 1 and 5 stars.');
      const comment = str(req.body?.comment, 1000);
      const { ref, order } = await loadOrder(req.params.id);
      if (order.customerId !== user.uid) throw new HttpError(403, 'Only the customer can rate this order.');
      if (order.status !== 'completed') throw new HttpError(409, 'You can rate your order once it is completed.');
      if (order.rating) throw new HttpError(409, 'You have already rated this order.');

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.get('rating')) return;
        const profileRef = db.doc('restaurant/profile');
        const profileSnap = await tx.get(profileRef);
        const itemIds = [...new Set(order.items.map((l) => l.itemId).filter(Boolean))];
        const itemSnaps = itemIds.length ? await tx.getAll(...itemIds.map((id) => db.collection('items').doc(id))) : [];

        tx.update(ref, { rating, ratingComment: comment || undefined, ratedAt: serverTimestamp() });
        const average = (prevAvg: unknown, prevCount: unknown) => {
          const count = Number(prevCount) || 0;
          const avg = Number(prevAvg) || 0;
          return { avg: Math.round(((avg * count + rating) / (count + 1)) * 100) / 100, count: count + 1 };
        };
        if (profileSnap.exists) {
          const next = average(profileSnap.get('averageRating'), profileSnap.get('totalRatings'));
          tx.update(profileRef, { averageRating: next.avg, totalRatings: next.count });
        }
        for (const s of itemSnaps) {
          if (!s.exists) continue;
          const next = average(s.get('rating'), s.get('ratingCount'));
          tx.update(s.ref, { rating: next.avg, ratingCount: next.count });
        }
      });
      res.json({ ok: true });
    }),
  );

  // Real-time GPS tracking store (in-memory + best-effort Firestore persistence)
  const liveOrderLocations = new Map<
    string,
    { driverLocation?: ReturnType<typeof sanitizeGeoPoint>; deliveryLocation?: ReturnType<typeof sanitizeGeoPoint>; updatedAt: number }
  >();

  app.get(
    '/api/orders/:id/location',
    route(async (req, res) => {
      await authenticate(req);
      const id = str(req.params.id, 64);
      const entry = liveOrderLocations.get(id);
      res.json({
        driverLocation: entry?.driverLocation || null,
        deliveryLocation: entry?.deliveryLocation || null,
        updatedAt: entry?.updatedAt || null,
      });
    }),
  );

  app.post(
    '/api/orders/:id/location',
    route(async (req, res) => {
      const user = await authenticate(req);
      rateLimit(`gps:${user.uid}`, 120, 60_000);
      const id = str(req.params.id, 64);
      if (!id || id.includes('/')) throw new HttpError(400, 'Invalid order id.');

      const driverLoc = sanitizeGeoPoint(req.body?.driverLocation);
      const deliveryLoc = sanitizeGeoPoint(req.body?.deliveryLocation);
      if (!driverLoc && !deliveryLoc) throw new HttpError(400, 'Valid GPS coordinates are required.');

      const current = liveOrderLocations.get(id) || { updatedAt: Date.now() };
      const next = {
        driverLocation: driverLoc || current.driverLocation,
        deliveryLocation: deliveryLoc || current.deliveryLocation,
        updatedAt: Date.now(),
      };
      liveOrderLocations.set(id, next);

      // Best-effort persistence to Firestore if Admin SDK has credentials
      const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (driverLoc) patch.driverLocation = driverLoc;
      if (deliveryLoc) patch.deliveryLocation = deliveryLoc;
      ordersCol()
        .doc(id)
        .update(patch)
        .catch(() => undefined);

      res.json({
        ok: true,
        driverLocation: next.driverLocation || null,
        deliveryLocation: next.deliveryLocation || null,
      });
    }),
  );

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // -------------------------------------------------------------------------
  // Frontend
  // -------------------------------------------------------------------------

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // dist/ also contains the bundled server; never serve it as a static file.
    app.use((req, res, next) => (/^\/server\.js(\.map)?$/.test(req.path) ? res.status(404).end() : next()));
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handler: friendly messages for known errors, no internals leaked otherwise.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...(err.details || {}) });
    }
    const message = String(err?.message || '');
    if (/default credentials|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message) || err?.code === 7 || err?.code === 16) {
      console.error('[server] Firebase Admin SDK cannot access Firestore. Check the service account credentials.', message);
      return res.status(503).json({ error: 'Online ordering is temporarily unavailable. Please try again shortly.' });
    }
    console.error('[server] Unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!stripeEnabled()) console.log('[server] STRIPE_SECRET_KEY is not set: card payments are disabled.');
  });
}

startServer();
