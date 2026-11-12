import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import type { MenuCategory, MenuItem, RestaurantProfile } from '../types';
import { getStoreStatus, type StoreStatus } from '../lib/storeStatus';
import { ensureFontLoaded, resolveTheme, type ResolvedTheme } from '../lib/theme';
import type { Catalog } from '../lib/pricing';
import { api } from '../lib/api';
import { reportError } from '../utils/errorHandling';

interface StoreContextValue {
  profile: RestaurantProfile | null;
  profileLoading: boolean;
  categories: MenuCategory[];
  items: MenuItem[];
  menuLoading: boolean;
  /** Menu as seen by customers: active items in active categories (sold-out items included). */
  catalog: Catalog;
  status: StoreStatus;
  theme: ResolvedTheme;
  /** Card payments are configured on the server and in the browser, and enabled by the owner. */
  cardPaymentsAvailable: boolean;
  cashPaymentsAvailable: boolean;
  /** False when the API server could not be reached. */
  serverReachable: boolean;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
};

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined;

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [serverCard, setServerCard] = useState(false);
  const [serverReachable, setServerReachable] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsubProfile = onSnapshot(
      doc(db, 'restaurant', 'profile'),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as RestaurantProfile) : null);
        setProfileLoading(false);
      },
      (err) => {
        reportError(err, 'store-profile', { toast: false });
        setProfileLoading(false);
      },
    );
    const unsubCategories = onSnapshot(
      query(collection(db, 'categories'), orderBy('displayOrder')),
      (snap) => {
        setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MenuCategory));
        setCategoriesLoaded(true);
      },
      (err) => {
        reportError(err, 'store-categories', { toast: false });
        setCategoriesLoaded(true);
      },
    );
    const unsubItems = onSnapshot(
      collection(db, 'items'),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MenuItem));
        setItemsLoaded(true);
      },
      (err) => {
        reportError(err, 'store-items', { toast: false });
        setItemsLoaded(true);
      },
    );
    return () => {
      unsubProfile();
      unsubCategories();
      unsubItems();
    };
  }, []);

  useEffect(() => {
    api
      .config()
      .then((cfg) => {
        setServerCard(!!cfg.cardPayments);
        setServerReachable(true);
      })
      .catch(() => setServerReachable(false));
  }, []);

  // Re-evaluate "open now" every 30 seconds.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const theme = useMemo(() => resolveTheme(profile?.theme), [profile?.theme]);
  useEffect(() => ensureFontLoaded(theme.font), [theme.font]);

  const prevStatusRef = React.useRef<StoreStatus | null>(null);
  const status = useMemo(() => {
    const next = getStoreStatus(profile, new Date(now));
    const prev = prevStatusRef.current;
    if (
      prev &&
      prev.state === next.state &&
      prev.canOrderNow === next.canOrderNow &&
      prev.canSchedule === next.canSchedule &&
      prev.badge === next.badge &&
      prev.detail === next.detail &&
      prev.timeZone === next.timeZone &&
      prev.pausedUntil?.getTime() === next.pausedUntil?.getTime()
    ) {
      return prev;
    }
    prevStatusRef.current = next;
    return next;
  }, [profile, now]);

  const catalog = useMemo<Catalog>(() => {
    const activeCategoryIds = new Set(categories.filter((c) => c.active !== false).map((c) => c.id));
    return { items: new Map(items.map((i) => [i.id, i])), activeCategoryIds };
  }, [categories, items]);

  const value = useMemo<StoreContextValue>(
    () => ({
      profile,
      profileLoading,
      categories,
      items,
      menuLoading: !categoriesLoaded || !itemsLoaded,
      catalog,
      status,
      theme,
      cardPaymentsAvailable: serverCard && !!STRIPE_PUBLIC_KEY && profile?.isCardPaymentEnabled !== false,
      cashPaymentsAvailable: profile?.isCashPaymentEnabled === true,
      serverReachable,
    }),
    [profile, profileLoading, categories, items, categoriesLoaded, itemsLoaded, catalog, status, theme, serverCard, serverReachable],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};
