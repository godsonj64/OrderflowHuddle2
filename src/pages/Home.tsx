import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { ChevronRight, Clock, MapPin, Search, ShoppingCart, Star, UtensilsCrossed, X } from 'lucide-react';
import type { MenuItem, RestaurantProfile } from '../types';
import { useStore } from '../context/StoreContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useCartPricing } from '../hooks/useCartPricing';
import { DishDetailsDrawer } from '../components/DishDetailsDrawer';
import { MenuItemCard } from '../components/MenuItemCard';
import { formatMoney, fromCents } from '../lib/money';
import { prepMinutes } from '../lib/storeStatus';
import type { ResolvedTheme } from '../lib/theme';
import type { StoreStatus } from '../lib/storeStatus';

function Hero({
  profile,
  theme,
  status,
}: {
  profile: RestaurantProfile;
  theme: ResolvedTheme;
  status: StoreStatus;
}) {
  if (theme.heroStyle === 'none') return null;

  const hasImage = theme.heroStyle === 'image' && !!profile.bannerUrl;
  const tagline = theme.tagline?.trim() || profile.description?.trim() || '';
  const heightCls =
    theme.heroHeight === 'tall'
      ? 'min-h-[210px] sm:min-h-[300px]'
      : 'min-h-[148px] sm:min-h-[210px]';
  const overlayAlpha = Math.min(0.88, Math.max(0.18, theme.heroOverlay / 100));

  return (
    <section
      className={`relative overflow-hidden rounded-2xl ${heightCls} flex items-end p-5 sm:p-7 shadow-ios ${
        hasImage ? 'text-white bg-neutral-900' : 'bg-brand text-on-brand'
      }`}
    >
      {hasImage && (
        <>
          <img
            src={profile.bannerUrl}
            alt={profile.name}
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, rgba(0,0,0,${Math.min(0.92, overlayAlpha + 0.2)}) 0%, rgba(0,0,0,${overlayAlpha * 0.65}) 55%, rgba(0,0,0,${overlayAlpha * 0.25}) 100%)`,
            }}
          />
        </>
      )}

      <div className="relative z-10 max-w-2xl space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold opacity-95">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                status.canOrderNow
                  ? 'bg-emerald-400'
                  : status.state === 'paused'
                    ? 'bg-amber-400'
                    : 'bg-red-400'
              }`}
            />
            {status.badge}
          </span>
          {status.canOrderNow && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> ~{prepMinutes(profile)} min
              </span>
            </>
          )}
          {theme.showRatings &&
            profile.totalRatings &&
            profile.totalRatings > 0 &&
            profile.averageRating && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <Star size={12} className="fill-amber-400 text-amber-400" />
                  {profile.averageRating.toFixed(1)} ({profile.totalRatings})
                </span>
              </>
            )}
        </div>

        <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
          {profile.name}
        </h1>
        {tagline && (
          <p className="text-xs sm:text-sm opacity-90 line-clamp-2 max-w-xl">{tagline}</p>
        )}
      </div>
    </section>
  );
}

function DeliveryBanner({
  profile,
  status,
  savedAddress,
  onSelect,
}: {
  profile: RestaurantProfile;
  status: StoreStatus;
  savedAddress?: string;
  onSelect: () => void;
}) {
  const deliveryAvailable = profile.isDeliveryEnabled !== false;
  const title = deliveryAvailable ? 'Delivery to Home' : 'Pickup at Store';
  const subtitle = deliveryAvailable
    ? savedAddress || profile.address || 'Tap to set your delivery address'
    : profile.address || profile.name;

  const badgeParts: string[] = [];
  if (status.canOrderNow) {
    badgeParts.push(`~${prepMinutes(profile)} min`);
  } else {
    badgeParts.push(status.badge);
  }
  if (deliveryAvailable && profile.freeDeliveryThreshold && profile.freeDeliveryThreshold > 0) {
    badgeParts.push(`Free over ${formatMoney(profile.freeDeliveryThreshold)}`);
  } else if (profile.totalRatings && profile.totalRatings > 0 && profile.averageRating) {
    badgeParts.push(`★ ${profile.averageRating.toFixed(1)}`);
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-2xl bg-brand text-on-brand p-4 sm:p-5 shadow-ios transition hover:opacity-95 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 font-display font-extrabold text-base sm:text-lg leading-tight">
            <span>{title}</span>
          </div>
          <p className="text-xs sm:text-sm opacity-85 truncate flex items-center gap-1">
            <MapPin size={13} className="shrink-0 opacity-85" />
            <span className="truncate">{subtitle}</span>
          </p>
        </div>
        <ChevronRight size={20} className="shrink-0 opacity-90 mt-0.5" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {badgeParts.map((part, idx) => (
          <span
            key={idx}
            className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white/20 border border-white/25 text-[11px] sm:text-xs font-semibold tabular-nums backdrop-blur-xs"
          >
            {part}
          </span>
        ))}
      </div>
    </button>
  );
}

