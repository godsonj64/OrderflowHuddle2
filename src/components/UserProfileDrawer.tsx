import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Award, Gift, LayoutDashboard, LogOut, Receipt, ShoppingBag, Truck } from 'lucide-react';
import { db } from '../firebase';
import type { PromoCode, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { toDate } from '../lib/dates';
import { friendlyError, reportError } from '../utils/errorHandling';
import { Sheet, Spinner } from './ui';

interface UserProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-btn border border-line bg-page text-ink placeholder:text-muted focus:ring-2 focus:ring-brand outline-none';

export const UserProfileDrawer: React.FC<UserProfileDrawerProps> = ({ isOpen, onClose, userProfile }) => {
  const { logout, updateContactInfo, isStaff, role } = useAuth();
  const { setPromoCode } = useCart();
  const navigate = useNavigate();
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });

  useEffect(() => {
    if (!isOpen) return;
    setForm({ name: userProfile.name || '', phone: userProfile.phone || '', address: userProfile.savedAddresses?.[0] || '' });
  }, [isOpen, userProfile]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingPromos(true);
    // Single-field query (no composite index needed); everything else is filtered here.
    getDocs(query(collection(db, 'promos'), where('active', '==', true)))
      .then((snapshot) => {
        if (cancelled) return;
        const now = Date.now();
        const mine = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as PromoCode)
          .filter((p) => {
            const expires = toDate(p.expiresAt);
            if (expires && expires.getTime() < now) return false;
            if (p.usageLimit && (p.usedCount || 0) >= p.usageLimit) return false;
            if (p.usedBy?.includes(userProfile.uid)) return false;
            if (p.assignedTo?.length) return p.assignedTo.includes(userProfile.uid);
            if (p.minOrders && (userProfile.totalOrders || 0) < p.minOrders) return false;
            if (p.minSpent && (userProfile.totalSpent || 0) < p.minSpent) return false;
            return true;
          });
        setPromos(mine);
      })
      .catch((err) => reportError(err, 'promo-inbox', { toast: false }))
      .finally(() => !cancelled && setLoadingPromos(false));
    return () => {
      cancelled = true;
    };
  }, [isOpen, userProfile.uid, userProfile.totalOrders, userProfile.totalSpent]);

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const addresses = [form.address.trim(), ...(userProfile.savedAddresses || []).filter((a) => a !== form.address.trim())]
        .filter(Boolean)
        .slice(0, 5);
      await updateContactInfo({ name: form.name.trim().slice(0, 100), phone: form.phone.trim().slice(0, 20), savedAddresses: addresses });
      toast.success('Details saved');
      setEditing(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const usePromo = (code: string) => {
    setPromoCode(code);
    toast.success(`${code} will be applied at checkout`);
    onClose();
    navigate('/cart');
  };

  const initial = (userProfile.name || userProfile.email || '?').charAt(0).toUpperCase();

  return (
    <Sheet open={isOpen} onClose={onClose} title="Your account" size="sm">
      <div className="p-5 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brand text-on-brand flex items-center justify-center text-2xl font-bold shrink-0">{initial}</div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold truncate">{userProfile.name || 'Hello!'}</h3>
            <p className="text-sm text-muted truncate">{userProfile.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-card bg-soft p-4">
            <Award size={18} className="text-brand mb-2" />
            <div className="text-2xl font-extrabold">{userProfile.loyaltyPoints || 0}</div>
            <div className="text-xs text-muted">Reward points</div>
          </div>
          <div className="rounded-card bg-soft p-4">
            <ShoppingBag size={18} className="text-brand mb-2" />
            <div className="text-2xl font-extrabold">{userProfile.totalOrders || 0}</div>
            <div className="text-xs text-muted">Orders</div>
          </div>
        </div>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold">Contact details</h3>
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-sm font-semibold text-brand">
                Edit
              </button>
            )}
          </div>
          {editing ? (
            <form onSubmit={saveContact} className="space-y-2.5">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" autoComplete="name" maxLength={100} />
              <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" type="tel" autoComplete="tel" maxLength={20} />
              <input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Delivery address" autoComplete="street-address" maxLength={300} />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-btn bg-soft font-semibold">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-btn bg-brand text-on-brand font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                  {saving && <Spinner size={16} />} Save
                </button>
              </div>
            </form>
          ) : (
            <div className="text-sm rounded-card border border-line divide-y divide-line">
              <div className="px-4 py-2.5 flex justify-between gap-3">
                <span className="text-muted">Phone</span>
                <span className="truncate">{userProfile.phone || '—'}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between gap-3">
                <span className="text-muted">Address</span>
                <span className="truncate text-right">{userProfile.savedAddresses?.[0] || '—'}</span>
              </div>
            </div>
          )}
        </section>

        <section>
          <h3 className="font-bold mb-2 flex items-center gap-2">
            <Gift size={18} className="text-brand" /> Your offers
          </h3>
          {loadingPromos ? (
            <div className="flex justify-center py-4 text-muted">
              <Spinner />
            </div>
          ) : promos.length ? (
            <div className="space-y-2">
              {promos.map((promo) => (
                <div key={promo.id} className="rounded-card border border-dashed border-brand/40 bg-brand/5 p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-brand">{promo.id}</div>
                    <div className="text-xs text-muted">
                      {promo.discountType === 'percentage' ? `${promo.discountValue}% off` : `$${promo.discountValue.toFixed(2)} off`}
                      {promo.minSubtotal ? ` orders over $${promo.minSubtotal.toFixed(2)}` : ''}
                      {promo.description ? ` · ${promo.description}` : ''}
                    </div>
                  </div>
                  <button onClick={() => usePromo(promo.id)} className="shrink-0 text-xs font-bold bg-brand text-on-brand px-3 py-2 rounded-btn">
                    Use
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted bg-soft rounded-card p-4 text-center">No offers right now. Check back soon!</p>
          )}
        </section>

        <div className="space-y-2 pt-2 border-t border-line">
          <Link to="/my-orders" onClick={onClose} className="flex items-center gap-3 px-4 py-3 rounded-btn bg-soft font-semibold">
            <Receipt size={18} /> Order history
          </Link>
          {isStaff && (
            <Link to="/admin" onClick={onClose} className="flex items-center gap-3 px-4 py-3 rounded-btn bg-brand text-on-brand font-semibold">
              <LayoutDashboard size={18} /> Restaurant dashboard
            </Link>
          )}
          {role === 'driver' && (
            <Link to="/driver" onClick={onClose} className="flex items-center gap-3 px-4 py-3 rounded-btn bg-brand text-on-brand font-semibold">
              <Truck size={18} /> Driver dashboard
            </Link>
          )}
          <button
            onClick={() => {
              onClose();
              logout();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-btn text-red-600 font-semibold hover:bg-red-50"
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </div>
    </Sheet>
  );
};
