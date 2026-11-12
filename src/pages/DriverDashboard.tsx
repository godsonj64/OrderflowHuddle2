import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Camera, CheckCircle2, MapPin, Navigation, Package, Phone } from 'lucide-react';
import { db } from '../firebase';
import type { Order } from '../types';
import { useAuth } from '../context/AuthContext';
import { orderCode } from '../lib/ids';
import { formatMoney } from '../lib/money';
import { timeAgo, toMillis } from '../lib/dates';
import { isCashDue } from '../lib/orderStatus';
import { resizeWithPreset } from '../utils/imageUpload';
import { friendlyError, reportError } from '../utils/errorHandling';
import { Sheet, Spinner } from '../components/ui';

const mapsUrl = (address = '') => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

export const DriverDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [available, setAvailable] = useState<Order[]>([]);
  const [mine, setMine] = useState<Order[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<Order | null>(null);
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  const driverName = (userProfile?.name || userProfile?.email || 'Driver').slice(0, 100);

  useEffect(() => {
    if (!userProfile) return;
    const unsubAvailable = onSnapshot(
      query(collection(db, 'orders'), where('type', '==', 'delivery'), where('status', 'in', ['preparing', 'ready'])),
      (snap) => {
        setAvailable(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Order)
            .filter((o) => !o.driverId)
            .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt)),
        );
      },
      (err) => reportError(err, 'driver-available'),
    );
    const unsubMine = onSnapshot(
      query(collection(db, 'orders'), where('type', '==', 'delivery'), where('driverId', '==', userProfile.uid)),
      (snap) => {
        setMine(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order).filter((o) => !['completed', 'cancelled'].includes(o.status)));
      },
      (err) => reportError(err, 'driver-mine'),
    );
    return () => {
      unsubAvailable();
      unsubMine();
    };
  }, [userProfile?.uid]);

  const run = async (order: Order, patch: Record<string, unknown>, success: string) => {
    setBusyId(order.id);
    try {
      await updateDoc(doc(db, 'orders', order.id), { ...patch, updatedAt: serverTimestamp() });
      toast.success(success);
      return true;
    } catch (err) {
      const msg = (err as { code?: string })?.code === 'permission-denied' ? 'Another driver already took this delivery.' : friendlyError(err);
      toast.error(msg);
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const accept = (order: Order) =>
    run(order, { driverId: userProfile!.uid, driverName, deliveryStatus: 'assigned' }, 'Delivery accepted. Head to the kitchen when it is ready.');

  const pickedUp = (order: Order) => run(order, { status: 'out_for_delivery', deliveryStatus: 'picked_up' }, 'Picked up. Drive safe!');

  const openComplete = (order: Order) => {
    setCashConfirmed(false);
    setPhoto(null);
    setCompleting(order);
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await resizeWithPreset(file, 'proof'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use that photo.');
    }
  };

  const complete = async () => {
    if (!completing) return;
    const cashDue = isCashDue(completing);
    if (cashDue && !cashConfirmed) {
      toast.error(`Confirm that you collected ${formatMoney(completing.total)} in cash.`);
      return;
    }
    const ok = await run(
      completing,
      {
        status: 'completed',
        deliveryStatus: 'delivered',
        ...(photo ? { proofOfDeliveryImage: photo } : {}),
        ...(cashDue ? { paymentStatus: 'paid', paidAt: serverTimestamp(), paymentCollectedBy: driverName } : {}),
      },
      'Delivered! Great job.',
    );
    if (ok) setCompleting(null);
  };

  const cashToCollect = useMemo(() => mine.filter(isCashDue).reduce((sum, o) => sum + o.total, 0), [mine]);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Deliveries</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Accept a delivery, pick it up, then confirm drop-off.</p>
        </div>
        {cashToCollect > 0 && (
          <div className="text-right rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 shrink-0">
            <p className="text-[11px] font-semibold text-amber-800">Cash to collect</p>
            <p className="font-extrabold font-mono tabular-nums text-amber-900">{formatMoney(cashToCollect)}</p>
          </div>
        )}
      </div>

      {mine.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500">
            My active deliveries ({mine.length})
          </h2>
          {mine.map((order) => {
            const cashDue = isCashDue(order);
            const pickedUp_ = order.deliveryStatus === 'picked_up' || order.status === 'out_for_delivery';
            return (
              <article key={order.id} className="bg-gray-900 text-white rounded-2xl p-4 sm:p-5 space-y-4">
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-extrabold font-mono tabular-nums">#{orderCode(order)}</h3>
                    <p className="text-sm text-gray-300 mt-0.5">{order.customerName}</p>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wide bg-white/15 px-2.5 py-1 rounded-md">
                    {pickedUp_ ? 'On the way' : order.status === 'ready' ? 'Ready for pickup' : 'Being prepared'}
                  </span>
                </header>
                {cashDue && (
                  <p className="rounded-xl bg-amber-400 text-black px-4 py-2.5 text-sm font-extrabold font-mono tabular-nums">
                    Collect {formatMoney(order.total)} cash at drop-off
                  </p>
                )}
                <div className="rounded-xl bg-white/10 p-3.5 space-y-2 text-sm">
                  <p className="flex gap-2 font-medium">
                    <MapPin size={16} className="shrink-0 mt-0.5 text-gray-300" /> {order.deliveryAddress}
                  </p>
                  {order.notes && <p className="text-xs text-amber-200 font-medium">Note: {order.notes}</p>}
                  <p className="text-xs text-gray-300">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(' · ')}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={mapsUrl(order.deliveryAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-xl bg-white/10 hover:bg-white/15 py-2.5 text-xs font-semibold transition"
                  >
                    <Navigation size={17} /> Navigate
                  </a>
                  {order.customerPhone ? (
                    <a
                      href={`tel:${order.customerPhone}`}
                      className="min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-xl bg-white/10 hover:bg-white/15 py-2.5 text-xs font-semibold transition"
                    >
                      <Phone size={17} /> Call
                    </a>
                  ) : (
                    <span />
                  )}
                  {pickedUp_ ? (
                    <button
                      onClick={() => openComplete(order)}
                      className="min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 py-2.5 text-xs font-bold transition"
                    >
                      <CheckCircle2 size={17} /> Delivered
                    </button>
                  ) : (
                    <button
                      onClick={() => pickedUp(order)}
                      disabled={busyId === order.id || order.status !== 'ready'}
                      className="min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-xl bg-white text-gray-900 py-2.5 text-xs font-bold disabled:opacity-40 transition"
                      title={order.status !== 'ready' ? 'Wait until the kitchen marks it ready' : undefined}
                    >
                      {busyId === order.id ? <Spinner size={17} /> : <Package size={17} />} Picked up
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500">
          Available for pickup ({available.length})
        </h2>
        {available.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-500 text-sm">
            No deliveries waiting. New ones appear here automatically.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {available.map((order) => (
              <article key={order.id} className="bg-white rounded-2xl border border-gray-200/80 p-4 flex flex-col gap-3">
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-lg font-mono tabular-nums">#{orderCode(order)}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {order.customerName} · {timeAgo(order.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-md border ${
                      order.status === 'ready' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-700 border-orange-200'
                    }`}
                  >
                    {order.status === 'ready' ? 'Ready' : 'Cooking'}
                  </span>
                </header>
                <p className="text-sm text-gray-700 line-clamp-2">{order.deliveryAddress}</p>
                {isCashDue(order) && (
                  <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200/70 rounded-xl px-3 py-1.5 tabular-nums">
                    Cash order · collect {formatMoney(order.total)}
                  </p>
                )}
                <button
                  onClick={() => accept(order)}
                  disabled={busyId === order.id}
                  className="mt-auto w-full min-h-[44px] bg-gray-900 hover:bg-black text-white rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition"
                >
                  {busyId === order.id && <Spinner size={16} />} Accept delivery
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <Sheet
        open={!!completing}
        onClose={() => setCompleting(null)}
        surface="admin"
        size="sm"
        title={`Complete #${completing ? orderCode(completing) : ''}`}
        footer={
          <button onClick={complete} disabled={!!busyId} className="w-full bg-emerald-600 text-white rounded-2xl py-3.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {busyId && <Spinner size={16} />} Confirm delivery
          </button>
        }
      >
        {completing && (
          <div className="p-5 space-y-4">
            {isCashDue(completing) && (
              <label className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-4 cursor-pointer">
                <input type="checkbox" checked={cashConfirmed} onChange={(e) => setCashConfirmed(e.target.checked)} className="w-5 h-5 mt-0.5 accent-amber-600" />
                <span className="text-sm text-amber-900">
                  I collected <strong className="font-mono tabular-nums">{formatMoney(completing.total)}</strong> in cash from the customer.
                </span>
              </label>
            )}
            <div>
              <p className="text-sm font-semibold mb-2">Proof of delivery (optional)</p>
              {photo ? (
                <img src={photo} alt="Proof of delivery" className="rounded-2xl w-full max-h-64 object-cover" />
              ) : (
                <label className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-8 text-sm font-semibold text-gray-600 cursor-pointer">
                  <Camera size={18} /> Take a photo
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
                </label>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
