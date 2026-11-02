import React from 'react';
import { Clock, Flame, Leaf, Plus, Star, UtensilsCrossed, WheatOff } from 'lucide-react';
import type { MenuItem, MenuLayout } from '../types';
import type { ResolvedTheme } from '../lib/theme';
import { formatMoney } from '../lib/money';

const TAG_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  vegan: { label: 'Vegan', icon: Leaf, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  vegetarian: { label: 'Vegetarian', icon: Leaf, cls: 'text-lime-700 bg-lime-50 border-lime-200' },
  'gluten-free': { label: 'Gluten free', icon: WheatOff, cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  spicy: { label: 'Spicy', icon: Flame, cls: 'text-red-700 bg-red-50 border-red-200' },
};

export function DietaryBadges({ tags, size = 'sm' }: { tags?: string[]; size?: 'sm' | 'md' }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => {
        const meta = TAG_META[tag] || { label: tag, icon: Leaf, cls: 'text-muted bg-soft border-line' };
        const Icon = meta.icon;
        return (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 rounded-full border font-semibold ${meta.cls} ${size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[10px] px-1.5 py-0.5'}`}
          >
            <Icon size={size === 'md' ? 13 : 10} />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

export function ItemMeta({ item, theme }: { item: MenuItem; theme: ResolvedTheme }) {
  const parts: React.ReactNode[] = [];
  if (theme.showRatings && item.ratingCount && item.ratingCount > 0 && item.rating) {
    parts.push(
      <span key="r" className="inline-flex items-center gap-0.5">
        <Star size={11} className="fill-amber-400 text-amber-400" />
        {item.rating.toFixed(1)} <span className="opacity-70">({item.ratingCount})</span>
      </span>,
    );
  }
  if (theme.showPrepTime && item.preparationTime && item.preparationTime > 0) {
    parts.push(
      <span key="p" className="inline-flex items-center gap-0.5">
        <Clock size={11} /> {item.preparationTime} min
      </span>,
    );
  }
  if (theme.showCalories && item.calories && item.calories > 0) parts.push(<span key="c">{item.calories} cal</span>);
  if (!parts.length) return null;
  return <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">{parts}</div>;
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
      className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md transition active:scale-90 bg-brand text-on-brand disabled:opacity-40 disabled:shadow-none ${className}`}
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
  return <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-ink text-page px-2 py-0.5 rounded-full">Sold out</span>;
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-soft text-muted">
      <UtensilsCrossed size={22} className="opacity-60" />
      <span className="font-display font-bold text-lg opacity-60">{name.charAt(0)}</span>
    </div>
  );
}

export function MenuItemCard(props: CardProps) {
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
            <h3 className="font-semibold text-[15px] leading-snug truncate"><NameButton item={item} onOpen={onOpen} /></h3>
            {item.isSoldOut && <SoldOutBadge />}
          </div>
          {item.description && <p className="text-xs text-muted line-clamp-1 mt-0.5">{item.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <DietaryBadges tags={item.dietaryTags} />
          </div>
        </div>
        <span className="font-bold text-sm whitespace-nowrap">{fromPrice}</span>
        <AddButton {...props} className="w-8 h-8" />
      </div>
    );
  }

  if (layout === 'list') {
    return (
      <div
        onClick={() => onOpen(item)}
        className={`flex gap-3 p-3 rounded-card bg-card border border-line cursor-pointer hover:shadow-ios transition ${dim}`}
      >
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="flex items-start gap-2">
            <h3 className="font-bold text-[15px] leading-snug"><NameButton item={item} onOpen={onOpen} /></h3>
          </div>
          {item.description && <p className="text-xs text-muted line-clamp-2 mt-1">{item.description}</p>}
          <div className="mt-1.5 space-y-1.5">
            <ItemMeta item={item} theme={theme} />
            <DietaryBadges tags={item.dietaryTags} />
          </div>
          <div className="mt-auto pt-2 flex items-center gap-2">
            <span className="font-bold text-[15px]">{fromPrice}</span>
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
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className="font-bold text-[14px] sm:text-base leading-snug line-clamp-2"><NameButton item={item} onOpen={onOpen} /></h3>
        {item.description && <p className="hidden sm:block text-xs text-muted line-clamp-2">{item.description}</p>}
        <ItemMeta item={item} theme={theme} />
        <DietaryBadges tags={item.dietaryTags} />
        <div className="mt-auto pt-1.5 flex items-center justify-between gap-2">
          <span className="font-extrabold text-[15px]">{fromPrice}</span>
          <AddButton {...props} />
        </div>
      </div>
    </div>
  );
}
