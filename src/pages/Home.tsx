import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { CalendarClock, Search, ShoppingBag, X } from 'lucide-react';
import type { MenuItem, RestaurantProfile } from '../types';
import { useStore } from '../context/StoreContext';
import { useCart } from '../context/CartContext';
import { useCartPricing } from '../hooks/useCartPricing';
import { DishDetailsDrawer } from '../components/DishDetailsDrawer';
import { MenuItemCard } from '../components/MenuItemCard';
import { formatMoney, fromCents } from '../lib/money';
import { prepMinutes } from '../lib/storeStatus';
import type { ResolvedTheme } from '../lib/theme';
import type { StoreStatus } from '../lib/storeStatus';

function Hero({ profile, theme, status }: { profile: RestaurantProfile; theme: ResolvedTheme; status: StoreStatus }) {
  if (theme.heroStyle === 'none') return null;
  const tagline = theme.tagline || profile.description || '';
  const useImage = theme.heroStyle === 'image' && !!profile.bannerUrl;
  const height = theme.heroHeight === 'tall' ? 'min-h-[280px] sm:min-h-[420px]' : 'min-h-[180px] sm:min-h-[280px]';

  const metaParts: string[] = [];
  if (theme.showRatings && profile.totalRatings && profile.totalRatings > 0 && profile.averageRating) {
    metaParts.push(`★ ${profile.averageRating.toFixed(1)} (${profile.totalRatings})`);
  }
  if (status.canOrderNow) {
    metaParts.push(`Ready in ~${prepMinutes(profile)} min`);
  }
  if (profile.isDeliveryEnabled !== false && profile.freeDeliveryThreshold && profile.freeDeliveryThreshold > 0) {
    metaParts.push(`Free delivery over ${formatMoney(profile.freeDeliveryThreshold)}`);
  }

  const metaLine = metaParts.length > 0 && (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm font-medium opacity-90 tabular-nums">
      {metaParts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden="true">·</span>}
          <span>{part}</span>
        </React.Fragment>
      ))}
    </div>
  );

  if (!useImage) {
    return (
      <section className={`relative overflow-hidden rounded-card bg-brand text-on-brand px-5 py-6 sm:px-10 sm:py-11 ${theme.heroHeight === 'tall' ? 'sm:py-18' : ''}`}>
        <div className="relative flex items-center gap-4">
          {profile.logoUrl && <img src={profile.logoUrl} alt="" className="w-14 h-14 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-white/20 shrink-0" />}
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-4xl font-extrabold leading-tight tracking-tight">{profile.name}</h1>
            {tagline && <p className="mt-1 text-xs sm:text-base opacity-85 line-clamp-2">{tagline}</p>}
            {metaLine}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`relative overflow-hidden rounded-card text-white flex items-end ${height}`}>
      <img src={profile.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" fetchPriority="high" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent" style={{ opacity: Math.max(0.25, theme.heroOverlay / 100 + 0.25) }} />
      <div className="relative w-full p-5 sm:p-10">
        <h1 className="font-display text-2xl sm:text-5xl font-extrabold leading-tight tracking-tight drop-shadow">{profile.name}</h1>
        {tagline && <p className="mt-1.5 text-xs sm:text-lg max-w-xl opacity-95 line-clamp-2">{tagline}</p>}
        {metaLine}
      </div>
    </section>
  );
}

function StatusBanner({ status }: { status: StoreStatus }) {
  if (status.canOrderNow) return null;
  const text =
    status.state === 'offline'
      ? "We're not taking online orders right now."
      : status.state === 'paused'
        ? `We're very busy right now. ${status.detail}.`
        : `We're closed right now${status.detail ? ` · ${status.detail}` : ''}.`;
  return (
    <div className="flex items-start gap-3 rounded-card border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
      <CalendarClock size={18} className="shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">{text}</p>
        {status.canSchedule && <p className="text-amber-800">You can still order ahead and pick a time at checkout.</p>}
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
          {text && <span className="text-base sm:text-xl font-bold tracking-[0.15em] uppercase whitespace-nowrap">{text}</span>}
          {images.map((url, j) => (
            <img key={j} src={url} alt="" loading="lazy" className="h-[70%] w-auto object-contain rounded-lg shrink-0" />
          ))}
        </div>
      ))}
    </div>
  );
  return (
    <div className="relative overflow-hidden rounded-card bg-brand text-on-brand h-12 sm:h-14 flex items-center" aria-label={text || 'Promotions'}>
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
            <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover rounded-card" />
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
    <div className="space-y-6 animate-pulse" aria-hidden>
      <div className="h-48 sm:h-72 rounded-card bg-soft" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-24 rounded-full bg-soft" />
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-56 rounded-card bg-soft" />
        ))}
      </div>
    </div>
  );
}

