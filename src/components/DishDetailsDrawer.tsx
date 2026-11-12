import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Heart, Minus, Plus, UtensilsCrossed, X } from 'lucide-react';
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

const FAV_KEY = 'orderflow_favorite_items';
function readFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

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
    <fieldset id={`group-${group.id}`} className="space-y-2.5">
      <legend className="sr-only">{group.name}</legend>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-[15px] text-ink">{group.name}</h3>
          <p className={`text-xs ${showError && !satisfied ? 'text-red-600 font-semibold' : 'text-muted'}`}>{describeGroupRule(group)}</p>
        </div>
        {min > 0 && (
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${satisfied ? 'bg-brand/10 text-brand' : 'bg-soft text-muted'}`}>
            {satisfied ? 'Done' : 'Required'}
          </span>
        )}
      </div>

      <div className={`rounded-2xl border overflow-hidden divide-y divide-line bg-card transition ${showError && !satisfied ? 'border-red-400 bg-red-50/20' : 'border-line'}`}>
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
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition disabled:opacity-40 ${
                checked ? 'bg-brand/5' : 'hover:bg-soft/60'
              }`}
            >
              <span
                className={`w-5 h-5 shrink-0 flex items-center justify-center border-2 transition ${single ? 'rounded-full' : 'rounded-md'} ${
                  checked ? 'bg-brand border-brand text-on-brand' : 'border-line bg-page'
                }`}
              >
                {checked && <Check size={12} strokeWidth={3} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-sm text-ink">{mod.name}</span>
                {mod.allergenTags?.length ? <span className="block text-[11px] text-muted">Contains: {mod.allergenTags.join(', ')}</span> : null}
              </span>
              <span className="text-sm font-semibold text-ink font-mono tabular-nums">
                {mod.price > 0 ? `+${formatMoney(mod.price)}` : '$0'}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export const DishDetailsDrawer: React.FC<DishDetailsDrawerProps> = ({ item, onClose, canAdd }) => {
  const { addToCart } = useCart();
  const { theme, catalog, categories } = useStore();
  const [picks, setPicks] = useState<Picks>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites());

  // Always show the live version of the item (price or availability may change while open).
  const live = item ? catalog.items.get(item.id) || item : null;
  const categoryName = useMemo(
    () => (live ? categories.find((c) => c.id === live.categoryId)?.name : ''),
    [live, categories],
  );

  useEffect(() => {
    setPicks({});
    setQuantity(1);
    setNotes('');
    setShowErrors(false);
  }, [item?.id]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

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
  const isFav = live ? favorites.has(live.id) : false;

  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      hideHeader
      size="md"
      footer={
        live && (
          <button
            type="button"
            onClick={handleAdd}
            disabled={!!disabledReason}
            className="w-full bg-brand text-on-brand py-4 rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-1.5 shadow-ios-lg transition active:scale-[0.99] disabled:opacity-50"
          >
            <span>{disabledReason || `Add to Cart (${formatMoney(fromCents(unitCents * quantity))})`}</span>
          </button>
        )
      }
    >
      {live && (
        <div>
          {/* Dish Hero Image Area */}
          <div className="relative pt-3 px-4 pb-0">
            <div className="w-10 h-1 rounded-full bg-line mx-auto mb-3 sm:hidden" />
            <div className="relative h-52 sm:h-64 rounded-2xl bg-soft overflow-hidden flex items-center justify-center">
              {live.imageUrl ? (
                <img src={live.imageUrl} alt={live.name} className={`w-full h-full object-cover ${live.isSoldOut ? 'grayscale' : ''}`} />
              ) : (
                <div className="flex flex-col items-center justify-center gap-1.5 text-muted">
                  <UtensilsCrossed size={28} className="opacity-45" />
                  <span className="font-display font-bold text-lg opacity-45">{live.name.charAt(0)}</span>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-card/85 text-ink backdrop-blur-md shadow-xs flex items-center justify-center hover:bg-card transition"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Title, Heart Toggle & Inline Quantity Stepper + Brand Green Price */}
            <div className="space-y-3 border-b border-line pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-xl sm:text-2xl font-extrabold text-ink leading-tight">{live.name}</h2>
                  {categoryName && <p className="text-xs text-muted mt-0.5">{categoryName}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => toggleFavorite(live.id)}
                  aria-label={isFav ? 'Remove from favorites' : 'Save to favorites'}
                  className="w-9 h-9 rounded-full bg-soft flex items-center justify-center shrink-0 transition active:scale-90"
                >
                  <Heart size={18} className={isFav ? 'fill-red-500 text-red-500' : 'text-muted'} />
                </button>
              </div>

              {live.description && <p className="text-xs sm:text-sm text-muted leading-relaxed">{live.description}</p>}

              {/* Kupa Inline Stepper + Green Price Row */}
              <div className="flex items-center gap-4 pt-1">
                <div className="inline-flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                    className="w-7 h-7 rounded-full bg-soft text-ink flex items-center justify-center disabled:opacity-40 transition active:scale-90"
                  >
                    <Minus size={14} strokeWidth={2.5} />
                  </button>
                  <span className="min-w-4 text-center font-bold text-sm font-mono tabular-nums" aria-live="polite">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
                    disabled={quantity >= MAX_LINE_QUANTITY}
                    aria-label="Increase quantity"
                    className="w-7 h-7 rounded-full bg-brand text-on-brand flex items-center justify-center disabled:opacity-40 transition active:scale-90"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                  </button>
                </div>

                <span className="font-extrabold text-base sm:text-lg text-brand font-mono tabular-nums">
                  {formatMoney(fromCents(unitCents))}
                </span>
              </div>

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
              <span className="block font-bold text-[15px] text-ink mb-2">Special instructions</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 200))}
                rows={2}
                placeholder="e.g. no onions, sauce on the side"
                className="w-full rounded-2xl border border-line bg-soft/60 focus:bg-card px-3.5 py-2.5 text-sm placeholder:text-muted focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none resize-none transition"
              />
              <span className="block text-[11px] text-muted mt-1">Allergies? Please also mention them in the order notes at checkout.</span>
            </label>
          </div>
        </div>
      )}
    </Sheet>
  );
};
