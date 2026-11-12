import React from 'react';
import { Plus, UtensilsCrossed } from 'lucide-react';
import type { MenuItem, MenuLayout } from '../types';
import type { ResolvedTheme } from '../lib/theme';
import { formatMoney } from '../lib/money';

const TAG_LABELS: Record<string, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  'gluten-free': 'Gluten-free',
  spicy: 'Spicy',
};

export function DietaryBadges({ tags, size = 'sm' }: { tags?: string[]; size?: 'sm' | 'md' }) {
  if (!tags?.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium text-muted ${size === 'md' ? 'text-xs' : 'text-[11px]'}`}>
      {tags.map((tag, i) => (
        <React.Fragment key={tag}>
          {i > 0 && <span aria-hidden="true">·</span>}
          <span className={tag === 'spicy' ? 'text-red-600 font-semibold' : tag === 'vegan' || tag === 'vegetarian' ? 'text-emerald-700 font-semibold' : ''}>
            {TAG_LABELS[tag] || tag}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export function ItemMeta({ item, theme }: { item: MenuItem; theme: ResolvedTheme }) {
  const parts: string[] = [];
  if (theme.showRatings && item.ratingCount && item.ratingCount > 0 && item.rating) {
    parts.push(`★ ${item.rating.toFixed(1)} (${item.ratingCount})`);
  }
  if (theme.showPrepTime && item.preparationTime && item.preparationTime > 0) {
    parts.push(`${item.preparationTime} min`);
  }
  if (theme.showCalories && item.calories && item.calories > 0) {
    parts.push(`${item.calories} cal`);
  }
  if (!parts.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted tabular-nums">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden="true">·</span>}
          <span>{part}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

interface CardProps {
  item: MenuItem;
  theme: ResolvedTheme;
  layout: MenuLayout;
  canAdd: boolean;
  onOpen: (item: MenuItem) => void;
  onQuickAdd: (item: MenuItem) => void;
}

function AddButton({ item, canAdd, onQuickAdd, onOpen, className = '' }: Omit<CardProps, 'theme' | 'layout'> & { className?: string }) {
  const hasOptions = !!item.modifierGroups?.length;
  const disabled = item.isSoldOut || !canAdd;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (hasOptions) onOpen(item);
        else onQuickAdd(item);
      }}
      disabled={disabled}
      aria-label={hasOptions ? `Choose options for ${item.name}` : `Add ${item.name} to cart`}
      className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition active:scale-90 bg-brand text-on-brand disabled:opacity-40 disabled:shadow-none ${className}`}
    >
      <Plus size={18} strokeWidth={2.5} />
    </button>
  );
}

function NameButton({ item, onOpen }: { item: MenuItem; onOpen: (item: MenuItem) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      className="text-left hover:underline focus-visible:underline outline-none"
    >
      {item.name}
    </button>
  );
}

function SoldOutBadge() {
  return <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-ink text-page px-2 py-0.5 rounded-md">Sold out</span>;
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-soft text-muted">
      <UtensilsCrossed size={20} className="opacity-50" />
      <span className="font-display font-bold text-base opacity-50">{name.charAt(0)}</span>
    </div>
  );
}

export const MenuItemCard = React.memo<CardProps>(function MenuItemCard(props: CardProps) {
  const { item, theme, layout, onOpen } = props;
  const price = formatMoney(item.basePrice);
  const fromPrice = item.modifierGroups?.some((g) => g.modifiers.some((m) => m.price > 0)) ? `From ${price}` : price;
  const dim = item.isSoldOut ? 'opacity-60' : '';

  if (layout === 'compact') {
    return (
      <div
        onClick={() => onOpen(item)}
        className={`flex items-center gap-3 py-3.5 border-b border-line last:border-0 cursor-pointer ${dim}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[15px] leading-snug truncate">
              <NameButton item={item} onOpen={onOpen} />
            </h3>
            {item.isSoldOut && <SoldOutBadge />}
          </div>
          {item.description && <p className="text-xs text-muted line-clamp-1 mt-0.5">{item.description}</p>}
          <div className="mt-1">
            <DietaryBadges tags={item.dietaryTags} />
          </div>
        </div>
        <span className="font-bold text-sm font-mono tabular-nums whitespace-nowrap">{fromPrice}</span>
        <AddButton {...props} className="w-9 h-9" />
      </div>
    );
  }

  if (layout === 'list') {
    return (
      <div
        onClick={() => onOpen(item)}
        className={`flex gap-3 p-3.5 rounded-card bg-card border border-line cursor-pointer hover:shadow-ios transition ${dim}`}
      >
        <div className="min-w-0 flex-1 flex flex-col">
          <h3 className="font-bold text-[15px] leading-snug">
            <NameButton item={item} onOpen={onOpen} />
          </h3>
          {item.description && <p className="text-xs text-muted line-clamp-2 mt-1">{item.description}</p>}
          <div className="mt-1.5 space-y-0.5">
            <ItemMeta item={item} theme={theme} />
            <DietaryBadges tags={item.dietaryTags} />
          </div>
          <div className="mt-auto pt-2 flex items-center gap-2">
            <span className="font-bold text-[15px] font-mono tabular-nums">{fromPrice}</span>
            {item.isSoldOut && <SoldOutBadge />}
          </div>
        </div>
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0">
          <div className="w-full h-full rounded-[calc(var(--radius-card)*0.75)] overflow-hidden">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className={`w-full h-full object-cover ${item.isSoldOut ? 'grayscale' : ''}`} />
            ) : (
              <Placeholder name={item.name} />
            )}
          </div>
          <AddButton {...props} className="absolute -bottom-1.5 -right-1.5 ring-4 ring-card" />
        </div>
      </div>
    );
  }

  // Photo grid
  return (
    <div
      onClick={() => onOpen(item)}
      className={`group bg-card rounded-card border border-line overflow-hidden flex flex-col cursor-pointer hover:shadow-ios-lg transition ${dim}`}
    >
      <div className="relative aspect-[4/3] bg-soft overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${item.isSoldOut ? 'grayscale' : ''}`}
          />
        ) : (
          <Placeholder name={item.name} />
        )}
        {item.isSoldOut && (
          <span className="absolute top-2 left-2">
            <SoldOutBadge />
          </span>
        )}
      </div>
      <div className="p-3 sm:p-3.5 flex-1 flex flex-col gap-1">
        <h3 className="font-bold text-[14px] sm:text-base leading-snug line-clamp-2">
          <NameButton item={item} onOpen={onOpen} />
        </h3>
        {item.description && <p className="hidden sm:block text-xs text-muted line-clamp-2">{item.description}</p>}
        <ItemMeta item={item} theme={theme} />
        <DietaryBadges tags={item.dietaryTags} />
        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <span className="font-extrabold text-[15px] font-mono tabular-nums">{fromPrice}</span>
          <AddButton {...props} />
        </div>
      </div>
    </div>
  );
});
