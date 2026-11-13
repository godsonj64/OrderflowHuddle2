import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { CheckCircle2, Copy, Eye, ImagePlus, LocateFixed, MapPin, Upload, XCircle } from 'lucide-react';
import { db } from '../firebase';
import type { BusinessHours, DayHours, RestaurantProfile } from '../types';
import { useStore } from '../context/StoreContext';
import { AppearanceSettings } from '../components/settings/AppearanceSettings';
import { StorefrontPreview } from '../components/settings/StorefrontPreview';
import { Field, PageSpinner, Sheet, Spinner, Toggle, adminInput } from '../components/ui';
import { api } from '../lib/api';
import { parseAmount } from '../lib/money';
import { WEEK_DAYS, isValidTimeZone, normalizeHours } from '../lib/hours';
import { getStoreStatus } from '../lib/storeStatus';
import { geocodeAddressNominatim, isValidGeoPoint, reverseGeocodeNominatim, sanitizeGeoPoint } from '../lib/geo';
import { DOC_BUDGET_BYTES, estimateDocBytes, formatBytes, resizeWithPreset } from '../utils/imageUpload';
import { friendlyError } from '../utils/errorHandling';

const OrderTrackingMap = lazy(() =>
  import('../components/OrderTrackingMap').then((m) => ({ default: m.OrderTrackingMap })),
);

type Tab = 'store' | 'ordering' | 'payments' | 'hours' | 'appearance';
const TABS: { id: Tab; label: string }[] = [
  { id: 'store', label: 'Store' },
  { id: 'ordering', label: 'Ordering' },
  { id: 'payments', label: 'Payments' },
  { id: 'hours', label: 'Hours' },
  { id: 'appearance', label: 'Appearance' },
];

