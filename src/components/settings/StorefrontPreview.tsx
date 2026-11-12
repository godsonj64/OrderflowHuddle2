import React, { useEffect, useMemo } from 'react';
import { Bell, ChevronRight, FileText, Home, Search, ShoppingCart, Star, User } from 'lucide-react';
import type { MenuItem, RestaurantProfile } from '../../types';
import { ANNOUNCEMENT_STYLES, ensureFontLoaded, resolveTheme, themeStyle } from '../../lib/theme';
import { MenuItemCard } from '../MenuItemCard';

const SAMPLE_ITEMS: MenuItem[] = [
  { id: 's1', categoryId: 'x', name: 'Squid Sweet & Sour', basePrice: 19.99, active: true, description: 'Crispy squid tossed in house sweet & sour glaze.', preparationTime: 12, dietaryTags: [] },
  { id: 's2', categoryId: 'x', name: 'Black Pepper Beef', basePrice: 27.12, active: true, description: 'Tender wok-seared beef with cracked black pepper.', dietaryTags: [] },
  { id: 's3', categoryId: 'x', name: 'Chicken Teriyaki Bowl', basePrice: 14.99, active: true, description: 'Char-grilled chicken over steamed rice.', dietaryTags: ['spicy'], isSoldOut: true },
];

/** Phone-sized live preview of the storefront using the unsaved theme. */
export function StorefrontPreview({ profile, items }: { profile: RestaurantProfile; items: MenuItem[] }) {
  const theme = useMemo(() => resolveTheme(profile.theme), [profile.theme]);
  const style = useMemo(() => themeStyle(theme), [theme]);
  useEffect(() => ensureFontLoaded(theme.font), [theme.font]);

  const sample = items.filter((i) => i.active).slice(0, 4);
  const list = sample.length >= 2 ? sample : SAMPLE_ITEMS;
  const tagline = theme.tagline || profile.description || 'Fresh food, made to order.';
  const showImageHero = theme.heroStyle === 'image' && !!profile.bannerUrl;
  const promoBgUrl = theme.promoBannerUrl?.trim() || '';
  const promoOverlayAlpha = Math.min(0.88, Math.max(0.15, (theme.promoOverlay ?? 45) / 100));

  return (
    <div className="mx-auto w-[300px] h-[620px] rounded-[44px] border-[10px] border-gray-900 bg-gray-900 shadow-2xl overflow-hidden">
      <div style={style} className="h-full flex flex-col bg-page text-ink font-sans text-[12px]">
        {theme.announcementEnabled && theme.announcementText && (
          <div className={`${ANNOUNCEMENT_STYLES[theme.announcementTone]} text-center text-[10px] font-semibold px-3 py-1`}>
            {theme.announcementText}
          </div>
        )}

        {/* Top Centered Header */}
        <div className="flex items-center justify-between px-3.5 h-11 bg-card border-b border-line/60 shrink-0">
          <div className="w-6 h-6 rounded-full bg-brand text-on-brand flex items-center justify-center font-bold text-[10px]">
            {(profile.name || 'K').charAt(0)}
          </div>
          <div className="font-display font-extrabold text-[13px] tracking-tight truncate">Home</div>
          <div className="relative w-6 h-6 rounded-full flex items-center justify-center text-ink">
            <Bell size={14} />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </div>
        </div>

        {/* Scrollable Storefront Body */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-3">
          {theme.showSearch && (
            <div className="rounded-xl bg-soft/90 px-3 py-2 text-muted text-[11px] flex items-center gap-2">
              <Search size={13} className="text-muted" />
              <span>Search on {profile.name || 'Kupa'}</span>
            </div>
          )}

          {/* Header Image / Brand Banner */}
          {(theme.heroStyle === 'minimal' || showImageHero) &&
            (showImageHero ? (
              <div className={`relative rounded-2xl overflow-hidden text-white flex items-end ${theme.heroHeight === 'tall' ? 'h-40' : 'h-28'}`}>
                <img src={profile.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" style={{ opacity: Math.max(0.18, theme.heroOverlay / 100 + 0.2) }} />
                <div className="relative p-3">
                  <div className="font-display text-base font-extrabold leading-tight">{profile.name || 'Your restaurant'}</div>
                  <div className="text-[10px] opacity-90 line-clamp-1">{tagline}</div>
                </div>
              </div>
            ) : (
              <div className={`rounded-2xl bg-brand text-on-brand p-3.5 ${theme.heroHeight === 'tall' ? 'py-6' : ''}`}>
                <div className="font-display text-base font-extrabold leading-tight">{profile.name || 'Your restaurant'}</div>
                <div className="text-[10px] opacity-85 line-clamp-1">{tagline}</div>
                {theme.showRatings && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold">
                    <Star size={10} className="fill-amber-400 text-amber-400" /> 4.8
                  </span>
                )}
              </div>
            ))}

          {/* Green Delivery to Home Card */}
          <div className="rounded-2xl bg-brand text-on-brand p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-[12px]">Delivery to Home</span>
              <ChevronRight size={14} className="opacity-80" />
            </div>
            <div className="text-[10px] opacity-85 truncate mt-0.5">
              {profile.address || 'Utama Street no. 14, Rumbai'}
            </div>
            <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-white/20 border border-white/25 text-on-brand text-[9px] font-bold">
              ~20 min
            </span>
          </div>

          {/* Special Offer Card (with optional background image, no sparkle icon) */}
          {theme.showPromoCard !== false && (
            <div
              className={`relative overflow-hidden rounded-2xl p-3.5 flex items-center justify-between gap-2 ${
                promoBgUrl ? 'text-white bg-neutral-900' : 'bg-accent text-ink'
              }`}
            >
              {promoBgUrl && (
                <>
                  <img src={promoBgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(90deg, rgba(0,0,0,${Math.min(0.9, promoOverlayAlpha + 0.18)}) 0%, rgba(0,0,0,${promoOverlayAlpha * 0.7}) 100%)`,
                    }}
                  />
                </>
              )}
              <div className="relative z-10 min-w-0">
                <div className={`text-[9px] font-bold uppercase tracking-wider ${promoBgUrl ? 'text-white/80' : 'text-brand'}`}>
                  Special offer
                </div>
                <div className={`font-display font-extrabold text-[13px] leading-tight truncate ${promoBgUrl ? 'text-white' : 'text-ink'}`}>
                  {theme.promoTitle?.trim() || list[0]?.name || 'Chicken Teriyaki'}
                </div>
                <div className={`text-[10px] mt-0.5 truncate ${promoBgUrl ? 'text-white/85' : 'text-muted'}`}>
                  {theme.promoSubtitle?.trim() || 'Discount 25%'}
                </div>
                <span className="inline-block mt-2 px-2.5 py-1 rounded-lg bg-brand text-on-brand text-[10px] font-bold">
                  Order Now
                </span>
              </div>
              {list[0]?.imageUrl ? (
                <img src={list[0].imageUrl} alt="" className="relative z-10 w-14 h-14 rounded-full object-cover ring-2 ring-white/80 shrink-0" />
              ) : (
                <div
                  className={`relative z-10 w-14 h-14 rounded-full font-display font-extrabold text-sm flex items-center justify-center shrink-0 ${
                    promoBgUrl ? 'bg-white/20 text-white' : 'bg-brand/15 text-brand'
                  }`}
                >
                  {(list[0]?.name || 'K').charAt(0)}
                </div>
              )}
            </div>
          )}

          {/* Editorial Section Header */}
          <div className="pt-1">
            <div className="text-[10px] text-muted font-medium">Our Food</div>
            <div className="font-display font-extrabold text-[15px] text-brand leading-tight">
              Special For You
            </div>
          </div>

          {/* Clean Text-Tab Category Bar */}
          <div className="flex gap-3.5 border-b border-line overflow-hidden text-[11px]">
            {['All', 'Featured', 'Top of Week', 'Seafood'].map((c, i) => (
              <span
                key={c}
                className={`shrink-0 pb-1.5 relative font-bold ${
                  i === 0 ? 'text-ink' : 'text-muted font-medium'
                }`}
              >
                {c}
                {i === 0 && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-brand rounded-full" />}
              </span>
            ))}
          </div>

          {/* Menu Grid/List */}
          <div className={theme.menuLayout === 'grid' ? 'grid grid-cols-2 gap-2.5' : theme.menuLayout === 'list' ? 'space-y-2' : 'bg-card rounded-card border border-line px-3'}>
            {list.map((item) => (
              <MenuItemCard key={item.id} item={item} theme={theme} layout={theme.menuLayout} canAdd onOpen={() => undefined} onQuickAdd={() => undefined} />
            ))}
          </div>
        </div>

        {/* 4-Tab Bottom Navigation */}
        <div className="grid grid-cols-4 h-12 bg-card border-t border-line/80 shrink-0 text-[9px] font-semibold text-muted">
          <div className="flex flex-col items-center justify-center text-brand font-bold">
            <Home size={14} strokeWidth={2.4} />
            <span>Home</span>
            <span className="w-1 h-1 rounded-full bg-brand mt-0.5" />
          </div>
          <div className="flex flex-col items-center justify-center">
            <FileText size={14} />
            <span>Menu</span>
          </div>
          <div className="flex flex-col items-center justify-center">
            <ShoppingCart size={14} />
            <span>Cart</span>
          </div>
          <div className="flex flex-col items-center justify-center">
            <User size={14} />
            <span>Profile</span>
          </div>
        </div>
      </div>
    </div>
  );
}

