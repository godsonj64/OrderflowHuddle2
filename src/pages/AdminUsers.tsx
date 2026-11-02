import React, { useEffect, useMemo, useState } from 'react';
import { arrayRemove, arrayUnion, collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { deleteApp, getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Mail, Phone, Search, Shield, Tag, UserPlus, X } from 'lucide-react';
import { db } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import type { PromoCode, UserProfile, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { authErrorMessage } from '../context/AuthContext';
import { ConfirmDialog, Field, PageSpinner, Sheet, Spinner, adminInput } from '../components/ui';
import { formatMoney } from '../lib/money';
import { friendlyError, reportError } from '../utils/errorHandling';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  restaurant_owner: 'Owner',
  manager: 'Manager',
  staff: 'Kitchen staff',
  driver: 'Driver',
  customer: 'Customer',
};

const ROLE_STYLE: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-800',
  restaurant_owner: 'bg-blue-100 text-blue-800',
  manager: 'bg-indigo-100 text-indigo-800',
  staff: 'bg-amber-100 text-amber-800',
  driver: 'bg-emerald-100 text-emerald-800',
  customer: 'bg-gray-100 text-gray-600',
};

/** Roles the current user may grant (mirrors canUpdateRole in firestore.rules). */
function assignableRoles(myRole: UserRole | null): UserRole[] {
  if (myRole === 'admin') return ['customer', 'driver', 'staff', 'manager', 'restaurant_owner', 'admin'];
  if (myRole === 'restaurant_owner') return ['customer', 'driver', 'staff', 'manager'];
  if (myRole === 'manager') return ['customer', 'driver', 'staff'];
  return [];
}

type Filter = 'all' | 'team' | 'customers';