/** Never written from this page: maintained by the server or by the live dashboard controls. */
const SKIP_KEYS = new Set(['averageRating', 'totalRatings', 'pausedUntil']);

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object' && !(typeof (value as any).toMillis === 'function')) {
    return `{${Object.keys(value)
      .filter((k) => (value as any)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as any)[k])}`)
      .join(',')}}`;
  }
  if (value && typeof (value as any).toMillis === 'function') return String((value as any).toMillis());
  return JSON.stringify(value ?? null);
}

function normalize(profile: RestaurantProfile | null): RestaurantProfile {
  return {
    name: '',
    isAcceptingOrders: true,
    isPickupEnabled: true,
    isDeliveryEnabled: true,
    ...(profile || {}),
    businessHours: normalizeHours(profile?.businessHours),
    timezone: isValidTimeZone(profile?.timezone) ? profile!.timezone : browserTimeZone(),
    theme: { ...(profile?.theme || {}) },
    social: { ...(profile?.social || {}) },
  };
}

function Card({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 space-y-4">
      {title && (
        <div>
          <h3 className="font-bold text-gray-900">{title}</h3>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function MoneyInput({ value, onChange, placeholder = '0.00', suffix }: { value: number | undefined; onChange: (v: number) => void; placeholder?: string; suffix?: string }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    if (parseAmount(text) !== (value || 0)) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      {!suffix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseAmount(e.target.value, 0, { max: 100000 }));
        }}
        className={`${adminInput} font-mono tabular-nums ${suffix ? 'pr-10' : 'pl-6'}`}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">{suffix}</span>}
    </div>
  );
}

function DayRow({ day, hours, onChange }: { day: string; hours: DayHours; onChange: (h: DayHours) => void }) {
  return (
    <div className="py-3 space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label className="flex items-center gap-2.5 min-h-[36px] sm:w-36 shrink-0 font-semibold text-sm text-gray-900 cursor-pointer">
          <input
            type="checkbox"
            checked={!hours.closed}
            onChange={(e) => onChange({ ...hours, closed: !e.target.checked })}
            className="w-4 h-4 rounded accent-[#287350]"
          />
          {day}
          {hours.closed && <span className="ml-auto sm:hidden text-xs font-normal text-gray-400">Closed</span>}
        </label>
        {hours.closed ? (
          <span className="hidden sm:inline text-sm text-gray-400">Closed</span>
        ) : (
          <div className="grid grid-cols-[1fr_auto_1fr] sm:flex items-center gap-2 flex-1 sm:justify-end">
            <input
              type="time"
              value={hours.open}
              onChange={(e) => onChange({ ...hours, open: e.target.value })}
              className={`${adminInput} sm:w-[132px] font-mono tabular-nums`}
              aria-label={`${day} opens`}
            />
            <span className="text-gray-400 text-center">–</span>
            <input
              type="time"
              value={hours.close}
              onChange={(e) => onChange({ ...hours, close: e.target.value })}
              className={`${adminInput} sm:w-[132px] font-mono tabular-nums`}
              aria-label={`${day} closes`}
            />
          </div>
        )}
      </div>
      {!hours.closed && (
        <div className="pl-0 sm:pl-36 space-y-2">
          <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={!!hours.hasSecondSlot}
              onChange={(e) => onChange({ ...hours, hasSecondSlot: e.target.checked, open2: hours.open2 || '17:00', close2: hours.close2 || '21:00' })}
              className="w-4 h-4 rounded accent-[#287350]"
            />
            Split shift (e.g. lunch & dinner)
          </label>
          {hours.hasSecondSlot && (
            <div className="grid grid-cols-[1fr_auto_1fr] sm:flex items-center gap-2 sm:justify-end">
              <input
                type="time"
                value={hours.open2 || '17:00'}
                onChange={(e) => onChange({ ...hours, open2: e.target.value })}
                className={`${adminInput} sm:w-[132px] font-mono tabular-nums`}
                aria-label={`${day} second shift opens`}
              />
              <span className="text-gray-400 text-center">–</span>
              <input
                type="time"
                value={hours.close2 || '21:00'}
                onChange={(e) => onChange({ ...hours, close2: e.target.value })}
                className={`${adminInput} sm:w-[132px] font-mono tabular-nums`}
                aria-label={`${day} second shift closes`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const AdminSettings: React.FC = () => {
  const { profile, profileLoading, items } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'store') as Tab;
  const [draft, setDraft] = useState<RestaurantProfile>(() => normalize(profile));
  /** Normalized profile when this editing session started (or was last saved). */
  const initial = useRef<RestaurantProfile>(normalize(profile));
  /** Raw stored profile at that moment, used to detect fields that only need migrating (e.g. a missing time zone). */
  const rawInitial = useRef<RestaurantProfile | null>(profile);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [health, setHealth] = useState<{ firestore: string; cardPayments: boolean; webhooks: boolean } | null>(null);

  /**
   * Fields to write: edited on this page (or filled in by normalization) and still
   * different from what is stored. Fields changed live elsewhere — e.g. a pause or the
   * accepting-orders switch on the kitchen screen — are left alone unless edited here.
   */
  const changedKeys = useMemo(() => {
    const keys = new Set([...Object.keys(draft), ...Object.keys(initial.current), ...Object.keys(rawInitial.current || {})]);
    const out: string[] = [];
    for (const key of keys) {
      if (SKIP_KEYS.has(key)) continue;
      const next = stable((draft as any)[key]);
      const edited = next !== stable((initial.current as any)[key]);
      const migrated = stable((initial.current as any)[key]) !== stable((rawInitial.current as any)?.[key]);
      if ((edited || migrated) && next !== stable((profile as any)?.[key])) out.push(key);
    }
    return out;
  }, [draft, profile]);
  const dirty = changedKeys.length > 0;

  // Keep the form in sync with live changes while there are no unsaved edits.
  useEffect(() => {
    if (profileLoading) return;
    if (stable(draft) === stable(initial.current)) {
      const next = normalize(profile);
      initial.current = next;
      rawInitial.current = profile;
      setDraft(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, profileLoading]);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const update = (patch: Partial<RestaurantProfile>) => setDraft((d) => ({ ...d, ...patch }));
  const setTab = (t: Tab) => setParams((p) => {
    p.set('tab', t);
    return p;
  }, { replace: true });

  const bytes = useMemo(() => estimateDocBytes(draft), [draft]);
  const overBudget = bytes > DOC_BUDGET_BYTES;

  const discard = () => {
    const next = normalize(profile);
    initial.current = next;
    rawInitial.current = profile;
    setDraft(next);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error('Please enter your restaurant name.');
      setTab('store');
      return;
    }
    if (overBudget) {
      toast.error('Too many large images. Remove a few photos, then save again.');
      return;
    }
    setSaving(true);
    try {
      const ref = doc(db, 'restaurant', 'profile');
      if (!profile) {
        const full: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(draft)) if (!SKIP_KEYS.has(k) && v !== undefined) full[k] = v;
        full.name = draft.name.trim();
        await setDoc(ref, full);
      } else {
        const patch: Record<string, unknown> = {};
        for (const key of changedKeys) {
          const next = (draft as any)[key];
          patch[key] = next === undefined || next === null ? deleteField() : next;
        }
        if (typeof patch.name === 'string') patch.name = (patch.name as string).trim();
        if (Object.keys(patch).length) await updateDoc(ref, patch);
      }
      initial.current = draft;
      rawInitial.current = draft;
      toast.success('Settings saved');
    } catch (err) {
      toast.error(friendlyError(err, 'Could not save settings.'));
    } finally {
      setSaving(false);
    }
  };

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    try {
      const converted = await resizeWithPreset(file, 'logo');
      update({ logoUrl: converted });
      toast.success('Logo converted to WebP');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use that image.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const hours = draft.businessHours || normalizeHours(null);
  const setDay = (day: string, h: DayHours) => update({ businessHours: { ...hours, [day]: h } as BusinessHours });
  const copyMonday = (days: readonly string[]) => update({ businessHours: Object.fromEntries(WEEK_DAYS.map((d) => [d, days.includes(d) ? { ...hours.Monday } : hours[d]])) as BusinessHours });
  const draftStatus = useMemo(() => getStoreStatus({ ...draft, pausedUntil: null }), [draft]);
  const timeZones = useMemo<string[]>(() => {
    try {
      return (Intl as any).supportedValuesOf?.('timeZone') || [];
    } catch {
      return [];
    }
  }, []);

  if (profileLoading) return <PageSpinner label="Loading settings…" />;

  const cardConfigured = !!health?.cardPayments && !!import.meta.env.VITE_STRIPE_PUBLIC_KEY;
  const social = draft.social || {};

  return (
    <div className={`space-y-4 ${dirty ? 'pb-28' : ''}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Settings</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Changes go live for customers as soon as you save.</p>
        </div>
        <button
          onClick={() => setPreviewOpen(true)}
          className="lg:hidden min-h-[40px] px-3.5 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-xs sm:text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Eye size={15} /> Preview
        </button>
      </div>

      {/* Segmented settings tabs */}
      <div className="grid grid-cols-5 sm:inline-flex items-center gap-1 p-1 bg-gray-200/60 rounded-xl">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[36px] px-1.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-sm font-semibold transition whitespace-nowrap text-center truncate ${
              tab === t.id ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          {tab === 'store' && (
            <>
              <Card title="Brand">
                <div className="flex items-center gap-4">
                  <label className="w-20 h-20 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center cursor-pointer shrink-0">
                    {uploadingLogo ? <Spinner /> : draft.logoUrl ? <img src={draft.logoUrl} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="text-gray-300" />}
                    <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                  </label>
                  <div className="space-y-1.5">
                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold cursor-pointer">
                      <Upload size={16} /> {draft.logoUrl ? 'Replace logo' : 'Upload logo'}
                      <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                    </label>
                    {draft.logoUrl && (
                      <button type="button" onClick={() => update({ logoUrl: '' })} className="block text-xs font-semibold text-red-600">
                        Remove logo
                      </button>
                    )}
                  </div>
                </div>
                <Field label="Restaurant name">
                  <input value={draft.name} onChange={(e) => update({ name: e.target.value.slice(0, 99) })} className={adminInput} />
                </Field>
                <Field label="Description" hint="Shown in the header banner and footer.">
                  <textarea value={draft.description || ''} onChange={(e) => update({ description: e.target.value.slice(0, 1000) })} rows={3} className={`${adminInput} resize-none`} />
                </Field>
              </Card>
              <Card title="Contact & location">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Phone">
                    <input type="tel" value={draft.phone || ''} onChange={(e) => update({ phone: e.target.value.slice(0, 20) })} className={adminInput} />
                  </Field>
                  <Field label="Email">
                    <input type="email" value={draft.email || ''} onChange={(e) => update({ email: e.target.value.slice(0, 150) })} className={adminInput} />
                  </Field>
                </div>
                <Field label="Address" hint="Customers get a live OpenStreetMap view and directions link.">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={draft.address || ''}
                      onChange={(e) => update({ address: e.target.value.slice(0, 200) })}
                      className={`${adminInput} flex-1`}
                      placeholder="Street address or food trailer spot"
                    />
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!draft.address?.trim()) {
                            toast.error('Enter an address first, or tap Use current GPS.');
                            return;
                          }
                          const pt = await geocodeAddressNominatim(draft.address);
                          if (pt) {
                            update({ location: pt });
                            toast.success('Pinned address on OpenStreetMap');
                          } else {
                            toast.error('Could not find that address on OpenStreetMap.');
                          }
                        }}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <MapPin size={14} /> Locate address
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!('geolocation' in navigator)) {
                            toast.error('GPS is not supported by this browser.');
                            return;
                          }
                          navigator.geolocation.getCurrentPosition(
                            async (pos) => {
                              const pt = sanitizeGeoPoint({
                                lat: pos.coords.latitude,
                                lng: pos.coords.longitude,
                                accuracy: pos.coords.accuracy,
                                updatedAt: Date.now(),
                              });
                              if (pt) {
                                const rev = await reverseGeocodeNominatim(pt.lat, pt.lng);
                                update({
                                  location: pt,
                                  ...(rev && !draft.address?.trim() ? { address: rev.slice(0, 200) } : {}),
                                });
                                toast.success('Set trailer GPS to your current location');
                              }
                            },
                            () => toast.error('Could not read GPS location. Check browser permissions.'),
                            { enableHighAccuracy: true, timeout: 10000 },
                          );
                        }}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <LocateFixed size={14} /> Use current GPS
                      </button>
                    </div>
                  </div>
                </Field>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">OpenStreetMap pin (used for live order tracking & driver routes)</span>
                    {isValidGeoPoint(draft.location) && (
                      <button
                        type="button"
                        onClick={() => update({ location: undefined })}
                        className="text-red-600 font-semibold hover:underline"
                      >
                        Clear GPS pin
                      </button>
                    )}
                  </div>
                  <Suspense
                    fallback={
                      <div className="h-52 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400">
                        <Spinner size={18} />
                      </div>
                    }
                  >
                    <OrderTrackingMap
                      storePoint={draft.location || null}
                      storeLabel={draft.name || 'Huddle Snack Stop'}
                      onSelectPoint={(pt) => update({ location: pt })}
                      editablePin="store"
                      showRoute={false}
                      heightClassName="h-52 sm:h-60"
                    />
                  </Suspense>
                </div>
              </Card>
              <Card title="Social links" description="Shown as icons in your storefront footer. Use full links starting with https://">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      ['instagram', 'Instagram'],
                      ['tiktok', 'TikTok'],
                      ['facebook', 'Facebook'],
                      ['website', 'Website'],
                      ['maps', 'Google Maps link'],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input
                        type="url"
                        inputMode="url"
                        value={social[key] || ''}
                        onChange={(e) => update({ social: { ...social, [key]: e.target.value.trim().slice(0, 300) } })}
                        className={adminInput}
                        placeholder="https://"
                      />
                    </Field>
                  ))}
                </div>
              </Card>
            </>
          )}

          {tab === 'ordering' && (
            <>
              <Card title="Order types">
                <div className="divide-y divide-gray-100">
                  <Toggle label="Accept online orders" description="Turn off to pause all ordering (also available on the Orders screen)." checked={draft.isAcceptingOrders} onChange={(v) => update({ isAcceptingOrders: v })} />
                  <Toggle label="Pickup" checked={draft.isPickupEnabled !== false} onChange={(v) => update({ isPickupEnabled: v })} />
                  <Toggle label="Delivery" checked={draft.isDeliveryEnabled !== false} onChange={(v) => update({ isDeliveryEnabled: v })} />
                  <Toggle label="Scheduled orders" description="Let customers order ahead for a later time, even while you're closed." checked={!!draft.isSchedulePickupEnabled} onChange={(v) => update({ isSchedulePickupEnabled: v })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Usual wait time" hint="Shown to customers and used as the earliest scheduled time.">
                    <MoneyInput value={draft.estimatedPrepMinutes} onChange={(v) => update({ estimatedPrepMinutes: Math.min(240, Math.round(v)) })} placeholder="20" suffix="min" />
                  </Field>
                  {draft.isSchedulePickupEnabled && (
                    <Field label="Schedule up to">
                      <MoneyInput value={draft.scheduleDaysAhead} onChange={(v) => update({ scheduleDaysAhead: Math.min(30, Math.max(1, Math.round(v) || 1)) })} placeholder="7" suffix="days" />
                    </Field>
                  )}
                </div>
              </Card>
              <Card title="Fees & minimums" description="Applied automatically at checkout. The server recalculates every total, so prices can't be tampered with.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Delivery fee">
                    <MoneyInput value={draft.deliveryFee} onChange={(v) => update({ deliveryFee: v })} />
                  </Field>
                  <Field label="Free delivery over" hint="Leave at 0 for no free delivery.">
                    <MoneyInput value={draft.freeDeliveryThreshold} onChange={(v) => update({ freeDeliveryThreshold: v })} />
                  </Field>
                  <Field label="Minimum order">
                    <MoneyInput value={draft.minimumOrder} onChange={(v) => update({ minimumOrder: v })} />
                  </Field>
                  <Field label="Sales tax">
                    <MoneyInput value={draft.taxRate} onChange={(v) => update({ taxRate: Math.min(30, v) })} placeholder="0" suffix="%" />
                  </Field>
                  <Field label="Service fee" hint="Percentage of the food subtotal.">
                    <MoneyInput value={draft.serviceFeePercent} onChange={(v) => update({ serviceFeePercent: Math.min(30, v) })} placeholder="0" suffix="%" />
                  </Field>
                </div>
                <Toggle label="Waive the service fee (promotion)" description="Shows a “0% service fee” promo while active." checked={!!draft.promotionalZeroFee} onChange={(v) => update({ promotionalZeroFee: v })} />
              </Card>
            </>
          )}

          {tab === 'payments' && (
            <>
              <Card title="Card payments (Stripe)">
                <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${cardConfigured ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
                  {cardConfigured ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <XCircle size={18} className="shrink-0 mt-0.5" />}
                  <div>
                    {cardConfigured ? (
                      <>Stripe is connected. Customers can pay by card, Apple Pay and Google Pay.</>
                    ) : (
                      <>
                        Stripe is not configured. Add <code className="font-mono">STRIPE_SECRET_KEY</code> on the server and <code className="font-mono">VITE_STRIPE_PUBLIC_KEY</code> in the app
                        environment.
                      </>
                    )}
                    {cardConfigured && !health?.webhooks && (
                      <p className="mt-1 text-xs">Tip: also set STRIPE_WEBHOOK_SECRET so payments are confirmed even if a customer closes the page.</p>
                    )}
                  </div>
                </div>
                <Toggle label="Accept card payments" checked={draft.isCardPaymentEnabled !== false} onChange={(v) => update({ isCardPaymentEnabled: v })} disabled={!cardConfigured} />
                <Toggle label="Allow tips" description="Customers paying by card can add a tip for your team (and driver)." checked={draft.isTippingEnabled !== false} onChange={(v) => update({ isTippingEnabled: v })} />
              </Card>
              <Card title="Cash payments">
                <Toggle
                  label="Accept cash"
                  description="Customers can choose to pay with cash at pickup or to the driver. The order shows as “Cash due” until staff or the driver taps “Mark paid (cash)”."
                  checked={!!draft.isCashPaymentEnabled}
                  onChange={(v) => update({ isCashPaymentEnabled: v })}
                />
                <p className="text-xs text-gray-500">
                  Each customer can have at most 3 unpaid cash orders open at a time, to prevent prank orders.
                </p>
              </Card>
            </>
          )}

          {tab === 'hours' && (
            <>
              <Card title="Time zone" description="Your opening hours are applied in this time zone, wherever your customers are.">
                <div className="flex flex-col sm:flex-row gap-2">
                  {timeZones.length ? (
                    <select value={draft.timezone || ''} onChange={(e) => update({ timezone: e.target.value })} className={adminInput}>
                      {timeZones.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={draft.timezone || ''} onChange={(e) => update({ timezone: e.target.value })} className={adminInput} placeholder="America/New_York" />
                  )}
                  <button type="button" onClick={() => update({ timezone: browserTimeZone() })} className="shrink-0 min-h-[42px] px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs sm:text-sm font-semibold">
                    Use this device's time zone
                  </button>
                </div>
                {!isValidTimeZone(draft.timezone) && <p className="text-xs text-red-600">That time zone isn't recognized.</p>}
              </Card>
              <Card title="Opening hours">
                <p className={`text-xs sm:text-sm rounded-xl px-3.5 py-2.5 ${draftStatus.state === 'open' ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                  With these hours you are: <strong>{draftStatus.badge}</strong>
                  {draftStatus.detail ? ` · ${draftStatus.detail}` : ''}
                </p>
                <div className="divide-y divide-gray-100">
                  {WEEK_DAYS.map((day) => (
                    <DayRow key={day} day={day} hours={hours[day]} onChange={(h) => setDay(day, h)} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => copyMonday(WEEK_DAYS.slice(0, 5))} className="min-h-[38px] px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold flex items-center gap-1.5">
                    <Copy size={14} /> Copy Monday to weekdays
                  </button>
                  <button type="button" onClick={() => copyMonday(WEEK_DAYS)} className="min-h-[38px] px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold flex items-center gap-1.5">
                    <Copy size={14} /> Copy Monday to every day
                  </button>
                </div>
                <p className="text-xs text-gray-500">Closing after midnight? Just enter it (e.g. 18:00 – 02:00).</p>
              </Card>
            </>
          )}

          {tab === 'appearance' && <AppearanceSettings draft={draft} update={update} />}

          <p className={`text-xs tabular-nums ${overBudget ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
            Store images: {formatBytes(bytes)} of {formatBytes(DOC_BUDGET_BYTES)} used{overBudget ? ' — remove some photos before saving.' : ''}
          </p>
        </div>

        <aside className="hidden lg:block sticky top-24">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 text-center">Live preview</p>
          <StorefrontPreview profile={draft} items={items} />
        </aside>
      </div>

      <Sheet open={previewOpen} onClose={() => setPreviewOpen(false)} surface="admin" title="Preview" size="sm">
        <div className="py-5">
          <StorefrontPreview profile={draft} items={items} />
        </div>
      </Sheet>

      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] md:bottom-0 z-50 bg-white/95 backdrop-blur border-t border-gray-200 px-4 pt-3 pb-3 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <p className="text-sm font-semibold text-gray-700 hidden sm:block">You have unsaved changes</p>
            <button onClick={discard} disabled={saving} className="ml-auto px-5 py-2.5 rounded-xl bg-gray-100 font-semibold text-sm">
              Discard
            </button>
            <button onClick={save} disabled={saving || overBudget} className="px-6 py-2.5 rounded-xl bg-gray-900 text-white font-semibold text-sm flex items-center gap-2 disabled:opacity-50">
              {saving && <Spinner size={16} />} Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
