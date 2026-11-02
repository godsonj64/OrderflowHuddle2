import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { AlertCircle, Banknote, Bike, CalendarClock, CreditCard, Minus, Plus, ShoppingBag, Store, Tag, Trash2, X, Zap } from 'lucide-react';
import { db } from '../firebase';
import type { OrderType, PaymentMethod, PromoCode } from '../types';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { useStorefrontUI } from '../components/Layout';
import { useCartPricing } from '../hooks/useCartPricing';
import { ApiError, api } from '../lib/api';
import { formatMoney, fromCents, parseAmount } from '../lib/money';
import { TIP_PRESETS, computeTotals, promoDiscountCents, promoError, tipCents, type OrderTotals, type TipChoice } from '../lib/pricing';
import { generateTimeSlots, type TimeSlot } from '../lib/hours';
import { prepMinutes, scheduleDaysAhead } from '../lib/storeStatus';
import { ConfirmDialog, Spinner } from '../components/ui';
import { reportError } from '../utils/errorHandling';

const PaymentSheet = lazy(() => import('../components/CheckoutForm'));

const PENDING_KEY = 'pending_checkout_order';
const readPending = () => {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
};
const writePending = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(PENDING_KEY, id);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
};

const isValidPhone = (p: string) => /^[+()\-.\s\d]{7,20}$/.test(p.trim()) && p.replace(/\D/g, '').length >= 7;

const inputCls =
  'w-full rounded-btn border border-line bg-page px-3.5 py-3 text-sm text-ink placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-brand outline-none';

function Card({ title, children, id }: { title?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="bg-card rounded-card border border-line p-4 sm:p-5 scroll-mt-24">
      {title && <h2 className="font-bold text-base mb-3">{title}</h2>}
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon: React.ElementType; disabled?: boolean; hint?: string }[];
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(({ value: v, label, icon: Icon, disabled, hint }) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-btn border py-3 px-2 text-sm font-semibold transition disabled:opacity-40 ${
            value === v ? 'border-brand bg-brand text-on-brand' : 'border-line bg-page hover:bg-soft'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Icon size={16} /> {label}
          </span>
          {hint && <span className={`text-[11px] font-medium ${value === v ? 'opacity-85' : 'text-muted'}`}>{hint}</span>}
        </button>
      ))}
    </div>
  );
}

function TipSelector({ label, subtotalCents, value, onChange }: { label: string; subtotalCents: number; value: TipChoice; onChange: (v: TipChoice) => void }) {
  const [custom, setCustom] = useState(value.amount != null ? String(value.amount) : '');
  const isCustom = value.percent == null;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-sm text-muted">{formatMoney(fromCents(tipCents(subtotalCents, value)))}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {[0, ...TIP_PRESETS].map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => onChange({ percent: pct })}
            className={`py-2.5 rounded-btn text-sm font-semibold border transition ${
              !isCustom && value.percent === pct ? 'bg-brand text-on-brand border-brand' : 'bg-page border-line hover:bg-soft'
            }`}
          >
            {pct === 0 ? 'None' : `${pct}%`}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange({ percent: null, amount: parseAmount(custom, 0, { max: 500 }) })}
          className={`py-2.5 rounded-btn text-sm font-semibold border transition ${isCustom ? 'bg-brand text-on-brand border-brand' : 'bg-page border-line hover:bg-soft'}`}
        >
          Other
        </button>
      </div>
      {isCustom && (
        <div className="relative mt-2">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input
            inputMode="decimal"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              onChange({ percent: null, amount: parseAmount(e.target.value, 0, { max: 500 }) });
            }}
            className={`${inputCls} pl-7`}
            placeholder="0.00"
            aria-label={`${label} amount`}
          />
        </div>
      )}
    </div>
  );
}