export const Home: React.FC = () => {
  const { profile, profileLoading, categories, items, menuLoading, status, theme } = useStore();
  const { addToCart, itemCount } = useCart();
  const pricing = useCartPricing();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
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
    return [...picks, ...sellers].filter((i) => !i.isSoldOut).slice(0, 8);
  }, [visibleItems]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return visibleItems.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || i.dietaryTags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [search, visibleItems]);

  // Highlight the category chip for the section currently on screen.
  useEffect(() => {
    if (searchResults || !sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveCategory(visible[0].target.id.replace('category-', ''));
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

  const quickAdd = (item: MenuItem) => {
    if (!canAdd) {
      toast.error(status.state === 'offline' ? "We're not taking orders right now." : "We're closed right now.");
      return;
    }
    if (item.isSoldOut) return;
    addToCart({ itemId: item.id, name: item.name, price: item.basePrice, quantity: 1, selectedModifiers: [] });
    toast.success(`Added ${item.name}`, { id: `add-${item.id}`, duration: 1500 });
  };

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
  const gridCls = layout === 'grid' ? 'grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4' : layout === 'list' ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : 'bg-card rounded-card border border-line px-4';
  const renderItems = (list: MenuItem[]) => (
    <div className={gridCls}>
      {list.map((item) => (
        <MenuItemCard key={item.id} item={item} theme={theme} layout={layout} canAdd={canAdd} onOpen={setSelected} onQuickAdd={quickAdd} />
      ))}
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 sm:space-y-8">
      <Hero profile={profile} theme={theme} status={status} />
      <StatusBanner status={status} />
      <Marquee profile={profile} />

      {sections.length > 0 && (
        <div className="sticky top-14 sm:top-16 z-30 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 bg-page/95 backdrop-blur-xl space-y-2">
          {theme.showSearch && (
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${profile.name}`}
                className="w-full bg-card border border-line rounded-chip pl-10 pr-10 py-2.5 text-sm text-ink placeholder:text-muted focus:ring-2 focus:ring-brand outline-none"
                aria-label="Search the menu"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted" aria-label="Clear search">
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          {!searchResults && (
            <div ref={chipBar} className="flex gap-2 overflow-x-auto hide-scrollbar">
              {sections.map(({ category }) => {
                const active = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    data-cat={category.id}
                    onClick={() => {
                      setActiveCategory(category.id);
                      document.getElementById(`category-${category.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`whitespace-nowrap px-4 py-2 rounded-chip text-sm font-semibold transition border ${
                      active ? 'bg-brand text-on-brand border-brand' : 'bg-card text-ink border-line hover:bg-soft'
                    }`}
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {searchResults ? (
        <section>
          <h2 className="font-display text-lg font-extrabold mb-3">
            {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for “{search.trim()}”
          </h2>
          {searchResults.length ? renderItems(searchResults) : <p className="text-muted text-sm py-8 text-center">Nothing matches that search.</p>}
        </section>
      ) : (
        <>
          {theme.showFeatured && featured.length > 0 && (
            <section>
              <h2 className="font-display text-lg sm:text-2xl font-extrabold mb-3">{theme.featuredTitle}</h2>
              <div className="flex gap-3 overflow-x-auto hide-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 snap-x">
                {featured.map((item) => (
                  <div key={item.id} className="w-[44%] sm:w-[220px] shrink-0 snap-start">
                    <MenuItemCard item={item} theme={theme} layout="grid" canAdd={canAdd} onOpen={setSelected} onQuickAdd={quickAdd} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {sections.map(({ category, items: list }) => (
            <section key={category.id} id={`category-${category.id}`} className="scroll-mt-36 sm:scroll-mt-40">
              <div className="mb-3">
                <h2 className="font-display text-lg sm:text-2xl font-extrabold">{category.name}</h2>
                {category.description && <p className="text-sm text-muted">{category.description}</p>}
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
        <div className="md:hidden fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 px-4 pb-2 pointer-events-none">
          <Link
            to="/cart"
            className="pointer-events-auto flex items-center justify-between gap-3 bg-brand text-on-brand rounded-btn px-4 py-3.5 shadow-ios-lg font-semibold"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} />
              View cart · {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
            <span>{pricing.ready ? formatMoney(fromCents(pricing.subtotalCents)) : ''}</span>
          </Link>
        </div>
      )}

      <DishDetailsDrawer item={selected} onClose={() => setSelected(null)} canAdd={canAdd} />
    </motion.div>
  );
};
