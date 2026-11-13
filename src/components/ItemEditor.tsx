import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Copy, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { db } from '../firebase';
import type { MenuCategory, MenuItem, ModifierGroup } from '../types';
import { uid } from '../lib/ids';
import { parseAmount } from '../lib/money';
import { describeGroupRule } from '../lib/pricing';
import { dataUrlBytes, formatBytes, resizeWithPreset } from '../utils/imageUpload';
import { friendlyError } from '../utils/errorHandling';
import { ConfirmDialog, Field, Sheet, Spinner, Toggle, adminInput } from './ui';

export const DIETARY_TAGS = ['vegan', 'vegetarian', 'gluten-free', 'spicy'] as const;

/** Editable copy of an item: numbers are kept as strings while typing. */
interface Draft {
  name: string;
  basePrice: string;
  categoryId: string;
  description: string;
  imageUrl: string;
  preparationTime: string;
  calories: string;
  dietaryTags: string[];
  active: boolean;
  isSoldOut: boolean;
  isFeatured: boolean;
  modifierGroups: ModifierGroup[];
}

const toDraft = (item: Partial<MenuItem> | null, categoryId: string): Draft => ({
  name: item?.name || '',
  basePrice: item?.basePrice !== undefined ? String(item.basePrice) : '',
  categoryId: item?.categoryId || categoryId,
  description: item?.description || '',
  imageUrl: item?.imageUrl || '',
  preparationTime: item?.preparationTime ? String(item.preparationTime) : '',
  calories: item?.calories ? String(item.calories) : '',
  dietaryTags: item?.dietaryTags || [],
  active: item?.active ?? true,
  isSoldOut: item?.isSoldOut ?? false,
  isFeatured: item?.isFeatured ?? false,
  modifierGroups: (item?.modifierGroups || []).map((g) => ({ ...g, modifiers: g.modifiers.map((m) => ({ ...m })) })),
});

const TEMPLATES: Record<string, () => ModifierGroup> = {
  Size: () => ({
    id: uid('g'),
    name: 'Size',
    required: true,
    minSelection: 1,
    maxSelection: 1,
    modifiers: [
      { id: uid('m'), name: 'Regular', price: 0 },
      { id: uid('m'), name: 'Large', price: 2 },
    ],
  }),
  Extras: () => ({
    id: uid('g'),
    name: 'Extras',
    required: false,
    minSelection: 0,
    maxSelection: 0,
    modifiers: [{ id: uid('m'), name: 'Extra cheese', price: 1 }],
  }),
  Blank: () => ({ id: uid('g'), name: '', required: false, minSelection: 0, maxSelection: 1, modifiers: [{ id: uid('m'), name: '', price: 0 }] }),
};

function validate(d: Draft): string | null {
  if (!d.name.trim()) return 'Please enter a name.';
  if (d.name.trim().length >= 100) return 'The name is too long.';
  if (d.basePrice.trim() === '' || !Number.isFinite(Number(d.basePrice)) || Number(d.basePrice) < 0) return 'Please enter a valid price.';
  if (!d.categoryId) return 'Please choose a category.';
  for (const g of d.modifierGroups) {
    if (!g.name.trim()) return 'Every option group needs a name (e.g. "Size").';
    if (!g.modifiers.length) return `Add at least one choice to "${g.name}".`;
    if (g.modifiers.some((m) => !m.name.trim())) return `Every choice in "${g.name}" needs a name.`;
    if (g.modifiers.some((m) => !Number.isFinite(Number(m.price)) || Number(m.price) < 0)) return `Check the prices in "${g.name}".`;
    const min = g.required ? Math.max(1, g.minSelection) : g.minSelection;
    if (min > g.modifiers.length) return `"${g.name}" requires more choices than it has.`;
    if (g.maxSelection > 0 && g.maxSelection < min) return `In "${g.name}", the maximum must be at least the minimum.`;
  }
  return null;
}