export const AdminUsers: React.FC = () => {
  const { userProfile, role } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [roleChange, setRoleChange] = useState<{ user: UserProfile; role: UserRole } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'staff' as UserRole });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setUsers(snap.docs.map((d) => d.data() as UserProfile));
        setLoading(false);
      },
      (err) => {
        reportError(err, 'users');
        setLoading(false);
      },
    );
    const unsubPromos = onSnapshot(
      collection(db, 'promos'),
      (snap) => setPromos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PromoCode)),
      (err) => reportError(err, 'users-promos', { toast: false }),
    );
    return () => {
      unsubUsers();
      unsubPromos();
    };
  }, []);

  const grantable = assignableRoles(role);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => (filter === 'team' ? u.role !== 'customer' : filter === 'customers' ? u.role === 'customer' : true))
      .filter((u) => !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.phone?.includes(q) || u.role.includes(q))
      .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0) || (a.name || a.email).localeCompare(b.name || b.email));
  }, [users, search, filter]);

  // Keep the open sheet in sync with live data.
  const current = selected ? users.find((u) => u.uid === selected.uid) || selected : null;

  const confirmRole = async () => {
    if (!roleChange) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', roleChange.user.uid), { role: roleChange.role });
      toast.success(`${roleChange.user.name || roleChange.user.email} is now ${ROLE_LABEL[roleChange.role]}`);
      setRoleChange(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const setPromoAssignment = async (promo: PromoCode, user: UserProfile, assign: boolean) => {
    try {
      await updateDoc(doc(db, 'promos', promo.id), { assignedTo: assign ? arrayUnion(user.uid) : arrayRemove(user.uid) });
      toast.success(assign ? `${promo.id} sent to ${user.name || user.email}` : `${promo.id} removed`);
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // A secondary Firebase app creates the account without signing the manager out.
    const app = getApps().find((a) => a.name === 'SecondaryApp') || initializeApp(firebaseConfig, 'SecondaryApp');
    const secondaryAuth = getAuth(app);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, newUser.email.trim(), newUser.password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: newUser.email.trim(),
        name: newUser.name.trim().slice(0, 100),
        role: newUser.role,
        totalOrders: 0,
        totalSpent: 0,
        createdAt: serverTimestamp(),
      });
      toast.success(`Account created for ${newUser.email.trim()}`);
      setCreating(false);
      setNewUser({ email: '', password: '', name: '', role: 'staff' });
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      toast.error(code.startsWith('auth/') ? authErrorMessage(err) : friendlyError(err));
    } finally {
      await signOut(secondaryAuth).catch(() => undefined);
      await deleteApp(app).catch(() => undefined);
      setBusy(false);
    }
  };

  if (loading) return <PageSpinner label="Loading people…" />;

  const team = users.filter((u) => u.role !== 'customer').length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">People</h1>
          <p className="text-sm text-gray-500">
            {users.length - team} customers · {team} team members
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="px-4 py-2.5 rounded-2xl bg-gray-900 text-white font-semibold text-sm flex items-center gap-1.5">
          <UserPlus size={16} /> Add team member
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1.5">
          {(['all', 'team', 'customers'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3.5 py-2 rounded-full text-sm font-semibold capitalize ${filter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200'}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone" className={`${adminInput} pl-9`} />
        </div>
      </div>

      <ul className="bg-white rounded-3xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
        {visible.map((u) => (
          <li key={u.uid}>
            <button onClick={() => setSelected(u)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
              <span className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 shrink-0">{(u.name || u.email).charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold truncate">{u.name || u.email}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${ROLE_STYLE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                </span>
                <span className="block text-xs text-gray-500 truncate">{u.email}</span>
              </span>
              {u.role === 'customer' && (
                <span className="text-right text-xs text-gray-500 shrink-0">
                  <span className="block font-bold text-gray-900">{formatMoney(u.totalSpent || 0)}</span>
                  {u.totalOrders || 0} orders
                </span>
              )}
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="p-8 text-center text-sm text-gray-500">No one matches that search.</li>}
      </ul>

      <Sheet open={!!current} onClose={() => setSelected(null)} surface="admin" size="sm" title={current?.name || current?.email}>
        {current && (
          <div className="p-5 space-y-5">
            <div className="text-sm space-y-1.5">
              <p className="flex items-center gap-2 text-gray-600">
                <Mail size={15} /> {current.email}
              </p>
              {current.phone && (
                <a href={`tel:${current.phone}`} className="flex items-center gap-2 text-gray-600">
                  <Phone size={15} /> {current.phone}
                </a>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Orders', String(current.totalOrders || 0)],
                ['Spent', formatMoney(current.totalSpent || 0)],
                ['Points', String(current.loyaltyPoints || 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-gray-50 p-3">
                  <p className="font-extrabold">{value}</p>
                  <p className="text-[11px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            {current.uid !== userProfile?.uid && grantable.length > 0 && (
              <Field label={<span className="flex items-center gap-1.5"><Shield size={15} /> Role</span>}>
                <select
                  value={current.role}
                  disabled={!grantable.includes(current.role)}
                  onChange={(e) => setRoleChange({ user: current, role: e.target.value as UserRole })}
                  className={adminInput}
                >
                  {(grantable.includes(current.role) ? grantable : [current.role]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Tag size={15} /> Private promo codes
              </p>
              <div className="space-y-2">
                {promos.filter((p) => p.assignedTo?.includes(current.uid)).map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm">
                    <span className="font-mono font-bold">{p.id}</span>
                    <button onClick={() => setPromoAssignment(p, current, false)} className="p-1 text-gray-400 hover:text-red-600" aria-label={`Remove ${p.id}`}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <select
                  value=""
                  onChange={(e) => {
                    const promo = promos.find((p) => p.id === e.target.value);
                    if (promo) setPromoAssignment(promo, current, true);
                  }}
                  className={adminInput}
                >
                  <option value="">Send a promo code…</option>
                  {promos
                    .filter((p) => p.active && !p.assignedTo?.includes(current.uid))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id} ({p.discountType === 'percentage' ? `${p.discountValue}%` : formatMoney(p.discountValue)} off)
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500">Once a code is assigned to someone, only assigned customers can use it. It appears in their account under “Your offers”.</p>
              </div>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={creating}
        onClose={() => !busy && setCreating(false)}
        surface="admin"
        size="sm"
        title="Add team member"
        footer={
          <button form="new-user" type="submit" disabled={busy} className="w-full py-3 rounded-2xl bg-gray-900 text-white font-semibold flex items-center justify-center gap-2">
            {busy && <Spinner size={16} />} Create account
          </button>
        }
      >
        <form id="new-user" onSubmit={createUser} className="p-5 space-y-4">
          <Field label="Name">
            <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className={adminInput} required />
          </Field>
          <Field label="Email">
            <input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} className={adminInput} required />
          </Field>
          <Field label="Temporary password" hint="At least 6 characters. Ask them to change it with “Forgot password”.">
            <input type="password" minLength={6} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className={adminInput} required />
          </Field>
          <Field label="Role">
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })} className={adminInput}>
              {grantable
                .filter((r) => r !== 'customer')
                .map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
            </select>
          </Field>
        </form>
      </Sheet>

      <ConfirmDialog
        open={!!roleChange}
        busy={busy}
        title="Change role?"
        message={roleChange && `${roleChange.user.name || roleChange.user.email} will become ${ROLE_LABEL[roleChange.role]}.`}
        onCancel={() => setRoleChange(null)}
        onConfirm={confirmRole}
      />
    </div>
  );
};