function PromoHighlightCard({
  profile,
  theme,
  spotlightItem,
  onOrderNow,
}: {
  profile: RestaurantProfile;
  theme: ResolvedTheme;
  spotlightItem?: MenuItem;
  onOrderNow: () => void;
}) {
  if (theme.showPromoCard === false) return null;
  if (theme.heroStyle === 'none' && !spotlightItem && !theme.promoTitle && !theme.promoBannerUrl) return null;

  const title = theme.promoTitle?.trim() || spotlightItem?.name || profile.name;
  const subtitle =
    theme.promoSubtitle?.trim() ||
    profile.marqueeText?.trim() ||
    theme.tagline?.trim() ||
    spotlightItem?.description ||
    profile.description ||
    (spotlightItem ? `Special price · ${formatMoney(spotlightItem.basePrice)}` : 'Freshly prepared to order');
  const dishImageUrl = spotlightItem?.imageUrl || profile.logoUrl;
  const bgImageUrl = theme.promoBannerUrl?.trim() || '';
  const hasBgImage = !!bgImageUrl;
  const overlayAlpha = Math.min(0.88, Math.max(0.15, (theme.promoOverlay ?? 45) / 100));

  return (
    <section
      className={`relative overflow-hidden rounded-2xl p-4 sm:p-6 flex items-center justify-between gap-4 ${
        hasBgImage ? 'text-white shadow-ios bg-neutral-900' : 'border border-brand/15 text-ink'
      }`}
      style={
        hasBgImage
          ? undefined
          : { backgroundColor: 'color-mix(in srgb, var(--color-brand) 9%, var(--color-card))' }
      }
    >
      {hasBgImage && (
        <>
          <img
            src={bgImageUrl}
            alt=""
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(90deg, rgba(0,0,0,${Math.min(0.9, overlayAlpha + 0.18)}) 0%, rgba(0,0,0,${overlayAlpha * 0.75}) 60%, rgba(0,0,0,${overlayAlpha * 0.4}) 100%)`,
            }}
          />
        </>
      )}

      <div className="relative z-10 min-w-0 flex-1 space-y-1">
        <span
          className={`block text-[11px] font-bold uppercase tracking-wider ${
            hasBgImage ? 'text-white/80' : 'text-brand'
          }`}
        >
          Special offer
        </span>
        <h2
          className={`font-display text-lg sm:text-2xl font-extrabold leading-tight line-clamp-1 ${
            hasBgImage ? 'text-white' : 'text-ink'
          }`}
        >
          {title}
        </h2>
        <p
          className={`text-xs sm:text-sm line-clamp-2 ${
            hasBgImage ? 'text-white/85' : 'text-muted'
          }`}
        >
          {subtitle}
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onOrderNow}
            className="bg-brand text-on-brand rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold shadow-xs hover:opacity-90 active:scale-95 transition"
          >
            Order Now
          </button>
        </div>
      </div>

      <div className="relative z-10 shrink-0">
        {dishImageUrl ? (
          <img
            src={dishImageUrl}
            alt={title}
            decoding="async"
            className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover shadow-md ring-4 ${
              hasBgImage ? 'ring-white/25' : 'ring-card'
            }`}
          />
        ) : (
          <div
            className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center ring-4 ${
              hasBgImage
                ? 'bg-white/15 text-white ring-white/20'
                : 'bg-brand/15 text-brand ring-card'
            }`}
          >
            <UtensilsCrossed size={28} />
          </div>
        )}
      </div>
    </section>
  );
}

function StatusBanner({
  status,
  onAction,
}: {
  status: StoreStatus;
  onAction: () => void;
}) {
  if (status.canOrderNow) return null;

  // Compute left crimson block metric & label (matching the bold number + tracked label in reference image)
  let metric = 'OFF';
  let metricLabel = 'CLOSED NOW';

  const nowMs = Date.now();
  if (status.state === 'paused' && status.pausedUntil) {
    const mins = Math.max(1, Math.ceil((status.pausedUntil.getTime() - nowMs) / 60_000));
    metric = String(mins);
    metricLabel = mins === 1 ? 'MIN LEFT' : 'MINS LEFT';
  } else if (status.state === 'closed' && status.nextOpenAt) {
    const diffMins = Math.max(1, Math.ceil((status.nextOpenAt.getTime() - nowMs) / 60_000));
    if (diffMins < 90) {
      metric = String(diffMins);
      metricLabel = diffMins === 1 ? 'MIN LEFT' : 'MINS LEFT';
    } else if (diffMins <= 48 * 60) {
      const hrs = Math.max(1, Math.round(diffMins / 60));
      metric = String(hrs);
      metricLabel = hrs === 1 ? 'HOUR LEFT' : 'HOURS LEFT';
    } else {
      const days = Math.max(1, Math.round(diffMins / (60 * 24)));
      metric = String(days);
      metricLabel = days === 1 ? 'DAY LEFT' : 'DAYS LEFT';
    }
  } else if (status.state === 'closed') {
    metric = 'SOON';
    metricLabel = 'REOPENING';
  }

  const headline =
    status.state === 'offline'
      ? "We're not taking online orders right now."
      : status.state === 'paused'
        ? `Kitchen is catching up · ${status.detail}.`
        : `We're closed right now${status.detail ? ` · ${status.detail}.` : '.'}`;

  const subtext = status.canSchedule
    ? "ASAP kitchen orders are paused while we're closed. You can still build your cart now and schedule a pickup or delivery time at checkout."
    : 'Online ASAP ordering is paused outside of kitchen hours. Browse the full menu below and check back when our doors open.';

  const actionLabel = status.canSchedule ? 'Schedule an order' : 'Browse the menu';

  return (
    <div
      role="status"
      className="flex items-stretch overflow-hidden rounded-xl bg-[#111315] text-white shadow-xl"
    >
      {/* Left Solid Crimson Metric Block */}
      <div className="w-24 sm:w-32 shrink-0 bg-[#D6281B] px-3 py-4 sm:py-5 flex flex-col items-center justify-center text-center select-none">
        <span className="font-display text-3xl sm:text-4xl font-black tracking-tight leading-none text-white tabular-nums">
          {metric}
        </span>
        <span className="mt-1.5 text-[9px] sm:text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/95">
          {metricLabel}
        </span>
      </div>

      {/* Center Solid Black Message & Action */}
      <div className="flex-1 min-w-0 px-4 sm:px-7 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6 bg-[#111315]">
        <div className="min-w-0 space-y-1">
          <h2 className="font-display text-sm sm:text-xl font-extrabold text-white leading-snug tracking-tight">
            {headline}
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed max-w-2xl">
            {subtext}
          </p>
        </div>

        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-white hover:text-[#F87171] transition shrink-0 self-start sm:self-center whitespace-nowrap"
        >
          <span>{actionLabel}</span>
          <ChevronRight size={15} className="shrink-0" />
        </button>
      </div>

      {/* Right Decorative Crimson Topographic Wave Strip */}
      <div
        className="hidden xs:block sm:block w-8 sm:w-14 shrink-0 bg-[#D6281B] relative overflow-hidden"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 60 160"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full text-[#111315]"
          fill="none"
        >
          <path d="M-10 12 C 15 0, 25 32, 45 22 C 55 17, 62 28, 70 25" stroke="currentColor" strokeWidth="2.2" />
          <path d="M-10 28 C 12 14, 24 50, 44 38 C 54 32, 62 44, 70 40" stroke="currentColor" strokeWidth="2.2" />
          <path d="M-10 46 C 14 28, 22 68, 42 56 C 54 48, 60 62, 70 58" stroke="currentColor" strokeWidth="2.6" />
          <path d="M-10 66 C 12 46, 20 88, 40 76 C 52 68, 60 82, 70 78" stroke="currentColor" strokeWidth="2.2" />
          <path d="M-10 86 C 10 68, 22 108, 42 96 C 54 88, 62 102, 70 98" stroke="currentColor" strokeWidth="2.8" />
          <path d="M-10 106 C 12 88, 24 128, 44 116 C 54 108, 62 122, 70 118" stroke="currentColor" strokeWidth="2.2" />
          <path d="M-10 126 C 14 110, 26 146, 46 136 C 56 130, 62 142, 70 138" stroke="currentColor" strokeWidth="2.2" />
          <path d="M-10 146 C 16 132, 28 164, 48 154 C 58 148, 64 158, 70 156" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      </div>
    </div>
  );
}

function Marquee({ profile }: { profile: RestaurantProfile }) {
  const images = profile.marqueeImageUrls?.length ? profile.marqueeImageUrls : profile.marqueeImageUrl ? [profile.marqueeImageUrl] : [];
  const text = profile.marqueeText?.trim();
  if (!profile.isMarqueeEnabled || (!text && !images.length)) return null;
  const repeats = text ? Math.max(3, Math.ceil(80 / Math.max(10, text.length))) : Math.max(3, Math.ceil(8 / images.length));
  const group = (
    <div className="flex items-center h-full shrink-0">
      {Array.from({ length: repeats }).map((_, i) => (
        <div key={i} className="flex items-center gap-10 pr-10 h-full shrink-0">
          {text && <span className="text-sm sm:text-base font-bold tracking-[0.14em] uppercase whitespace-nowrap">{text}</span>}
          {images.map((url, j) => (
            <img key={j} src={url} alt="" loading="lazy" className="h-[70%] w-auto object-contain rounded-lg shrink-0" />
          ))}
        </div>
      ))}
    </div>
  );
  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand text-on-brand h-11 sm:h-12 flex items-center" aria-label={text || 'Promotions'}>
      <div
        className="flex items-center w-full h-full"
        style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}
      >
        <div className="animate-marquee flex items-center h-full w-max" style={{ ['--marquee-duration' as any]: `${Math.max(20, repeats * 12)}s` }}>
          {group}
          {group}
        </div>
      </div>
    </div>
  );
}

function Spotlight({ profile, theme }: { profile: RestaurantProfile; theme: ResolvedTheme }) {
  const images = profile.galleryImageUrls || [];
  if (!profile.isGalleryEnabled || !images.length) return null;
  const repeats = Math.max(1, Math.ceil(6 / images.length));
  const group = (
    <div className="flex items-center h-full shrink-0">
      {Array.from({ length: repeats }).flatMap((_, r) =>
        images.map((url, j) => (
          <div key={`${r}-${j}`} className="h-full w-[240px] sm:w-[380px] shrink-0 pr-3">
            <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover rounded-2xl" />
          </div>
        )),
      )}
    </div>
  );
  return (
    <section className="pt-4 overflow-hidden w-[100vw] relative left-1/2 -translate-x-1/2">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-4">
        <h2 className="font-display text-xl sm:text-2xl font-extrabold">{theme.spotlightTitle}</h2>
        {theme.spotlightSubtitle && <p className="text-sm text-muted">{theme.spotlightSubtitle}</p>}
      </div>
      <div className="h-[200px] sm:h-[300px]">
        <div className="animate-gallery-marquee flex h-full w-max" style={{ ['--marquee-duration' as any]: `${Math.max(40, repeats * images.length * 10)}s` }}>
          {group}
          {group}
        </div>
      </div>
    </section>
  );
}

function SkeletonMenu() {
  return (
    <div className="space-y-5 animate-pulse" aria-hidden>
      <div className="h-12 rounded-2xl bg-soft" />
      <div className="h-28 rounded-2xl bg-soft" />
      <div className="h-36 rounded-2xl bg-soft" />
      <div className="flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-6 w-20 rounded-full bg-soft" />
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-52 rounded-2xl bg-soft" />
        ))}
      </div>
    </div>
  );
}

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { profile, profileLoading, categories, items, menuLoading, status, theme } = useStore();
  const { userProfile } = useAuth();
  const { addToCart, itemCount } = useCart();
  const pricing = useCartPricing();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const chipBar = useRef<HTMLDivElement>(null);

  const canAdd = status.canOrderNow || status.canSchedule;

  const visibleCategories = useMemo(() => categories.filter((c) => c.active !== false), [categories]);
  const visibleItems = useMemo(() => {
    const activeIds = new Set(visibleCategories.map((c) => c.id));
    return items
      .filter((i) => i.active && activeIds.has(i.categoryId))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name));
  }, [items, visibleCategories]);

  const sections = useMemo(
    () => visibleCategories.map((c) => ({ category: c, items: visibleItems.filter((i) => i.categoryId === c.id) })).filter((s) => s.items.length > 0),
    [visibleCategories, visibleItems],
  );

  const featured = useMemo(() => {
    const picks = visibleItems.filter((i) => i.isFeatured);
    const sellers = visibleItems
      .filter((i) => !i.isFeatured && (i.soldCount || 0) > 0)
      .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
    const combined = [...picks, ...sellers].filter((i) => !i.isSoldOut);
    return (combined.length > 0 ? combined : visibleItems.filter((i) => !i.isSoldOut)).slice(0, 8);
  }, [visibleItems]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return visibleItems.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || i.dietaryTags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [search, visibleItems]);

  // Highlight the category tab for the section currently on screen.
  useEffect(() => {
    if (searchResults || !sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const nextId = visible[0].target.id.replace('category-', '');
          setActiveCategory((prev) => (prev === nextId ? prev : nextId));
        }
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    sections.forEach((s) => {
      const el = document.getElementById(`category-${s.category.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections, searchResults]);

  useEffect(() => {
    if (!activeCategory || !chipBar.current) return;
    const chip = chipBar.current.querySelector<HTMLElement>(`[data-cat="${activeCategory}"]`);
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeCategory]);

  const quickAdd = useCallback(
    (item: MenuItem) => {
      if (!canAdd) {
        toast.error(status.state === 'offline' ? "We're not taking orders right now." : "We're closed right now.");
        return;
      }
      if (item.isSoldOut) return;
      addToCart({ itemId: item.id, name: item.name, price: item.basePrice, quantity: 1, selectedModifiers: [] });
      toast.success(`Added ${item.name}`, { id: `add-${item.id}`, duration: 1500 });
    },
    [canAdd, status.state, addToCart],
  );

  if (profileLoading || menuLoading) return <SkeletonMenu />;

  if (!profile) {
    return (
      <div className="text-center py-24">
        <h1 className="text-2xl font-extrabold mb-2">Coming soon</h1>
        <p className="text-muted">This store is still being set up. Please check back shortly.</p>
      </div>
    );
  }

  const layout = theme.menuLayout;
  const gridCls =
    layout === 'grid'
      ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5'
      : layout === 'list'
        ? 'grid grid-cols-1 lg:grid-cols-2 gap-3.5'
        : 'bg-card rounded-card border border-line px-4';

  const renderItems = (list: MenuItem[]) => (
    <div className={gridCls}>
      {list.map((item) => (
        <MenuItemCard key={item.id} item={item} theme={theme} layout={layout} canAdd={canAdd} onOpen={setSelected} onQuickAdd={quickAdd} />
      ))}
    </div>
  );

  const spotlightItem = featured[0] || visibleItems[0];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 sm:space-y-7">
      {/* Top Kupa Search Bar */}
      {theme.showSearch && (
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search on ${profile.name}`}
            className="w-full bg-soft border border-transparent focus:border-brand/30 focus:bg-card rounded-2xl pl-11 pr-10 py-3.5 text-sm text-ink placeholder:text-muted focus:ring-2 focus:ring-brand/20 outline-none transition"
            aria-label="Search the menu"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink" aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Storefront Header Image / Brand Banner (when enabled) */}
      {(theme.heroStyle === 'minimal' || (theme.heroStyle === 'image' && !!profile.bannerUrl)) && (
        <Hero profile={profile} theme={theme} status={status} />
      )}

      {/* Kupa Green Delivery / Pickup Card */}
      <DeliveryBanner
        profile={profile}
        status={status}
        savedAddress={userProfile?.savedAddresses?.[0]}
        onSelect={() => navigate('/cart#contact')}
      />

      <StatusBanner
        status={status}
        onAction={() => {
          if (status.canSchedule && itemCount > 0) {
            navigate('/cart');
          } else {
            document.getElementById('menu-catalog')?.scrollIntoView({ behavior: 'smooth' });
          }
        }}
      />

      {/* Special Offer / Featured Highlight Card (supports custom background image) */}
      {!searchResults && (
        <PromoHighlightCard
          profile={profile}
          theme={theme}
          spotlightItem={spotlightItem}
          onOrderNow={() => {
            if (spotlightItem) setSelected(spotlightItem);
            else document.getElementById('menu-catalog')?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      )}

      <Marquee profile={profile} />

      {searchResults ? (
        <section className="pt-1">
          <h2 className="font-display text-lg font-extrabold mb-4">
            {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for “{search.trim()}”
          </h2>
          {searchResults.length ? renderItems(searchResults) : <p className="text-muted text-sm py-10 text-center">Nothing matches that search.</p>}
        </section>
      ) : (
        <>
          {/* Top of Week Horizontal Carousel (matches Kupa Home screen) */}
          {theme.showFeatured && featured.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-ink">
                  {theme.featuredTitle === 'Popular near you' ? 'Top of Week' : theme.featuredTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => document.getElementById('menu-catalog')?.scrollIntoView({ behavior: 'smooth' })}
                  className="text-xs font-bold text-brand hover:underline"
                >
                  See all
                </button>
              </div>
              <div className="flex gap-3.5 overflow-x-auto hide-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 snap-x">
                {featured.map((item) => (
                  <div key={item.id} className="w-[150px] sm:w-[195px] shrink-0 snap-start">
                    <MenuItemCard item={item} theme={theme} layout="grid" canAdd={canAdd} onOpen={setSelected} onQuickAdd={quickAdd} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Menu Catalog Section ("Our Food / Special For You" + Kupa Text-Tab Category Bar) */}
          {sections.length > 0 && (
            <div id="menu-catalog" className="scroll-mt-20 space-y-4 pt-2">
              <div>
                <p className="text-xs font-medium text-muted">Our Food</p>
                <h2 className="font-display text-xl sm:text-2xl font-extrabold text-brand tracking-tight">Special For You</h2>
              </div>

              <div className="sticky top-14 sm:top-16 z-30 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 bg-page/95 backdrop-blur-xl border-b border-line/70">
                <div ref={chipBar} className="flex items-center gap-5 sm:gap-6 overflow-x-auto hide-scrollbar">
                  <button
                    type="button"
                    data-cat="all"
                    onClick={() => {
                      setActiveCategory('all');
                      document.getElementById('menu-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`relative pb-2 text-sm whitespace-nowrap transition ${
                      activeCategory === 'all' ? 'font-extrabold text-ink' : 'font-medium text-muted hover:text-ink'
                    }`}
                  >
                    All
                    {activeCategory === 'all' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full" />}
                  </button>

                  {sections.map(({ category }) => {
                    const active = activeCategory === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        data-cat={category.id}
                        onClick={() => {
                          setActiveCategory(category.id);
                          document.getElementById(`category-${category.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className={`relative pb-2 text-sm whitespace-nowrap transition ${
                          active ? 'font-extrabold text-ink' : 'font-medium text-muted hover:text-ink'
                        }`}
                      >
                        {category.name}
                        {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {sections.map(({ category, items: list }) => (
            <section key={category.id} id={`category-${category.id}`} className="scroll-mt-32 sm:scroll-mt-36 space-y-3">
              <div>
                <h3 className="font-display text-base sm:text-xl font-extrabold text-ink">{category.name}</h3>
                {category.description && <p className="text-xs sm:text-sm text-muted">{category.description}</p>}
              </div>
              {renderItems(list)}
            </section>
          ))}

          {sections.length === 0 && (
            <div className="text-center py-16 text-muted">
              <p className="font-semibold text-ink mb-1">The menu is being updated</p>
              <p className="text-sm">Please check back in a little while.</p>
            </div>
          )}
        </>
      )}

      <Spotlight profile={profile} theme={theme} />

      {itemCount > 0 && (
        <div className="md:hidden fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 px-4 pb-2 pointer-events-none">
          <Link
            to="/cart"
            className="pointer-events-auto flex items-center justify-between gap-3 bg-brand text-on-brand rounded-2xl px-4 py-3.5 shadow-ios-lg font-bold text-sm"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart size={18} />
              View cart · {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
            <span className="font-mono tabular-nums">{pricing.ready ? formatMoney(fromCents(pricing.subtotalCents)) : ''}</span>
          </Link>
        </div>
      )}

      <DishDetailsDrawer item={selected} onClose={() => setSelected(null)} canAdd={canAdd} />
    </motion.div>
  );
};