function GroupEditor({
  group,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  group: ModifierGroup;
  index: number;
  count: number;
  onChange: (g: ModifierGroup) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<ModifierGroup>) => onChange({ ...group, ...patch });
  return (
    <div className="rounded-2xl border border-gray-200 p-3 space-y-3 bg-gray-50/60">
      <div className="flex items-center gap-2">
        <input value={group.name} onChange={(e) => set({ name: e.target.value })} placeholder="Group name, e.g. Size" className={`${adminInput} font-semibold`} />
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-30" aria-label="Move group up">
          <ArrowUp size={16} />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-30" aria-label="Move group down">
          <ArrowDown size={16} />
        </button>
        <button type="button" onClick={onRemove} className="p-2 rounded-lg text-red-600 hover:bg-red-50" aria-label="Remove group">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 items-end">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={group.required}
            onChange={(e) => set({ required: e.target.checked, minSelection: e.target.checked ? Math.max(1, group.minSelection) : 0 })}
            className="w-4 h-4 accent-gray-900"
          />
          Required
        </label>
        <label className="text-xs text-gray-500">
          Min
          <input
            type="number"
            min={0}
            value={group.minSelection}
            onChange={(e) => set({ minSelection: Math.max(0, Math.floor(parseAmount(e.target.value))) })}
            className={adminInput}
          />
        </label>
        <label className="text-xs text-gray-500">
          Max (0 = any)
          <input
            type="number"
            min={0}
            value={group.maxSelection}
            onChange={(e) => set({ maxSelection: Math.max(0, Math.floor(parseAmount(e.target.value))) })}
            className={adminInput}
          />
        </label>
      </div>
      <p className="text-xs text-gray-500">Customers see: “{describeGroupRule(group)}”</p>

      <div className="space-y-2">
        {group.modifiers.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2">
            <input
              value={m.name}
              onChange={(e) => set({ modifiers: group.modifiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
              placeholder="Choice name"
              className={adminInput}
            />
            <div className="relative w-28 shrink-0">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">+$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={m.price}
                onChange={(e) => set({ modifiers: group.modifiers.map((x, j) => (j === i ? { ...x, price: parseAmount(e.target.value) } : x)) })}
                className={`${adminInput} pl-7`}
                aria-label="Extra price"
              />
            </div>
            <button
              type="button"
              onClick={() => set({ modifiers: group.modifiers.filter((_, j) => j !== i) })}
              className="p-2 rounded-lg text-gray-400 hover:text-red-600"
              aria-label="Remove choice"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set({ modifiers: [...group.modifiers, { id: uid('m'), name: '', price: 0 }] })}
          className="text-sm font-semibold text-gray-700 flex items-center gap-1 px-1 py-1"
        >
          <Plus size={15} /> Add choice
        </button>
      </div>
    </div>
  );
}

interface ItemEditorProps {
  open: boolean;
  item: MenuItem | null; // null = new item
  defaultCategoryId: string;
  categories: MenuCategory[];
  nextDisplayOrder: number;
  onClose: () => void;
}

export function ItemEditor({ open, item, defaultCategoryId, categories, nextDisplayOrder, onClose }: ItemEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item, defaultCategoryId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) setDraft(toDraft(item, defaultCategoryId));
  }, [open, item, defaultCategoryId]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const converted = await resizeWithPreset(file, 'item');
      set({ imageUrl: converted });
      toast.success(`Converted to WebP (${formatBytes(dataUrlBytes(converted))})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use that image.');
    } finally {
      setUploading(false);
    }
  };

  const save = async (asCopy = false) => {
    const error = validate(draft);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    const data: Record<string, unknown> = {
      name: draft.name.trim() + (asCopy ? ' (copy)' : ''),
      basePrice: Math.round(Number(draft.basePrice) * 100) / 100,
      categoryId: draft.categoryId,
      description: draft.description.trim(),
      imageUrl: draft.imageUrl,
      preparationTime: Math.max(0, Math.round(parseAmount(draft.preparationTime))),
      calories: Math.max(0, Math.round(parseAmount(draft.calories))),
      dietaryTags: draft.dietaryTags,
      active: draft.active,
      isSoldOut: draft.isSoldOut,
      isFeatured: draft.isFeatured,
      modifierGroups: draft.modifierGroups.map((g) => ({
        id: g.id,
        name: g.name.trim(),
        required: g.required,
        minSelection: g.required ? Math.max(1, g.minSelection) : g.minSelection,
        maxSelection: g.maxSelection,
        modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name.trim(), price: Math.round(Number(m.price) * 100) / 100 })),
      })),
    };
    try {
      if (item && !asCopy) {
        // updateDoc only touches these fields, so server-maintained ratings / sales stay intact.
        await updateDoc(doc(db, 'items', item.id), data);
        toast.success('Item saved');
      } else {
        await addDoc(collection(db, 'items'), { ...data, displayOrder: nextDisplayOrder });
        toast.success(asCopy ? 'Copy created' : 'Item added');
      }
      onClose();
    } catch (err) {
      toast.error(friendlyError(err, 'Could not save the item.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'items', item.id));
      toast.success('Item deleted');
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const moveGroup = (index: number, dir: -1 | 1) => {
    const groups = [...draft.modifierGroups];
    const target = index + dir;
    if (target < 0 || target >= groups.length) return;
    [groups[index], groups[target]] = [groups[target], groups[index]];
    set({ modifierGroups: groups });
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={() => !saving && onClose()}
        surface="admin"
        size="lg"
        title={item ? 'Edit item' : 'New item'}
        footer={
          <div className="flex items-center gap-2">
            {item && (
              <>
                <button type="button" onClick={() => setConfirmDelete(true)} className="p-3 rounded-2xl text-red-600 hover:bg-red-50" aria-label="Delete item">
                  <Trash2 size={18} />
                </button>
                <button type="button" onClick={() => save(true)} disabled={saving} className="p-3 rounded-2xl text-gray-600 hover:bg-gray-100" title="Duplicate" aria-label="Duplicate item">
                  <Copy size={18} />
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="ml-auto px-5 py-3 rounded-2xl bg-gray-100 font-semibold">
              Cancel
            </button>
            <button type="button" onClick={() => save()} disabled={saving || uploading} className="px-6 py-3 rounded-2xl bg-gray-900 text-white font-semibold flex items-center gap-2 disabled:opacity-50">
              {saving && <Spinner size={16} />} Save
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-5">
          <div className="flex gap-4 items-start">
            <label className="relative w-28 h-28 shrink-0 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center cursor-pointer">
              {uploading ? (
                <Spinner />
              ) : draft.imageUrl ? (
                <img src={draft.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-gray-500 flex flex-col items-center gap-1">
                  <ImagePlus size={20} /> Photo
                </span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={onImage} />
            </label>
            <div className="flex-1 space-y-3 min-w-0">
              <Field label="Name">
                <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className={adminInput} maxLength={99} placeholder="e.g. Classic Smash Burger" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" inputMode="decimal" min={0} step="0.01" value={draft.basePrice} onChange={(e) => set({ basePrice: e.target.value })} className={`${adminInput} pl-6`} placeholder="0.00" />
                  </div>
                </Field>
                <Field label="Category">
                  <select value={draft.categoryId} onChange={(e) => set({ categoryId: e.target.value })} className={adminInput}>
                    <option value="" disabled>
                      Choose…
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 -mt-2">
            <span className="text-[11px] text-gray-500">
              {draft.imageUrl.startsWith('data:image/webp')
                ? `WebP optimized · ${formatBytes(dataUrlBytes(draft.imageUrl))} · Full HD clarity`
                : 'Any JPEG, PNG, or WebP auto-converts to WebP for fast loading'}
            </span>
            {draft.imageUrl && (
              <button type="button" onClick={() => set({ imageUrl: '' })} className="text-xs font-semibold text-red-600 shrink-0">
                Remove photo
              </button>
            )}
          </div>

          <Field label="Description">
            <textarea value={draft.description} onChange={(e) => set({ description: e.target.value.slice(0, 1000) })} rows={3} className={`${adminInput} resize-none`} placeholder="What makes it great? Ingredients, portion size…" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prep time (min)">
              <input type="number" min={0} inputMode="numeric" value={draft.preparationTime} onChange={(e) => set({ preparationTime: e.target.value })} className={adminInput} placeholder="15" />
            </Field>
            <Field label="Calories">
              <input type="number" min={0} inputMode="numeric" value={draft.calories} onChange={(e) => set({ calories: e.target.value })} className={adminInput} placeholder="Optional" />
            </Field>
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">Dietary tags</p>
            <div className="flex flex-wrap gap-2">
              {DIETARY_TAGS.map((tag) => {
                const on = draft.dietaryTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => set({ dietaryTags: on ? draft.dietaryTags.filter((t) => t !== tag) : [...draft.dietaryTags, tag] })}
                    className={`px-3.5 py-2 rounded-full text-sm font-semibold border ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-700'}`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100 px-4">
            <Toggle label="Show on menu" description="Hidden items are not visible to customers." checked={draft.active} onChange={(v) => set({ active: v })} />
            <Toggle label="Sold out" description="Still visible, but customers can't order it." checked={draft.isSoldOut} onChange={(v) => set({ isSoldOut: v })} />
            <Toggle label="Featured" description="Pin to the top row of the menu." checked={draft.isFeatured} onChange={(v) => set({ isFeatured: v })} />
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Options & add-ons</p>
              <p className="text-xs text-gray-500">Sizes, milk choices, extra toppings… Required groups must be chosen before adding to cart.</p>
            </div>
            {draft.modifierGroups.map((g, i) => (
              <GroupEditor
                key={g.id}
                group={g}
                index={i}
                count={draft.modifierGroups.length}
                onChange={(next) => set({ modifierGroups: draft.modifierGroups.map((x, j) => (j === i ? next : x)) })}
                onMove={(dir) => moveGroup(i, dir)}
                onRemove={() => set({ modifierGroups: draft.modifierGroups.filter((_, j) => j !== i) })}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              {Object.entries(TEMPLATES).map(([label, make]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => set({ modifierGroups: [...draft.modifierGroups, make()] })}
                  disabled={draft.modifierGroups.length >= 20}
                  className="px-3.5 py-2 rounded-full text-sm font-semibold bg-gray-100 hover:bg-gray-200 flex items-center gap-1"
                >
                  <Plus size={15} /> {label === 'Blank' ? 'Custom group' : `${label} group`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        danger
        busy={saving}
        title="Delete this item?"
        message="It will be removed from the menu permanently. Past orders keep their details. Tip: use “Show on menu” to hide it temporarily instead."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}