function SummaryRows({ totals, promoCode }: { totals: OrderTotals; promoCode?: string | null }) {
  const row = (label: React.ReactNode, value: number, cls = '') => (
    <div className={`flex justify-between text-sm ${cls}`}>
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
  return (
    <div className="space-y-2">
      {row('Subtotal', totals.subtotal)}
      {totals.discount > 0 && row(`Discount${promoCode ? ` (${promoCode})` : ''}`, -totals.discount, 'text-emerald-700 font-medium')}
      {totals.deliveryFee > 0 && row('Delivery fee', totals.deliveryFee)}
      {totals.serviceFee > 0 && row('Service fee', totals.serviceFee)}
      {totals.tax > 0 && row('Tax', totals.tax)}
      {totals.restaurantTip > 0 && row('Tip', totals.restaurantTip)}
      {totals.deliveryTip > 0 && row('Driver tip', totals.deliveryTip)}
      <div className="flex justify-between font-extrabold text-lg pt-2 border-t border-line">
        <span>Total</span>
        <span>{formatMoney(totals.total)}</span>
      </div>
    </div>
  );
}

export const Cart: React.FC = () => {
  const navigate = useNavigate();
  const { cart, updateQuantity, removeFromCart, clearCart, promoCode, setPromoCode } = useCart();
  const { profile, status, cardPaymentsAvailable, cashPaymentsAvailable, serverReachable } = useStore();
  const { userProfile, loading: authLoading, updateContactInfo } = useAuth();
  const { openAuth } = useStorefrontUI();
  const pricing = useCartPricing();

  // --- Order type -----------------------------------------------------------
  const pickupEnabled = profile?.isPickupEnabled !== false;
  const deliveryEnabled = profile?.isDeliveryEnabled !== false;
  const [orderTypeChoice, setOrderType] = useState<OrderType>('pickup');
  const orderType: OrderType = orderTypeChoice === 'delivery' ? (deliveryEnabled ? 'delivery' : 'pickup') : pickupEnabled ? 'pickup' : 'delivery';

  // --- When -----------------------------------------------------------------
  const [whenChoice, setWhen] = useState<'asap' | 'later'>('asap');
  const when: 'asap' | 'later' = !status.canSchedule ? 'asap' : !status.canOrderNow ? 'later' : whenChoice;
  const slots: TimeSlot[] = useMemo(
    () =>
      profile && status.canSchedule
        ? generateTimeSlots(profile.businessHours, status.timeZone, new Date(), {
            leadMinutes: prepMinutes(profile),
            daysAhead: scheduleDaysAhead(profile),
            notBefore: status.pausedUntil,
          })
        : [],
    [profile, status],
  );
  const slotDays = useMemo(() => {
    const days: { key: string; label: string; slots: TimeSlot[] }[] = [];
    for (const s of slots) {
      const last = days[days.length - 1];
      if (last && last.key === s.dateKey) last.slots.push(s);
      else days.push({ key: s.dateKey, label: s.dayLabel, slots: [s] });
    }
    return days;
  }, [slots]);
  const [slotDayKey, setSlotDayKey] = useState('');
  const [slotIso, setSlotIso] = useState('');
  const selectedDay = slotDays.find((d) => d.key === slotDayKey) || slotDays[0];
  const selectedSlot = selectedDay?.slots.find((s) => s.iso === slotIso) || selectedDay?.slots[0];

  // --- Contact --------------------------------------------------------------
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const prefilled = useRef(false);
  useEffect(() => {
    if (!userProfile || prefilled.current) return;
    prefilled.current = true;
    setName((v) => v || userProfile.name || '');
    setPhone((v) => v || userProfile.phone || '');
    setAddress((v) => v || userProfile.savedAddresses?.[0] || '');
  }, [userProfile]);

  // --- Payment --------------------------------------------------------------
  const [methodChoice, setMethod] = useState<PaymentMethod>('card');
  const paymentMethod: PaymentMethod | null =
    methodChoice === 'cash' && cashPaymentsAvailable ? 'cash' : cardPaymentsAvailable ? 'card' : cashPaymentsAvailable ? 'cash' : null;
  const tippingEnabled = profile?.isTippingEnabled !== false && paymentMethod === 'card';
  const [tip, setTip] = useState<TipChoice>({ percent: 0 });
  const [driverTip, setDriverTip] = useState<TipChoice>({ percent: 0 });

  // --- Promo ----------------------------------------------------------------
  const [promo, setPromo] = useState<PromoCode | null>(null);
  const [promoLoaded, setPromoLoaded] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  useEffect(() => {
    setPromo(null);
    setPromoLoaded(false);
    if (!promoCode || !userProfile) return;
    let cancelled = false;
    getDoc(doc(db, 'promos', promoCode))
      .then((snap) => {
        if (cancelled) return;
        setPromo(snap.exists() ? ({ id: snap.id, ...snap.data() } as PromoCode) : null);
        setPromoLoaded(true);
      })
      .catch((err) => {
        reportError(err, 'load-promo', { toast: false });
        if (!cancelled) setPromoLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [promoCode, userProfile?.uid]);

  const promoProblem =
    promoCode && userProfile && promoLoaded
      ? promoError(promo, {
          uid: userProfile.uid,
          totalOrders: userProfile.totalOrders || 0,
          totalSpent: userProfile.totalSpent || 0,
          subtotalCents: pricing.subtotalCents,
          now: new Date(),
        })
      : null;
  const discountCents = promoCode && promoLoaded && !promoProblem ? promoDiscountCents(promo, pricing.subtotalCents) : 0;

  const totals = computeTotals({
    subtotalCents: pricing.subtotalCents,
    orderType,
    profile,
    discountCents,
    restaurantTipCents: tippingEnabled ? tipCents(pricing.subtotalCents, tip) : 0,
    deliveryTipCents: tippingEnabled && orderType === 'delivery' ? tipCents(pricing.subtotalCents, driverTip) : 0,
  });

  // --- Checkout -------------------------------------------------------------
  const [placing, setPlacing] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [payment, setPayment] = useState<{ orderId: string; clientSecret: string; amount: number } | null>(null);
  const [priceChange, setPriceChange] = useState<OrderTotals | null>(null);

  const contactErrors = {
    name: !name.trim() ? 'Please enter your name.' : '',
    phone: !isValidPhone(phone) ? 'Please enter a valid phone number so we can reach you.' : '',
    address: orderType === 'delivery' && address.trim().length < 5 ? 'Please enter your delivery address.' : '',
  };

  const blockers: string[] = [];
  if (pricing.ready && pricing.hasErrors) blockers.push('Remove the unavailable items from your cart.');
  if (status.state === 'offline') blockers.push("We're not accepting online orders right now.");
  else if (when === 'asap' && !status.canOrderNow) blockers.push(`We're closed right now.${status.detail ? ` ${status.detail}.` : ''}`);
  if (when === 'later' && !selectedSlot) blockers.push('No pickup times are available right now.');
  if (totals.minimumOrderShortfall > 0) {
    blockers.push(`Add ${formatMoney(totals.minimumOrderShortfall)} more to reach the ${formatMoney(profile?.minimumOrder || 0)} minimum.`);
  }
  if (!paymentMethod) blockers.push('Online payment is not available right now. Please call the restaurant.');
  if (!serverReachable) blockers.push("Can't reach the ordering server. Check your connection.");

  const finishOrder = (orderId: string) => {
    writePending(null);
    clearCart();
    toast.success('Order placed! 🎉');
    navigate(`/order/${orderId}`, { replace: true, state: { placed: true } });
  };

  const placeOrder = async (expectedTotalCents = totals.totalCents) => {
    setAttempted(true);
    if (!userProfile) {
      openAuth();
      return;
    }
    const firstContactError = Object.values(contactErrors).find(Boolean);
    if (firstContactError) {
      toast.error(firstContactError);
      document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (blockers.length || !paymentMethod) {
      toast.error(blockers[0] || 'Please review your order.');
      return;
    }

    setPlacing(true);
    try {
      const res = await api.checkout({
        items: pricing.inputs,
        orderType,
        paymentMethod,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        deliveryAddress: orderType === 'delivery' ? address.trim() : undefined,
        notes: notes.trim() || undefined,
        scheduledFor: when === 'later' ? selectedSlot?.iso : null,
        promoCode: promoCode && !promoProblem ? promoCode : null,
        tip: tippingEnabled ? { restaurant: tip, delivery: orderType === 'delivery' ? driverTip : undefined } : undefined,
        expectedTotalCents,
        replacesOrderId: readPending(),
      });

      // Remember contact details for next time (best effort).
      const updates: Parameters<typeof updateContactInfo>[0] = {};
      if (phone.trim() && phone.trim() !== userProfile.phone) updates.phone = phone.trim().slice(0, 20);
      if (!userProfile.name && name.trim()) updates.name = name.trim().slice(0, 100);
      if (orderType === 'delivery' && address.trim() && address.trim() !== userProfile.savedAddresses?.[0]) {
        updates.savedAddresses = [address.trim(), ...(userProfile.savedAddresses || []).filter((a) => a !== address.trim())].slice(0, 5);
      }
      if (Object.keys(updates).length) updateContactInfo(updates).catch(() => undefined);

      if (res.clientSecret) {
        writePending(res.orderId);
        setPayment({ orderId: res.orderId, clientSecret: res.clientSecret, amount: res.totals.total });
      } else {
        finishOrder(res.orderId);
      }
    } catch (err) {
      if (err instanceof ApiError && err.data?.code === 'PRICE_CHANGED' && err.data?.totals) {
        setPriceChange(err.data.totals as OrderTotals);
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not place your order. Please try again.', { duration: 6000 });
      }
    } finally {
      setPlacing(false);
    }
  };

  const onPaid = async (orderId: string) => {
    try {
      await api.confirmPayment(orderId);
    } catch {
      // The order page re-checks the payment, and the Stripe webhook also confirms it.
    }
    setPayment(null);
    finishOrder(orderId);
  };

  const onCancelPayment = () => {
    if (payment) api.abandon(payment.orderId).catch(() => undefined);
    writePending(null);
    setPayment(null);
  };

  // ---------------------------------------------------------------------------

  if (cart.length === 0) {
    return (
      <div className="text-center py-16 sm:py-24 max-w-md mx-auto">
        <div className="w-20 h-20 rounded-full bg-soft flex items-center justify-center mx-auto mb-6">
          <ShoppingBag className="text-muted" size={32} />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold mb-2">Your cart is empty</h1>
        <p className="text-muted mb-8">Add something delicious from the menu.</p>
        <Link to="/" className="inline-block bg-brand text-on-brand px-8 py-3.5 rounded-btn font-semibold">
          Browse the menu
        </Link>
      </div>
    );
  }

  const ctaLabel = !userProfile
    ? 'Sign in to order'
    : paymentMethod === 'cash'
      ? `Place order · ${formatMoney(totals.total)}`
      : `Continue to payment · ${formatMoney(totals.total)}`;
  const ctaDisabled = placing || authLoading || (!!userProfile && blockers.length > 0);

  const cta = (
    <button
      type="button"
      onClick={() => placeOrder()}
      disabled={ctaDisabled}
      className="w-full bg-brand text-on-brand py-4 rounded-btn font-bold text-base flex items-center justify-center gap-2 shadow-ios-lg disabled:opacity-50 active:scale-[0.99] transition"
    >
      {placing && <Spinner size={18} />}
      {ctaLabel}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-4 sm:mb-6">
        <h1 className="font-display text-2xl sm:text-4xl font-extrabold">Checkout</h1>
        <Link to="/" className="text-sm font-semibold text-brand">
          + Add items
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 lg:gap-8 items-start">
        <div className="space-y-4">
          {/* Items */}
          <Card title={`Your order (${pricing.itemCount || cart.reduce((s, i) => s + i.quantity, 0)})`}>
            <ul className="divide-y divide-line">
              {cart.map((line, index) => {
                const priced = pricing.lines[index];
                const unavailable = pricing.ready && priced && priced.status !== 'ok';
                const groups = new Map<string, string[]>();
                for (const m of line.selectedModifiers || []) {
                  const key = m.groupName || 'Options';
                  groups.set(key, [...(groups.get(key) || []), m.name]);
                }
                return (
                  <li key={line.cartItemId} className={`py-3 first:pt-0 last:pb-0 flex gap-3 ${unavailable ? 'opacity-90' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-3">
                        <h3 className={`font-semibold text-[15px] ${unavailable ? 'line-through text-muted' : ''}`}>{line.name}</h3>
                        <span className="font-semibold text-sm whitespace-nowrap">
                          {pricing.ready && priced?.status === 'ok' ? formatMoney(fromCents(priced.lineCents)) : formatMoney(line.price * line.quantity)}
                        </span>
                      </div>
                      {[...groups.entries()].map(([g, names]) => (
                        <p key={g} className="text-xs text-muted">
                          {g}: {names.join(', ')}
                        </p>
                      ))}
                      {line.prepNotes && <p className="text-xs text-muted italic">“{line.prepNotes}”</p>}
                      {unavailable && (
                        <p className="mt-1 text-xs font-semibold text-red-600 flex items-center gap-1">
                          <AlertCircle size={13} /> {priced.errors[0]}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3">
                        {!unavailable && (
                          <div className="flex items-center rounded-full border border-line">
                            <button
                              onClick={() => updateQuantity(line.cartItemId, line.quantity - 1)}
                              className="p-2"
                              aria-label={`Decrease ${line.name}`}
                              disabled={!!payment}
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-6 text-center text-sm font-bold">{line.quantity}</span>
                            <button
                              onClick={() => updateQuantity(line.cartItemId, line.quantity + 1)}
                              className="p-2"
                              aria-label={`Increase ${line.name}`}
                              disabled={!!payment}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        )}
                        <button onClick={() => removeFromCart(line.cartItemId)} className="text-xs font-semibold text-muted hover:text-red-600 flex items-center gap-1" disabled={!!payment}>
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Fulfilment */}
          <Card title="How would you like it?">
            <div className="space-y-4">
              <Segmented<OrderType>
                value={orderType}
                onChange={setOrderType}
                options={[
                  { value: 'pickup', label: 'Pickup', icon: Store, disabled: !pickupEnabled, hint: pickupEnabled ? 'Free' : 'Unavailable' },
                  {
                    value: 'delivery',
                    label: 'Delivery',
                    icon: Bike,
                    disabled: !deliveryEnabled,
                    hint: !deliveryEnabled ? 'Unavailable' : profile?.deliveryFee ? `${formatMoney(profile.deliveryFee)} fee` : 'Free',
                  },
                ]}
              />

              {orderType === 'delivery' && totals.freeDeliveryRemaining !== null && totals.freeDeliveryRemaining > 0 && (
                <p className="text-xs font-semibold text-brand bg-brand/5 rounded-btn px-3 py-2">
                  Add {formatMoney(totals.freeDeliveryRemaining)} more for free delivery.
                </p>
              )}

              {status.canSchedule && (
                <Segmented<'asap' | 'later'>
                  value={when}
                  onChange={setWhen}
                  options={[
                    {
                      value: 'asap',
                      label: 'ASAP',
                      icon: Zap,
                      disabled: !status.canOrderNow,
                      hint: status.canOrderNow ? `~${prepMinutes(profile)} min` : status.state === 'paused' ? 'Busy' : 'Closed now',
                    },
                    { value: 'later', label: 'Schedule', icon: CalendarClock, hint: 'Pick a time' },
                  ]}
                />
              )}

              {when === 'later' &&
                (slotDays.length ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                      {slotDays.map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => {
                            setSlotDayKey(d.key);
                            setSlotIso('');
                          }}
                          className={`shrink-0 px-4 py-2 rounded-chip text-sm font-semibold border ${
                            selectedDay?.key === d.key ? 'bg-brand text-on-brand border-brand' : 'bg-page border-line'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <select value={selectedSlot?.iso || ''} onChange={(e) => setSlotIso(e.target.value)} className={inputCls} aria-label="Time">
                      {selectedDay?.slots.map((s) => (
                        <option key={s.iso} value={s.iso}>
                          {s.timeLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-sm text-muted">No times available in the next few days.</p>
                ))}
            </div>
          </Card>

          {/* Contact */}
          <Card title="Your details" id="contact">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoComplete="name" maxLength={100} aria-label="Name" />
                  {attempted && contactErrors.name && <p className="text-xs text-red-600 mt-1">{contactErrors.name}</p>}
                </div>
                <div>
                  <input
                    className={inputCls}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={20}
                    aria-label="Phone number"
                  />
                  {attempted && contactErrors.phone && <p className="text-xs text-red-600 mt-1">{contactErrors.phone}</p>}
                </div>
              </div>
              {orderType === 'delivery' && (
                <div>
                  <input
                    className={inputCls}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Delivery address (street, apt, city)"
                    autoComplete="street-address"
                    maxLength={500}
                    aria-label="Delivery address"
                  />
                  {attempted && contactErrors.address && <p className="text-xs text-red-600 mt-1">{contactErrors.address}</p>}
                </div>
              )}
              <textarea
                className={`${inputCls} resize-none`}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
                placeholder="Notes for the kitchen: allergies, gate code, …"
                aria-label="Order notes"
              />
            </div>
          </Card>

          {/* Payment */}
          <Card title="Payment">
            <div className="space-y-4">
              {cardPaymentsAvailable && cashPaymentsAvailable ? (
                <Segmented<PaymentMethod>
                  value={paymentMethod || 'card'}
                  onChange={setMethod}
                  options={[
                    { value: 'card', label: 'Pay now', icon: CreditCard, hint: 'Card / Apple Pay' },
                    { value: 'cash', label: 'Cash', icon: Banknote, hint: orderType === 'delivery' ? 'Pay the driver' : 'Pay at pickup' },
                  ]}
                />
              ) : paymentMethod ? (
                <p className="text-sm flex items-center gap-2">
                  {paymentMethod === 'card' ? <CreditCard size={16} /> : <Banknote size={16} />}
                  {paymentMethod === 'card' ? 'Pay securely online with card, Apple Pay or Google Pay.' : `Pay with cash ${orderType === 'delivery' ? 'to your driver' : 'when you pick up'}.`}
                </p>
              ) : (
                <p className="text-sm text-red-600">Online payment isn't available right now.</p>
              )}

              {paymentMethod === 'cash' && (
                <p className="text-xs text-muted bg-soft rounded-btn px-3 py-2">
                  Please have {formatMoney(totals.total)} ready. You can tip in person.
                </p>
              )}

              {tippingEnabled && (
                <div className="space-y-4 pt-1">
                  <TipSelector label="Tip the team" subtotalCents={pricing.subtotalCents} value={tip} onChange={setTip} />
                  {orderType === 'delivery' && <TipSelector label="Tip your driver" subtotalCents={pricing.subtotalCents} value={driverTip} onChange={setDriverTip} />}
                </div>
              )}

              {/* Promo */}
              <div className="pt-1">
                {promoCode ? (
                  <div className={`flex items-start justify-between gap-3 rounded-btn border px-3 py-2.5 ${promoProblem ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}>
                    <div className="text-sm">
                      <div className="font-bold flex items-center gap-1.5">
                        <Tag size={14} /> {promoCode}
                      </div>
                      <div className={promoProblem ? 'text-amber-800' : 'text-emerald-800'}>
                        {!userProfile ? 'Sign in to use this code.' : !promoLoaded ? 'Checking…' : promoProblem || `You save ${formatMoney(fromCents(discountCents))}`}
                      </div>
                    </div>
                    <button onClick={() => setPromoCode(null)} className="p-1 text-muted" aria-label="Remove promo code">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const code = promoInput.trim().toUpperCase();
                      if (!code) return;
                      if (!userProfile) {
                        openAuth();
                        return;
                      }
                      setPromoCode(code);
                      setPromoInput('');
                    }}
                  >
                    <input
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      placeholder="Promo code"
                      className={`${inputCls} uppercase`}
                      aria-label="Promo code"
                      maxLength={50}
                    />
                    <button type="submit" disabled={!promoInput.trim()} className="px-4 rounded-btn bg-soft font-semibold text-sm disabled:opacity-50">
                      Apply
                    </button>
                  </form>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 space-y-3">
          <Card title="Summary">
            <SummaryRows totals={totals} promoCode={!promoProblem ? promoCode : null} />
            {blockers.length > 0 && userProfile && (
              <ul className="mt-4 space-y-1.5">
                {blockers.map((b) => (
                  <li key={b} className="text-xs font-semibold text-red-700 flex gap-1.5">
                    <AlertCircle size={14} className="shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            )}
            <div className="hidden lg:block mt-5">{cta}</div>
          </Card>
          <p className="text-[11px] text-muted text-center px-4">
            By placing an order you agree to our{' '}
            <Link to="/terms-of-service" className="underline">
              terms
            </Link>
            .
          </p>
        </aside>
      </div>

      {/* Mobile sticky checkout bar */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-card/95 backdrop-blur-xl border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {blockers.length > 0 && userProfile && <p className="text-[11px] font-semibold text-red-700 mb-2 text-center">{blockers[0]}</p>}
        {cta}
      </div>

      {payment && (
        <Suspense fallback={null}>
          <PaymentSheet open clientSecret={payment.clientSecret} orderId={payment.orderId} amount={payment.amount} onSuccess={onPaid} onCancel={onCancelPayment} />
        </Suspense>
      )}

      <ConfirmDialog
        open={!!priceChange}
        surface="store"
        title="Your total changed"
        message={
          priceChange ? (
            <>
              Prices or availability changed while you were ordering. Your new total is <strong className="text-ink">{formatMoney(priceChange.total)}</strong>.
            </>
          ) : null
        }
        confirmLabel="Continue"
        onCancel={() => setPriceChange(null)}
        onConfirm={() => {
          const expected = priceChange?.totalCents;
          setPriceChange(null);
          placeOrder(expected);
        }}
      />
    </div>
  );
};
