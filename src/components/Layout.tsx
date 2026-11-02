import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Clock, Facebook, Globe, Home as HomeIcon, Instagram, LayoutDashboard, Mail, MapPin, Music2, Phone, Receipt, ShoppingBag, Truck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { ANNOUNCEMENT_STYLES, SURFACES, themeStyle } from '../lib/theme';
import { WEEK_DAYS, formatShift, hasHoursConfigured, zonedParts } from '../lib/hours';
import { AuthModal } from './AuthModal';
import { UserProfileDrawer } from './UserProfileDrawer';
import Logo from './Logo';

interface StorefrontUI {
  openAuth: () => void;
  openProfile: () => void;
}

const StorefrontUIContext = createContext<StorefrontUI>({ openAuth: () => undefined, openProfile: () => undefined });
export const useStorefrontUI = () => useContext(StorefrontUIContext);

/** Applies the owner's theme to the whole document while the storefront is shown. */
function useApplyTheme() {
  const { theme } = useStore();
  const vars = useMemo(() => themeStyle(theme) as Record<string, string>, [theme]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const keys = Object.keys(vars).filter((k) => k.startsWith('--'));
    for (const k of keys) root.style.setProperty(k, String(vars[k]));
    root.style.setProperty('--app-bg', SURFACES[theme.mode].page);
    root.style.colorScheme = theme.mode === 'dark' ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    const previous = meta?.getAttribute('content');
    meta?.setAttribute('content', SURFACES[theme.mode].card);
    return () => {
      for (const k of keys) root.style.removeProperty(k);
      root.style.removeProperty('--app-bg');
      root.style.colorScheme = '';
      if (meta && previous) meta.setAttribute('content', previous);
    };
  }, [vars, theme.mode]);
}

function StatusLine() {
  const { status, profileLoading } = useStore();
  if (profileLoading) return <span className="h-3 w-24 rounded bg-soft animate-pulse inline-block" />;
  const dot = status.state === 'open' ? 'bg-emerald-500' : status.state === 'paused' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted leading-tight truncate">
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className="truncate">
        {status.badge}
        {status.detail ? ` · ${status.detail}` : ''}
      </span>
    </span>
  );
}

function AnnouncementBar() {
  const { theme } = useStore();
  if (!theme.announcementEnabled || !theme.announcementText.trim()) return null;
  return (
    <div className={`${ANNOUNCEMENT_STYLES[theme.announcementTone]} text-center text-xs sm:text-sm font-semibold px-4 py-2`} role="status">
      {theme.announcementText}
    </div>
  );
}

