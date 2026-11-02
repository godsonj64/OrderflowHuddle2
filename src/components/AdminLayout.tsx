import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ChefHat,
  ClipboardList,
  ExternalLink,
  LogOut,
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
import { api } from '../lib/api';

type Health = Awaited<ReturnType<typeof api.health>>;

export const AdminLayout: React.FC = () => {
  const { userProfile, isStaff, isManager, role, logout } = useAuth();
  const { profile, status } = useStore();
  const { newOrders, soundOn, toggleSound } = useNewOrderAlerts(isStaff);
  const location = useLocation();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    document.title = `${profile?.name || 'OrderFlow'} · Dashboard`;
  }, [profile?.name]);

  useEffect(() => {
    if (!isManager) return;
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth({ status: 'down', firestore: 'error', cardPayments: false, webhooks: false }));
  }, [isManager]);

  const tabs = [
    { to: '/admin', label: 'Orders', icon: ClipboardList, end: true, show: isStaff, badge: newOrders.length },
    { to: '/admin/kitchen', label: 'Kitchen', icon: ChefHat, show: isStaff, badge: newOrders.length },
    { to: '/driver', label: 'Deliveries', icon: Truck, show: role === 'driver' || isManager },
    { to: '/admin/menu', label: 'Menu', icon: UtensilsCrossed, show: isManager },
    { to: '/admin/promos', label: 'Promos', icon: Tag, show: isManager },
    { to: '/admin/users', label: 'People', icon: Users, show: isManager },
    { to: '/admin/settings', label: 'Settings', icon: Settings, show: isManager },
  ].filter((t) => t.show);

  const fullBleed = location.pathname.startsWith('/admin/kitchen');
  const statusDot = status.state === 'open' ? 'bg-emerald-500' : status.state === 'paused' ? 'bg-amber-500' : 'bg-red-500';

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
    <div className="min-h-[100dvh] bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 min-w-0" title="Open storefront">
            {profile?.logoUrl ? (
              <img src={profile.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-100" />
            ) : (
              <span className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold">{(profile?.name || 'R').charAt(0)}</span>
            )}
            <span className="min-w-0">
              <span className="block font-bold text-sm leading-tight truncate">{profile?.name || 'Restaurant'}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500 leading-tight">
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                {status.badge}
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {isStaff && (
              <button
                onClick={toggleSound}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition ${soundOn ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
                title={soundOn ? 'New-order sound is on' : 'Turn on new-order sound'}
              >
                {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                <span className="hidden sm:inline">{soundOn ? 'Sound on' : 'Sound off'}</span>
              </button>
            )}
            <Link to="/" className="p-2 rounded-full text-gray-500 hover:bg-gray-100" title="View storefront" aria-label="View storefront">
              <ExternalLink size={18} />
            </Link>
            <button onClick={logout} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-red-600" title={`Sign out ${userProfile?.email || ''}`} aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-2 sm:px-5 flex gap-1 overflow-x-auto hide-scrollbar pb-2" aria-label="Dashboard sections">
          {tabs.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <Icon size={16} />
              {label}
              {!!badge && (
                <span className="ml-0.5 min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center animate-pulse">
                  {badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      {banners.length > 0 && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3 space-y-2">
          {banners.map((b, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${
                b.tone === 'red' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <div>{b.text}</div>
            </div>
          ))}
        </div>
      )}

      <main className={fullBleed ? '' : 'max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-16'}>
        <Outlet />
      </main>
    </div>
  );
};
