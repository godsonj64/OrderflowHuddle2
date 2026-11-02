import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { ChevronRight, Receipt, RotateCcw } from 'lucide-react';
import { db } from '../firebase';
import type { Order } from '../types';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { useStorefrontUI } from '../components/Layout';
import { PageSpinner } from '../components/ui';
import { formatMoney } from '../lib/money';
import { orderCode } from '../lib/ids';
import { formatDateTime, toMillis } from '../lib/dates';
import { customerStatusLabel, isActive, isCashDue } from '../lib/orderStatus';
import { reportError } from '../utils/errorHandling';

export const MyOrders: React.FC = () => {
  const { userProfile, loading: authLoading } = useAuth();
  const { catalog } = useStore();
  const { addToCart } = useCart();
  const { openAuth } = useStorefrontUI();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) {
      setLoading(false);
      return;
    }
    // Equality-only query: works without a composite index. Sorted on the client.
    const unsub = onSnapshot(
      query(collection(db, 'orders'), where('customerId', '==', userProfile.uid)),
      (snapshot) => {
        setOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Order));
        setLoading(false);
      },
      (error) => {
        reportError(error, 'my-orders');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [userProfile?.uid, authLoading]);

  const visible = useMemo(
    () =>
      orders
        // Abandoned checkouts are not real orders.
        .filter((o) => o.status !== 'payment_pending' && !(o.status === 'cancelled' && o.paymentStatus === 'failed'))
        .sort((a, b) => toMillis(b.createdAt, Date.now()) - toMillis(a.createdAt, Date.now())),
    [orders],
  );
  const active = visible.filter(isActive);
  const past = visible.filter((o) => !isActive(o));

  const reorder = (order: Order) => {
    let added = 0;
    for (const line of order.items) {
      const item = catalog.items.get(line.itemId);
      if (!item || !item.active || item.isSoldOut) continue;
      addToCart({ itemId: line.itemId, name: item.name, price: line.price, quantity: line.quantity, selectedModifiers: line.selectedModifiers || [], prepNotes: line.prepNotes });
      added += line.quantity;
    }
    if (added) toast.success(`Added ${added} item${added === 1 ? '' : 's'} to your cart`);
    else toast.error('These items are no longer available.');
  };

  if (authLoading || loading) return <PageSpinner label="Loading your orders…" />;

  if (!userProfile) {
    return (
      <div className="text-center py-20 max-w-sm mx-auto">
        <Receipt className="mx-auto text-muted mb-4" size={40} />
        <h1 className="text-2xl font-extrabold mb-2">Your orders</h1>
        <p className="text-muted mb-6">Sign in to see your order history and track deliveries.</p>
        <button onClick={openAuth} className="bg-brand text-on-brand px-6 py-3 rounded-btn font-semibold">
          Sign in
        </button>
      </div>
    );
  }

  const OrderRow = ({ order }: { order: Order }) => (
    <li className="bg-card rounded-card border border-line">
      <Link to={`/order/${order.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold">{customerStatusLabel(order)}</p>
            <p className="text-xs text-muted">
              #{orderCode(order)} · {formatDateTime(order.createdAt) || 'Just now'} · {order.type === 'delivery' ? 'Delivery' : 'Pickup'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold">{formatMoney(order.total)}</p>
            {isCashDue(order) && <p className="text-[11px] font-semibold text-amber-700">Cash due</p>}
          </div>
        </div>
        <p className="text-sm text-muted mt-2 line-clamp-1">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</p>
        {order.scheduledTime && <p className="text-xs font-semibold text-brand mt-1">Scheduled: {order.scheduledTime}</p>}
      </Link>
      <div className="flex border-t border-line text-sm font-semibold">
        <Link to={`/order/${order.id}`} className="flex-1 py-2.5 flex items-center justify-center gap-1 text-muted">
          Details <ChevronRight size={16} />
        </Link>
        {!isActive(order) && (
          <button onClick={() => reorder(order)} className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-brand border-l border-line">
            <RotateCcw size={15} /> Order again
          </button>
        )}
      </div>
    </li>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold">My orders</h1>

      {visible.length === 0 ? (
        <div className="bg-card rounded-card border border-line p-10 text-center">
          <Receipt className="mx-auto text-muted mb-3" size={36} />
          <h2 className="font-bold mb-1">No orders yet</h2>
          <p className="text-sm text-muted mb-6">When you place an order it will show up here.</p>
          <Link to="/" className="inline-block bg-brand text-on-brand px-6 py-3 rounded-btn font-semibold">
            Start ordering
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted mb-2">In progress</h2>
              <ul className="space-y-3">
                {active.map((o) => (
                  <OrderRow key={o.id} order={o} />
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted mb-2">Past orders</h2>
              <ul className="space-y-3">
                {past.map((o) => (
                  <OrderRow key={o.id} order={o} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};
