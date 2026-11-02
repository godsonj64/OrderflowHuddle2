import React, { useEffect, useMemo } from 'react';
import { ShoppingBag, Star } from 'lucide-react';
import type { MenuItem, RestaurantProfile } from '../../types';
import { ANNOUNCEMENT_STYLES, ensureFontLoaded, resolveTheme, themeStyle } from '../../lib/theme';
import { MenuItemCard } from '../MenuItemCard';

const SAMPLE_ITEMS: MenuItem[] = [
  { id: 's1', categoryId: 'x', name: 'Smash Burger', basePrice: 12.5, active: true, description: 'Double patty, cheddar, pickles, house sauce.', preparationTime: 12, dietaryTags: [] },
  { id: 's2', categoryId: 'x', name: 'Loaded Fries', basePrice: 7, active: true, description: 'Crispy fries, cheese sauce, scallions.', dietaryTags: ['vegetarian'] },
  { id: 's3', categoryId: 'x', name: 'Spicy Wings', basePrice: 11, active: true, description: 'Six wings tossed in our hot glaze.', dietaryTags: ['spicy'], isSoldOut: true },
];

/** Phone-sized live preview of the storefront using the unsaved theme. */
export function StorefrontPreview({ profile, items }: { profile: RestaurantProfile; items: MenuItem[] }) {
  const theme = useMemo(() => resolveTheme(profile.theme), [profile.theme]);
  const style = useMemo(() => themeStyle(theme), [theme]);
  useEffect(() => ensureFontLoaded(theme.font), [theme.font]);

  const sample = items.filter((i) => i.active).slice(0, 3);
  const list = sample.length >= 2 ? sample : SAMPLE_ITEMS;
  const tagline = theme.tagline || profile.description || 'Fresh food, made to order.';
  const showImageHero = theme.heroStyle === 'image' && !!profile.bannerUrl;

  return (
    <div className="mx-auto w-[300px] h-[610px] rounded-[44px] border-[10px] border-gray-900 bg-gray-900 shadow-2xl overflow-hidden">
      <div style={style} className="h-full overflow-y-auto hide-scrollbar bg-page text-ink font-sans text-[13px]">
        {theme.announcementEnabled && theme.announcementText && (
          <div className={`${ANNOUNCEMENT_STYLES[theme.announcementTone]} text-center text-[11px] font-semibold px-3 py-1.5`}>{theme.announcementText}</div>
        )}
        <div className="flex items-center gap-2 px-3 h-12 bg-card border-b border-line">
          {profile.logoUrl ? (
            <img src={profile.logoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <span className="w-7 h-7 rounded-full bg-brand text-on-brand flex items-center justify-center font-bold text-xs">{(profile.name || 'R').charAt(0)}</span>
          )}
          <div className="min-w-0">
            <div className="font-display font-extrabold text-[13px] leading-tight truncate">{profile.name || 'Your restaurant'}</div>
            <div className="text-[10px] text-muted flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Open now
            </div>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {theme.heroStyle !== 'none' &&
            (showImageHero ? (
              <div className={`relative rounded-card overflow-hidden text-white flex items-end ${theme.heroHeight === 'tall' ? 'h-48' : 'h-32'}`}>
                <img src={profile.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" style={{ opacity: Math.max(0.15, theme.heroOverlay / 100 + 0.25) }} />
                <div className="relative p-3">
                  <div className="font-display text-xl font-extrabold leading-tight">{profile.name || 'Your restaurant'}</div>
                  <div className="text-[11px] opacity-90 line-clamp-2">{tagline}</div>
                </div>
              </div>
            ) : (
              <div className={`rounded-card bg-brand text-on-brand p-4 ${theme.heroHeight === 'tall' ? 'py-8' : ''}`}>
                <div className="font-display text-xl font-extrabold leading-tight">{profile.name || 'Your restaurant'}</div>
                <div className="text-[11px] opacity-85 line-clamp-2">{tagline}</div>
                {theme.showRatings && (
                  <span className="inline-flex items-center gap-1 mt-2 bg-black/15 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                    <Star size={10} className="fill-amber-400 text-amber-400" /> 4.8
                  </span>
                )}
              </div>
            ))}

          {profile.isMarqueeEnabled && profile.marqueeText && (
            <div className="rounded-card bg-brand text-on-brand text-[11px] font-bold uppercase tracking-widest px-3 py-2 truncate">{profile.marqueeText}</div>
          )}

          {theme.showSearch && <div className="rounded-chip border border-line bg-card px-3 py-2 text-muted text-[11px]">Search {profile.name || 'menu'}</div>}

          <div className="flex gap-1.5 overflow-hidden">
            {['Popular', 'Burgers', 'Sides', 'Drinks'].map((c, i) => (
              <span key={c} className={`shrink-0 px-3 py-1 rounded-chip text-[11px] font-semibold border ${i === 0 ? 'bg-brand text-on-brand border-brand' : 'bg-card border-line'}`}>
                {c}
              </span>
            ))}
          </div>

          {theme.showFeatured && <div className="font-display font-extrabold text-sm">{theme.featuredTitle}</div>}

          <div className={theme.menuLayout === 'grid' ? 'grid grid-cols-2 gap-2' : theme.menuLayout === 'list' ? 'space-y-2' : 'bg-card rounded-card border border-line px-3'}>
            {list.map((item) => (
              <MenuItemCard key={item.id} item={item} theme={theme} layout={theme.menuLayout} canAdd onOpen={() => undefined} onQuickAdd={() => undefined} />
            ))}
          </div>

          <div className="sticky bottom-2 bg-brand text-on-brand rounded-btn px-3 py-2.5 font-semibold text-[12px] flex items-center justify-between shadow-ios-lg">
            <span className="flex items-center gap-1.5">
              <ShoppingBag size={14} /> View cart · 2 items
            </span>
            <span>$19.50</span>
          </div>
        </div>
      </div>
    </div>
  );
}
