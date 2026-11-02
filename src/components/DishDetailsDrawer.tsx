import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Minus, Plus } from 'lucide-react';
import type { MenuItem, ModifierGroup } from '../types';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { describeGroupRule, groupRule, MAX_LINE_QUANTITY, resolveSelections, unitPriceCents, type ModifierSelection } from '../lib/pricing';
import { formatMoney, fromCents } from '../lib/money';
import { DietaryBadges, ItemMeta } from './MenuItemCard';
import { Sheet } from './ui';

interface DishDetailsDrawerProps {
  item: MenuItem | null;
  onClose: () => void;
  canAdd: boolean;
}

type Picks = Record<string, string[]>; // groupId -> modifier ids

function GroupPicker({
  group,
  picked,
  onChange,
  showError,
}: {
  group: ModifierGroup;
  picked: string[];
  onChange: (ids: string[]) => void;
  showError: boolean;
}) {
  const { min, max } = groupRule(group);
  const single = max === 1;
  const satisfied = picked.length >= min;

  const toggle = (id: string) => {
    if (single) return onChange(picked[0] === id && min === 0 ? [] : [id]);
    if (picked.includes(id)) return onChange(picked.filter((p) => p !== id));
    if (picked.length >= max) return;
    onChange([...picked, id]);
  };

  return (
    <fieldset id={`group-${group.id}`} className={`rounded-card border p-4 transition ${showError && !satisfied ? 'border-red-400 bg-red-50/40' : 'border-line'}`}>
      <legend className="sr-only">{group.name}</legend>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-bold">{group.name}</h3>
          <p className={`text-xs ${showError && !satisfied ? 'text-red-600 font-semibold' : 'text-muted'}`}>{describeGroupRule(group)}</p>
        </div>
        {min > 0 && (
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${satisfied ? 'bg-emerald-50 text-emerald-700' : 'bg-soft text-muted'}`}>
            {satisfied ? 'Done' : 'Required'}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {group.modifiers.map((mod) => {
          const checked = picked.includes(mod.id);
          const disabled = !checked && !single && picked.length >= max;
          return (
            <button
              key={mod.id}
              type="button"
              role={single ? 'radio' : 'checkbox'}
              aria-checked={checked}
              disabled={disabled}
              onClick={() => toggle(mod.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-btn border text-left transition disabled:opacity-40 ${
                checked ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:bg-soft'
              }`}
            >
              <span
                className={`w-5 h-5 shrink-0 flex items-center justify-center border-2 ${single ? 'rounded-full' : 'rounded-md'} ${
                  checked ? 'bg-brand border-brand text-on-brand' : 'border-line'
                }`}
              >
                {checked && (single ? <span className="w-2 h-2 rounded-full bg-on-brand" /> : <Check size={13} strokeWidth={3} />)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-sm">{mod.name}</span>
                {mod.allergenTags?.length ? <span className="block text-[11px] text-muted">Contains: {mod.allergenTags.join(', ')}</span> : null}
              </span>
              {mod.price > 0 && <span className="text-sm font-semibold text-muted">+{formatMoney(mod.price)}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export const DishDetailsDrawer: React.FC<DishDetailsDrawerProps> = ({ item, onClose, canAdd }) => {
  const { addToCart } = useCart();
  const { theme, catalog } = useStore();
  const [picks, setPicks] = useState<Picks>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  // Always show the live version of the item (price or availability may change while open).
  const live = item ? catalog.items.get(item.id) || item : null;

  useEffect(() => {
    setPicks({});
    setQuantity(1);
    setNotes('');
    setShowErrors(false);
  }, [item?.id]);

  const selections: ModifierSelection[] = useMemo(
    () => Object.entries(picks).flatMap(([groupId, ids]) => ids.map((modifierId) => ({ groupId, modifierId }))),
    [picks],
  );
  const resolved = useMemo(() => (live ? resolveSelections(live, selections) : { modifiers: [], errors: [] }), [live, selections]);
  const unitCents = live ? unitPriceCents(live, resolved.modifiers) : 0;

  const handleAdd = () => {
    if (!live) return;
    if (resolved.errors.length) {
      setShowErrors(true);
      const firstMissing = (live.modifierGroups || []).find((g) => (picks[g.id]?.length || 0) < groupRule(g).min);
      if (firstMissing) document.getElementById(`group-${firstMissing.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    addToCart({
      itemId: live.id,
      name: live.name,
      price: fromCents(unitCents),
      quantity,
      selectedModifiers: resolved.modifiers,
      ...(notes.trim() ? { prepNotes: notes.trim().slice(0, 200) } : {}),
    });
    toast.success(`Added ${quantity > 1 ? `${quantity} × ` : ''}${live.name}`, { duration: 1500 });
    onClose();
  };

  const disabledReason = !live ? '' : live.isSoldOut ? 'Sold out' : !canAdd ? 'Ordering is closed' : '';

  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      hideHeader
      size="md"
      footer={
        live && (
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-btn border border-line">
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="p-3 disabled:opacity-30" disabled={quantity <= 1} aria-label="Decrease quantity">
                <Minus size={16} />
              </button>
              <span className="w-6 text-center font-bold" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
                className="p-3 disabled:opacity-30"
                disabled={quantity >= MAX_LINE_QUANTITY}
                aria-label="Increase quantity"
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!!disabledReason}
              className="flex-1 bg-brand text-on-brand py-3.5 rounded-btn font-bold flex items-center justify-between px-5 transition active:scale-[0.98] disabled:opacity-50"
            >
              <span>{disabledReason || 'Add to cart'}</span>
              {!disabledReason && <span>{formatMoney(fromCents(unitCents * quantity))}</span>}
            </button>
          </div>
        )
      }
    >
      {live && (
        <div>
          {live.imageUrl ? (
            <div className="relative h-56 sm:h-72 bg-soft">
              <img src={live.imageUrl} alt={live.name} className={`w-full h-full object-cover ${live.isSoldOut ? 'grayscale' : ''}`} />
              <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/45 text-white backdrop-blur flex items-center justify-center" aria-label="Close">
                ✕
              </button>
            </div>
          ) : (
            <div className="flex justify-end p-3 pb-0">
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-soft flex items-center justify-center" aria-label="Close">
                ✕
              </button>
            </div>
          )}

          <div className="p-5 space-y-5">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-display text-2xl font-extrabold leading-tight">{live.name}</h2>
                <span className="text-lg font-extrabold whitespace-nowrap">{formatMoney(live.basePrice)}</span>
              </div>
              {live.description && <p className="text-sm text-muted leading-relaxed">{live.description}</p>}
              <ItemMeta item={live} theme={theme} />
              <DietaryBadges tags={live.dietaryTags} size="md" />
              {live.isSoldOut && <p className="text-sm font-semibold text-red-600">This item is sold out right now.</p>}
            </div>

            {(live.modifierGroups || []).map((group) => (
              <GroupPicker
                key={group.id}
                group={group}
                picked={picks[group.id] || []}
                onChange={(ids) => setPicks((prev) => ({ ...prev, [group.id]: ids }))}
                showError={showErrors}
              />
            ))}

            <label className="block">
              <span className="block font-bold mb-1.5">Special instructions</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 200))}
                rows={2}
                placeholder="e.g. no onions, sauce on the side"
                className="w-full rounded-btn border border-line bg-page px-3.5 py-2.5 text-sm placeholder:text-muted focus:ring-2 focus:ring-brand outline-none resize-none"
              />
              <span className="block text-[11px] text-muted mt-1">Allergies? Please also mention them in the order notes at checkout.</span>
            </label>
          </div>
        </div>
      )}
    </Sheet>
  );
};
