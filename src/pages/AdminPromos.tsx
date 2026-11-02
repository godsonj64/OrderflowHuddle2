import React, { useEffect, useState } from 'react';
import { Timestamp, collection, deleteDoc, deleteField, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { CalendarClock, Pencil, Plus, Tag, Trash2, Users } from 'lucide-react';
import { db } from '../firebase';
import type { PromoCode } from '../types';
import { ConfirmDialog, Field, PageSpinner, Sheet, Spinner, Toggle, adminInput } from '../components/ui';
import { formatMoney, parseAmount } from '../lib/money';
import { toDate } from '../lib/dates';
import { friendlyError, reportError } from '../utils/errorHandling';

interface Form {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  description: string;
  expiresAt: string; // datetime-local
  usageLimit: string;
  minSubtotal: string;
  minOrders: string;
  minSpent: string;
  active: boolean;
}

const emptyForm: Form = { code: '', discountType: 'percentage', discountValue: '10', description: '', expiresAt: '', usageLimit: '', minSubtotal: '', minOrders: '', minSpent: '', active: true };

function toLocalInput(value: any): string {
  const d = toDate(value);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fromPromo = (p: PromoCode): Form => ({
  code: p.id,
  discountType: p.discountType,
  discountValue: String(p.discountValue),
  description: p.description || '',
  expiresAt: toLocalInput(p.expiresAt),
  usageLimit: p.usageLimit ? String(p.usageLimit) : '',
  minSubtotal: p.minSubtotal ? String(p.minSubtotal) : '',
  minOrders: p.minOrders ? String(p.minOrders) : '',
  minSpent: p.minSpent ? String(p.minSpent) : '',
  active: p.active,
});

function describe(p: PromoCode): string {
  const parts = [p.discountType === 'percentage' ? `${p.discountValue}% off` : `${formatMoney(p.discountValue)} off`];
  if (p.minSubtotal) parts.push(`orders over ${formatMoney(p.minSubtotal)}`);
  if (p.minOrders) parts.push(`after ${p.minOrders} orders`);
  if (p.minSpent) parts.push(`after ${formatMoney(p.minSpent)} spent`);
  return parts.join(' · ');
}

export const AdminPromos: React.FC = () => {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ promo: PromoCode | null; form: Form } | null>(null);
  const [toDelete, setToDelete] = useState<PromoCode | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'promos'),
      (snap) => {
        setPromos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PromoCode).sort((a, b) => Number(b.active) - Number(a.active) || a.id.localeCompare(b.id)));
        setLoading(false);
      },
      (err) => {
        reportError(err, 'promos');
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const save = async () => {
    if (!editing) return;
    const f = editing.form;
    const code = f.code.trim().toUpperCase();
    const value = parseAmount(f.discountValue);
    if (!/^[A-Z0-9_-]{2,50}$/.test(code)) return toast.error('Codes use 2–50 letters, numbers, - or _.');
    if (!(value > 0)) return toast.error('Enter a discount greater than 0.');
    if (f.discountType === 'percentage' && value > 100) return toast.error('A percentage discount cannot exceed 100%.');
    const expires = f.expiresAt ? new Date(f.expiresAt) : null;
    if (expires && Number.isNaN(expires.getTime())) return toast.error('Check the expiry date.');

    const optional = (raw: string, integer = false) => {
      const n = parseAmount(raw);
      return n > 0 ? (integer ? Math.floor(n) : n) : null;
    };
    const fields: Record<string, unknown> = {
      discountType: f.discountType,
      discountValue: value,
      active: f.active,
      description: f.description.trim().slice(0, 200),
      expiresAt: expires ? Timestamp.fromDate(expires) : null,
      usageLimit: optional(f.usageLimit, true),
      minSubtotal: optional(f.minSubtotal),
      minOrders: optional(f.minOrders, true),
      minSpent: optional(f.minSpent),
    };

    setBusy(true);
    try {
      const ref = doc(db, 'promos', code);
      if (editing.promo) {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) patch[k] = v === null ? deleteField() : v;
        await updateDoc(ref, patch);
        toast.success('Promo updated');
      } else {
        if ((await getDoc(ref)).exists()) {
          toast.error(`${code} already exists. Edit it instead.`);
          return;
        }
        const data: Record<string, unknown> = { id: code, usedCount: 0, usedBy: [], createdAt: serverTimestamp() };
        for (const [k, v] of Object.entries(fields)) if (v !== null) data[k] = v;
        await setDoc(ref, data);
        toast.success(`${code} created`);
      }
      setEditing(null);
    } catch (err) {
      toast.error(friendlyError(err, 'Could not save the promo.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p: PromoCode) => {
    try {
      await updateDoc(doc(db, 'promos', p.id), { active: !p.active });
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'promos', toDelete.id));
      toast.success('Promo deleted');
      setToDelete(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSpinner label="Loading promos…" />;

  const f = editing?.form;
  const setF = (patch: Partial<Form>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">Promo codes</h1>
          <p className="text-sm text-gray-500">Discounts are validated and applied by the server at checkout.</p>
        </div>
        <button onClick={() => setEditing({ promo: null, form: { ...emptyForm } })} className="px-4 py-2.5 rounded-2xl bg-gray-900 text-white font-semibold text-sm flex items-center gap-1.5">
          <Plus size={16} /> New code
        </button>
      </div>

      {promos.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-10 text-center text-gray-500">No promo codes yet. Create one to reward regulars or run a weekend deal.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {promos.map((p) => {
            const expires = toDate(p.expiresAt);
            const expired = !!expires && expires.getTime() < Date.now();
            const exhausted = !!p.usageLimit && p.usedCount >= p.usageLimit;
            return (
              <article key={p.id} className={`bg-white rounded-3xl border p-4 space-y-3 ${p.active && !expired && !exhausted ? 'border-gray-100' : 'border-gray-100 opacity-70'}`}>
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-extrabold font-mono text-lg flex items-center gap-2">
                      <Tag size={16} className="text-gray-400" /> {p.id}
                    </h3>
                    <p className="text-sm text-gray-600">{describe(p)}</p>
                    {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                  </div>
                  <button
                    onClick={() => toggle(p)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {p.active ? 'Active' : 'Off'}
                  </button>
                </header>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users size={13} /> {p.usedCount || 0}
                    {p.usageLimit ? ` / ${p.usageLimit}` : ''} used{exhausted ? ' (limit reached)' : ''}
                  </span>
                  <span className={`flex items-center gap-1 ${expired ? 'text-red-600 font-semibold' : ''}`}>
                    <CalendarClock size={13} /> {expires ? `${expired ? 'Expired' : 'Expires'} ${expires.toLocaleDateString()}` : 'No expiry'}
                  </span>
                  {!!p.assignedTo?.length && <span>Private · {p.assignedTo.length} customer{p.assignedTo.length === 1 ? '' : 's'}</span>}
                </div>
                <footer className="flex gap-2">
                  <button onClick={() => setEditing({ promo: p, form: fromPromo(p) })} className="flex-1 py-2.5 rounded-2xl bg-gray-100 text-sm font-semibold flex items-center justify-center gap-1.5">
                    <Pencil size={15} /> Edit
                  </button>
                  <button onClick={() => setToDelete(p)} className="px-4 py-2.5 rounded-2xl text-red-600 hover:bg-red-50 text-sm font-semibold" aria-label={`Delete ${p.id}`}>
                    <Trash2 size={15} />
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <Sheet
        open={!!editing}
        onClose={() => !busy && setEditing(null)}
        surface="admin"
        size="md"
        title={editing?.promo ? `Edit ${editing.promo.id}` : 'New promo code'}
        footer={
          <button onClick={save} disabled={busy} className="w-full py-3 rounded-2xl bg-gray-900 text-white font-semibold flex items-center justify-center gap-2">
            {busy && <Spinner size={16} />} Save
          </button>
        }
      >
        {f && (
          <div className="p-5 space-y-4">
            <Field label="Code" hint="Customers type this at checkout.">
              <input value={f.code} disabled={!!editing?.promo} onChange={(e) => setF({ code: e.target.value.toUpperCase().replace(/\s/g, '') })} className={`${adminInput} font-mono uppercase`} placeholder="SUMMER20" maxLength={50} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select value={f.discountType} onChange={(e) => setF({ discountType: e.target.value as Form['discountType'] })} className={adminInput}>
                  <option value="percentage">Percent off</option>
                  <option value="fixed">Amount off ($)</option>
                </select>
              </Field>
              <Field label={f.discountType === 'percentage' ? 'Percent' : 'Amount'}>
                <input type="number" inputMode="decimal" min={0} max={f.discountType === 'percentage' ? 100 : undefined} value={f.discountValue} onChange={(e) => setF({ discountValue: e.target.value })} className={adminInput} />
              </Field>
            </div>
            <Field label="Description" hint="Optional. Shown to customers in their offers.">
              <input value={f.description} onChange={(e) => setF({ description: e.target.value })} className={adminInput} maxLength={200} placeholder="Weekend special" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minimum order ($)">
                <input type="number" inputMode="decimal" min={0} value={f.minSubtotal} onChange={(e) => setF({ minSubtotal: e.target.value })} className={adminInput} placeholder="None" />
              </Field>
              <Field label="Total uses limit">
                <input type="number" inputMode="numeric" min={0} value={f.usageLimit} onChange={(e) => setF({ usageLimit: e.target.value })} className={adminInput} placeholder="Unlimited" />
              </Field>
              <Field label="Unlock after # orders">
                <input type="number" inputMode="numeric" min={0} value={f.minOrders} onChange={(e) => setF({ minOrders: e.target.value })} className={adminInput} placeholder="Anyone" />
              </Field>
              <Field label="Unlock after $ spent">
                <input type="number" inputMode="decimal" min={0} value={f.minSpent} onChange={(e) => setF({ minSpent: e.target.value })} className={adminInput} placeholder="Anyone" />
              </Field>
            </div>
            <Field label="Expires" hint="Leave empty to keep it running.">
              <input type="datetime-local" value={f.expiresAt} onChange={(e) => setF({ expiresAt: e.target.value })} className={adminInput} />
            </Field>
            <Toggle label="Active" checked={f.active} onChange={(v) => setF({ active: v })} />
            <p className="text-xs text-gray-500">Each customer can use a code once. To give a code to specific customers only, assign it from the People page.</p>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={busy}
        title={`Delete ${toDelete?.id}?`}
        message="Customers will no longer be able to use this code. To pause it instead, switch it off."
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
};
