import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ChefHat,
  ClipboardList,
  ExternalLink,
  LogOut,
  MoreHorizontal,
  Settings,
  Tag,
  Truck,
  Users,
  UtensilsCrossed,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { useNewOrderAlerts } from '../hooks/useNewOrderAlerts';
import { Sheet } from './ui';
import { api } from '../lib/api';

type Health = Awaited<ReturnType<typeof api.health>>;

export const AdminLayout: React.FC = () => {
  const { userProfile, isStaff, isManager, role, logout } = useAuth();
  const { profile, status } = useStore();
  const { newOrders, soundOn, toggleSound } = useNewOrderAlerts(isStaff);
  const location = useLocation();
  const [health, setHealth] = useState<Health | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    document.title = `${profile?.name || 'OrderFlow'} · Dashboard`;
  }, [profile?.name]);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isManager) return;
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth({ status: 'down', firestore: 'error', cardPayments: false, webhooks: false }));
  }, [isManager]);

  const tabs = [
    { to: '/admin', label: 'Orders', icon: ClipboardList, end: true, show: isStaff, badge: newOrders.length, primaryMobile: true },
    { to: '/admin/kitchen', label: 'Kitchen', icon: ChefHat, show: isStaff, badge: newOrders.length, primaryMobile: true },
    { to: '/driver', label: 'Deliveries', icon: Truck, show: role === 'driver' || isManager, primaryMobile: !isManager },
    { to: '/admin/menu', label: 'Menu', icon: UtensilsCrossed, show: isManager, primaryMobile: true },
    { to: '/admin/promos', label: 'Promos', icon: Tag, show: isManager, primaryMobile: false },
    { to: '/admin/users', label: 'People', icon: Users, show: isManager, primaryMobile: false },
    { to: '/admin/settings', label: 'Settings', icon: Settings, show: isManager, primaryMobile: true },
  ].filter((t) => t.show);

  const mobilePrimaryTabs = tabs.length <= 5 ? tabs : tabs.filter((t) => t.primaryMobile);
  const mobileOverflowTabs = tabs.length <= 5 ? [] : tabs.filter((t) => !t.primaryMobile);
  const isOverflowActive = mobileOverflowTabs.some((t) => location.pathname.startsWith(t.to));

  const currentTab =
    tabs.find((t) => (t.end ? location.pathname === t.to : location.pathname.startsWith(t.to))) || tabs[0];

  const fullBleed = location.pathname.startsWith('/admin/kitchen');
  const statusTone =
    status.state === 'open'
      ? 'text-emerald-700 bg-emerald-500/10 border-emerald-500/20'
      : status.state === 'paused'
        ? 'text-amber-800 bg-amber-500/10 border-amber-500/25'
        : 'text-red-700 bg-red-500/10 border-red-500/20';

  const banners: { tone: 'red' | 'amber'; text: React.ReactNode }[] = [];
  if (isManager && health?.firestore === 'error') {
    banners.push({
      tone: 'red',
      text: "Checkout is offline: the server can't reach your database (Firebase Admin credentials). Customers can't place orders until this is fixed.",
    });
  }
  if (isManager && health && health.firestore === 'ok' && profile) {
    const card = health.cardPayments && profile.isCardPaymentEnabled !== false && !!import.meta.env.VITE_STRIPE_PUBLIC_KEY;
    if (!card && !profile.isCashPaymentEnabled) {
      banners.push({
        tone: 'amber',
        text: (
          <>
            Customers can't pay yet. Add your Stripe keys, or turn on cash payments in{' '}
            <Link className="underline font-semibold" to="/admin/settings?tab=payments">
              Settings → Payments
            </Link>
            .
          </>
        ),
      });
    }
  }
  if (isManager && profile && !profile.timezone) {
    banners.push({
      tone: 'amber',
      text: (
        <>
          Set your time zone in{' '}
          <Link className="underline font-semibold" to="/admin/settings?tab=hours">
            Settings → Hours
          </Link>{' '}
          so opening hours are applied correctly.
        </>
      ),
    });
  }

  return (
    <div className="min-h-[100dvh] bg-[#F4F6F8] text-gray-900 font-sans antialiased flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-gray-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          {/* Zone 1: Brand & Live Status */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Link to="/" className="flex items-center gap-2.5 min-w-0 group" title="Open storefront">
              {profile?.logoUrl ? (
                <img src={profile.logoUrl} alt="" className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover ring-1 ring-black/10 shadow-2xs shrink-0" />
              ) : (
                <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-[#2E825B] to-[#1E5A3E] text-white flex items-center justify-center font-display font-bold text-sm shrink-0 shadow-2xs">
                  {(profile?.name || 'R').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <span className="block font-display font-bold text-[15px] sm:text-base tracking-tight text-gray-900 truncate max-w-[125px] sm:max-w-[200px] capitalize">
                  {profile?.name || 'OrderFlow'}
                </span>
                <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-widest text-gray-400 -mt-0.5">
                  Admin Portal
                </span>
              </div>
            </Link>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${statusTone}`}>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  status.state === 'open' ? 'bg-emerald-500' : status.state === 'paused' ? 'bg-amber-500' : 'bg-red-500'
                }`}
              />
              {status.badge}
            </span>
          </div>

          {/* Zone 2: Desktop Primary Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-gray-100/90 p-1 rounded-xl border border-gray-200/60" aria-label="Dashboard sections">
            {tabs.map(({ to, label, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-white text-[#287350] shadow-2xs ring-1 ring-gray-200/80'
                      : 'text-gray-600 hover:text-gray-900'
                  }`
                }
              >
                {label}
                {!!badge && (
                  <span className="min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-display font-bold tabular-nums flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Zone 3: Unified Utility Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isStaff && (
              <button
                onClick={toggleSound}
                className={`h-9 px-2.5 sm:px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 border ${
                  soundOn
                    ? 'bg-[#EBF5F0] text-[#287350] border-[#287350]/25'
                    : 'bg-gray-50 text-gray-600 border-gray-200/90 hover:bg-gray-100'
                }`}
                title={soundOn ? 'New-order alert sound is on' : 'Turn on new-order alert sound'}
                aria-label={soundOn ? 'Sound alerts on' : 'Sound alerts off'}
              >
                {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
                <span className="hidden sm:inline">{soundOn ? 'Alerts on' : 'Muted'}</span>
              </button>
            )}
            <Link
              to="/"
              className="h-9 px-2.5 sm:px-3 rounded-xl text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200/90 flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0"
              title="View customer storefront"
            >
              <span className="hidden sm:inline">Storefront</span>
              <ExternalLink size={14} />
            </Link>
            <button
              onClick={logout}
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 border border-transparent hover:border-red-100 hover:bg-red-50 hover:text-red-600 transition"
              title={`Sign out ${userProfile?.email || ''}`}
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      {banners.length > 0 && (
        <div className="max-w-7xl w-full mx-auto px-3.5 sm:px-6 pt-3 space-y-2">
          {banners.map((b, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm ${
                b.tone === 'red' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div className="leading-snug">{b.text}</div>
            </div>
          ))}
        </div>
      )}

      <main className={`flex-1 ${fullBleed ? 'pb-20 md:pb-0' : 'max-w-7xl w-full mx-auto px-3.5 sm:px-6 py-3.5 sm:py-6 pb-24 md:pb-12'}`}>
        <Outlet />
      </main>

      {/* Mobile Bottom Tab Bar: Pill-highlighted thumb-zone navigation */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-gray-200/90 shadow-[0_-4px_16px_rgba(15,23,42,0.04)] pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile dashboard navigation"
      >
        <div className="grid items-center h-16 px-1" style={{ gridTemplateColumns: `repeat(${mobilePrimaryTabs.length + (mobileOverflowTabs.length ? 1 : 0)}, minmax(0, 1fr))` }}>
          {mobilePrimaryTabs.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center h-full min-h-[48px] gap-1 text-[11px] transition-colors ${
                  isActive ? 'text-[#287350] font-bold' : 'text-gray-500 font-medium hover:text-gray-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`relative flex items-center justify-center px-3.5 py-1 rounded-full transition-colors ${
                      isActive ? 'bg-[#EBF5F0] text-[#287350]' : ''
                    }`}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2.3 : 1.9} />
                    {!!badge && (
                      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-display font-bold tabular-nums flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                  </span>
                  <span className="truncate max-w-full px-1 leading-none">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {mobileOverflowTabs.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="More sections"
              aria-expanded={moreOpen}
              className={`relative flex flex-col items-center justify-center h-full min-h-[48px] gap-1 text-[11px] transition-colors ${
                isOverflowActive || moreOpen ? 'text-[#287350] font-bold' : 'text-gray-500 font-medium hover:text-gray-800'
              }`}
            >
              <span
                className={`flex items-center justify-center px-3.5 py-1 rounded-full transition-colors ${
                  isOverflowActive || moreOpen ? 'bg-[#EBF5F0] text-[#287350]' : ''
                }`}
              >
                <MoreHorizontal size={18} strokeWidth={isOverflowActive ? 2.3 : 1.9} />
              </span>
              <span className="leading-none">More</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile "More" Drawer for secondary destinations & account actions */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} surface="admin" size="sm" title={currentTab?.label ? 'Admin Portal' : 'Menu'}>
        <div className="p-4 space-y-4 font-sans">
          <div className="grid grid-cols-1 gap-1.5">
            {mobileOverflowTabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition ${
                    isActive ? 'bg-[#287350] text-white' : 'bg-gray-50 text-gray-800 hover:bg-gray-100'
                  }`
                }
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            <Link
              to="/"
              onClick={() => setMoreOpen(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <span>Open customer storefront</span>
              <ExternalLink size={16} className="text-gray-400" />
            </Link>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                logout();
              }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <span>Sign out {userProfile?.email ? `(${userProfile.email})` : ''}</span>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
};