function Header() {
  const { profile, profileLoading } = useStore();
  const { userProfile, isStaff, role } = useAuth();
  const { itemCount } = useCart();
  const { openAuth, openProfile } = useStorefrontUI();
  const name = profile?.name || 'Restaurant';

  return (
    <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-xl border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2.5 min-w-0" aria-label={`${name} home`}>
          {profileLoading ? (
            <span className="w-9 h-9 rounded-full bg-soft animate-pulse shrink-0" />
          ) : profile?.logoUrl ? (
            <img src={profile.logoUrl} alt="" className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shrink-0 border border-line" />
          ) : (
            <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-brand text-on-brand flex items-center justify-center font-display font-bold text-lg shrink-0">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex flex-col">
            <span className="font-display font-extrabold text-[16px] sm:text-lg leading-tight truncate">{name}</span>
            <StatusLine />
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
          {isStaff && (
            <Link to="/admin" className="p-2.5 rounded-full text-muted hover:text-ink hover:bg-soft transition" title="Restaurant dashboard" aria-label="Restaurant dashboard">
              <LayoutDashboard size={20} />
            </Link>
          )}
          {role === 'driver' && (
            <Link to="/driver" className="p-2.5 rounded-full text-muted hover:text-ink hover:bg-soft transition" title="Driver dashboard" aria-label="Driver dashboard">
              <Truck size={20} />
            </Link>
          )}
          <Link to="/cart" className="hidden md:flex relative p-2.5 rounded-full text-ink hover:bg-soft transition" aria-label={`Cart, ${itemCount} items`}>
            <ShoppingBag size={21} />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-brand text-on-brand text-[10px] font-bold flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Link>
          {userProfile ? (
            <button onClick={openProfile} className="flex items-center gap-2 rounded-full border border-line pl-1 pr-1 sm:pr-3 py-1 hover:bg-soft transition" aria-label="Your account">
              <span className="w-7 h-7 rounded-full bg-brand text-on-brand flex items-center justify-center text-xs font-bold">
                {(userProfile.name || userProfile.email || '?').charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:inline text-sm font-semibold max-w-[120px] truncate">{userProfile.name || 'Account'}</span>
            </button>
          ) : (
            <button onClick={openAuth} className="bg-brand text-on-brand rounded-btn px-4 py-2 text-sm font-semibold hover:opacity-90 transition">
              Sign in
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

function SocialLinks() {
  const { profile } = useStore();
  const social = profile?.social || {};
  const links = [
    { href: social.instagram, label: 'Instagram', icon: Instagram },
    { href: social.tiktok, label: 'TikTok', icon: Music2 },
    { href: social.facebook, label: 'Facebook', icon: Facebook },
    { href: social.website, label: 'Website', icon: Globe },
  ].filter((l) => l.href && /^https?:\/\//i.test(l.href));
  if (!links.length) return null;
  return (
    <div className="flex items-center justify-center gap-2">
      {links.map(({ href, label, icon: Icon }) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="w-10 h-10 rounded-full border border-line flex items-center justify-center text-muted hover:text-ink hover:bg-soft transition">
          <Icon size={18} />
        </a>
      ))}
    </div>
  );
}

function Footer() {
  const { profile, theme, status } = useStore();
  if (!profile) return null;
  const today = WEEK_DAYS[(zonedParts(new Date(), status.timeZone).weekday + 6) % 7];
  const mapsUrl =
    profile.social?.maps && /^https?:\/\//i.test(profile.social.maps)
      ? profile.social.maps
      : profile.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.address)}`
        : null;

  return (
    <footer className="bg-card border-t border-line mt-8 pb-24 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="font-display text-xl sm:text-2xl font-extrabold">{profile.name}</h2>
          {profile.description && <p className="text-sm text-muted max-w-xl mx-auto">{profile.description}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-card border border-line bg-page p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-2">
              <MapPin size={14} /> Location
            </h3>
            <p className="text-sm">{profile.address || 'Address coming soon'}</p>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-sm font-semibold text-brand underline underline-offset-4">
                Get directions
              </a>
            )}
          </div>

          <div className="rounded-card border border-line bg-page p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-2">
              <Clock size={14} /> Hours
            </h3>
            {hasHoursConfigured(profile.businessHours) ? (
              <ul className="text-sm space-y-1">
                {WEEK_DAYS.map((day) => {
                  const h = profile.businessHours?.[day];
                  return (
                    <li key={day} className={`flex justify-between gap-3 ${day === today ? 'font-bold' : ''}`}>
                      <span className={day === today ? '' : 'text-muted'}>{day.slice(0, 3)}</span>
                      <span className="text-right">
                        {!h || h.closed ? (
                          'Closed'
                        ) : (
                          <>
                            {formatShift(h.open, h.close)}
                            {h.hasSecondSlot && h.open2 && h.close2 && (
                              <span className="block text-xs text-muted">
                                {formatShift(h.open2, h.close2)}
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Hours not listed</p>
            )}
          </div>

          <div className="rounded-card border border-line bg-page p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-2">
              <Phone size={14} /> Contact
            </h3>
            <div className="text-sm space-y-1.5">
              {profile.phone && (
                <a href={`tel:${profile.phone}`} className="flex items-center gap-2 hover:text-brand">
                  <Phone size={14} className="text-muted" /> {profile.phone}
                </a>
              )}
              {profile.email && (
                <a href={`mailto:${profile.email}`} className="flex items-center gap-2 hover:text-brand break-all">
                  <Mail size={14} className="text-muted" /> {profile.email}
                </a>
              )}
              {!profile.phone && !profile.email && <p className="text-muted">Contact info coming soon</p>}
            </div>
          </div>
        </div>

        <SocialLinks />

        <div className="border-t border-line pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div className="flex gap-5 uppercase tracking-widest font-semibold">
            <Link to="/privacy-policy" className="hover:text-ink">Privacy</Link>
            <Link to="/terms-of-service" className="hover:text-ink">Terms</Link>
            <Link to="/cookie-policy" className="hover:text-ink">Cookies</Link>
          </div>
          <span>
            © {new Date().getFullYear()} {profile.name}
          </span>
          {theme.showPoweredBy && (
            <span className="flex items-center gap-2">
              Powered by <Logo className="h-4 w-auto" cutoutFill="var(--color-card)" />
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

function BottomNav() {
  const { itemCount } = useCart();
  const { userProfile } = useAuth();
  const { openAuth, openProfile } = useStorefrontUI();
  const item = (active: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[11px] font-semibold transition-colors ${active ? 'text-brand' : 'text-muted'}`;

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]" aria-label="Main">
      <div className="flex">
        <NavLink to="/" end className={({ isActive }) => item(isActive)}>
          <HomeIcon size={22} />
          Menu
        </NavLink>
        <NavLink to="/my-orders" className={({ isActive }) => item(isActive)}>
          <Receipt size={22} />
          Orders
        </NavLink>
        <NavLink to="/cart" className={({ isActive }) => item(isActive)}>
          <span className="relative">
            <ShoppingBag size={22} />
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-brand text-on-brand text-[9px] font-bold flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </span>
          Cart
        </NavLink>
        <button onClick={userProfile ? openProfile : openAuth} className={item(false)}>
          <User size={22} />
          {userProfile ? 'Account' : 'Sign in'}
        </button>
      </div>
    </nav>
  );
}

export const Layout: React.FC = () => {
  useApplyTheme();
  const { profile } = useStore();
  const { userProfile } = useAuth();
  const location = useLocation();
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const hideBottomNav = location.pathname.startsWith('/cart');

  useEffect(() => {
    document.title = profile?.name ? `${profile.name} · Order online` : 'Order online';
  }, [profile?.name]);

  // Close the sign-in modal automatically once the user is signed in.
  useEffect(() => {
    if (userProfile) setAuthOpen(false);
  }, [userProfile]);

  const ui = useMemo<StorefrontUI>(() => ({ openAuth: () => setAuthOpen(true), openProfile: () => setProfileOpen(true) }), []);

  return (
    <StorefrontUIContext.Provider value={ui}>
      <div className="min-h-[100dvh] bg-page text-ink font-sans flex flex-col">
        <AnnouncementBar />
        <Header />
        <main className={`flex-grow w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8 ${hideBottomNav ? 'pb-40' : 'pb-28'} md:pb-12`}>
          <Outlet />
        </main>
        <Footer />
        {!hideBottomNav && <BottomNav />}
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
        {userProfile && <UserProfileDrawer isOpen={profileOpen} onClose={() => setProfileOpen(false)} userProfile={userProfile} />}
      </div>
    </StorefrontUIContext.Provider>
  );
};
