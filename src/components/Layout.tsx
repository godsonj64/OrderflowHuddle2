import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Facebook,
  Globe,
  Home as HomeIcon,
  Instagram,
  LayoutDashboard,
  Music2,
  ShoppingCart,
  Truck,
  User,
} from 'lucide-react';
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
  const tone = status.state === 'open' ? 'text-brand font-semibold' : status.state === 'paused' ? 'text-amber-700 font-semibold' : 'text-muted';
  return (
    <span className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted leading-tight truncate">
      <span className={`truncate ${tone}`}>{status.badge}</span>
      {status.detail && (
        <>
          <span aria-hidden="true">·</span>
          <span className="truncate">{status.detail}</span>
        </>
      )}
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
  const { profile, profileLoading, status } = useStore();
  const { userProfile, isStaff, role } = useAuth();
  const { itemCount } = useCart();
  const { openAuth, openProfile } = useStorefrontUI();
  const location = useLocation();
  const navigate = useNavigate();
  const name = profile?.name || 'Restaurant';

  const isHome = location.pathname === '/';
  const isMenuView = isHome && location.hash === '#menu';
  const mobileTitle = location.pathname.startsWith('/cart')
    ? 'My Cart'
    : location.pathname.startsWith('/my-orders')
      ? 'My Orders'
      : location.pathname.startsWith('/order/')
        ? 'Location'
        : isMenuView
          ? 'Menu'
          : 'Home';

  return (
    <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-xl border-b border-line/70">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3 relative">
        {/* Mobile left action: back button on subpages, or brand avatar on home */}
        <div className="flex items-center gap-2.5 min-w-0 z-10">
          {!isHome ? (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
              className="md:hidden w-9 h-9 rounded-full hover:bg-soft flex items-center justify-center text-ink transition"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          ) : null}

          <Link to="/" className={`${!isHome ? 'hidden md:flex' : 'flex'} items-center gap-2.5 min-w-0`} aria-label={`${name} home`}>
            {profileLoading ? (
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-soft animate-pulse shrink-0" />
            ) : profile?.logoUrl ? (
              <img src={profile.logoUrl} alt="" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shrink-0 border border-line" />
            ) : (
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand text-on-brand flex items-center justify-center font-display font-bold text-sm shrink-0">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="hidden sm:flex min-w-0 flex-col">
              <span className="font-display font-extrabold text-[15px] sm:text-lg leading-tight truncate">{name}</span>
              <StatusLine />
            </span>
          </Link>
        </div>

        {/* Mobile centered page title (Kupa aesthetic) */}
        <div className="md:hidden absolute inset-x-16 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-display font-extrabold text-base text-ink tracking-tight truncate">{mobileTitle}</span>
        </div>

        {/* Right navigation controls */}
        <nav className="flex items-center gap-1.5 sm:gap-2 shrink-0 z-10">
          {isStaff && (
            <Link
              to="/admin"
              className="min-h-[38px] px-3 py-1.5 rounded-btn bg-soft text-ink hover:opacity-85 text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap"
              title="Restaurant dashboard"
            >
              <LayoutDashboard size={15} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          {role === 'driver' && !isStaff && (
            <Link
              to="/driver"
              className="min-h-[38px] px-3 py-1.5 rounded-btn bg-soft text-ink hover:opacity-85 text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap"
              title="Driver dashboard"
            >
              <Truck size={15} />
              <span className="hidden sm:inline">Deliveries</span>
            </Link>
          )}

          {/* Mobile notification / active orders bell (matches Kupa top-right bell icon) */}
          <Link
            to="/my-orders"
            className="md:hidden relative w-9 h-9 rounded-full hover:bg-soft flex items-center justify-center text-ink transition"
            aria-label="Your orders"
            title={status.badge}
          >
            <Bell size={19} strokeWidth={2} />
            {status.state === 'open' && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand ring-2 ring-card" />}
          </Link>

          <Link
            to="/cart"
            className="hidden md:flex relative min-h-[40px] min-w-[40px] items-center justify-center rounded-full text-ink hover:bg-soft transition"
            aria-label={`Cart, ${itemCount} items`}
          >
            <ShoppingCart size={20} />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-brand text-on-brand text-[10px] font-bold font-mono tabular-nums flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Link>

          {userProfile ? (
            <button
              onClick={openProfile}
              className="hidden md:flex min-h-[40px] items-center gap-2 rounded-full border border-line pl-1.5 pr-3 py-1 hover:bg-soft transition"
              aria-label="Your account"
            >
              <span className="w-7 h-7 rounded-full bg-brand text-on-brand flex items-center justify-center text-xs font-bold">
                {(userProfile.name || userProfile.email || '?').charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-semibold max-w-[120px] truncate">{userProfile.name || 'Account'}</span>
            </button>
          ) : (
            <button
              onClick={openAuth}
              className="hidden md:inline-flex min-h-[40px] bg-brand text-on-brand rounded-btn px-4 py-2 text-xs sm:text-sm font-semibold hover:opacity-90 transition whitespace-nowrap"
            >
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
    <footer className="bg-card border-t border-line mt-10 pb-28 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="font-display text-xl sm:text-2xl font-extrabold">{profile.name}</h2>
          {profile.description && <p className="text-sm text-muted max-w-xl mx-auto">{profile.description}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-card border border-line bg-soft/60 p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-2.5">Location</h3>
            <p className="text-sm">{profile.address || 'Address coming soon'}</p>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-sm font-semibold text-brand underline underline-offset-4">
                Get directions
              </a>
            )}
          </div>

          <div className="rounded-card border border-line bg-soft/60 p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-2.5">Hours</h3>
            {hasHoursConfigured(profile.businessHours) ? (
              <ul className="text-sm space-y-1 tabular-nums">
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

          <div className="rounded-card border border-line bg-soft/60 p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-2.5">Contact</h3>
            <div className="text-sm space-y-1.5">
              {profile.phone && (
                <a href={`tel:${profile.phone}`} className="block hover:text-brand tabular-nums">
                  {profile.phone}
                </a>
              )}
              {profile.email && (
                <a href={`mailto:${profile.email}`} className="block hover:text-brand break-all">
                  {profile.email}
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
  const location = useLocation();
  const navigate = useNavigate();

  const isHomeActive = location.pathname === '/' && location.hash !== '#menu';
  const isMenuActive = location.pathname === '/' && location.hash === '#menu';
  const isCartActive = location.pathname.startsWith('/cart');
  const isProfileActive = location.pathname.startsWith('/my-orders');

  const item = (active: boolean) =>
    `relative flex flex-col items-center justify-center gap-1 flex-1 min-h-[58px] py-1.5 text-[11px] font-semibold transition-colors ${
      active ? 'text-brand font-bold' : 'text-muted hover:text-ink'
    }`;

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/98 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]" aria-label="Main">
      <div className="grid grid-cols-4 items-center">
        <button
          type="button"
          onClick={() => {
            navigate('/');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={item(isHomeActive)}
        >
          <HomeIcon size={20} strokeWidth={isHomeActive ? 2.4 : 1.8} />
          <span>Home</span>
          {isHomeActive && <span className="w-1 h-1 rounded-full bg-brand" />}
        </button>

        <button
          type="button"
          onClick={() => {
            if (location.pathname !== '/') {
              navigate('/#menu');
            } else {
              window.location.hash = 'menu';
              document.getElementById('menu-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
          className={item(isMenuActive)}
        >
          <BookOpen size={20} strokeWidth={isMenuActive ? 2.4 : 1.8} />
          <span>Menu</span>
          {isMenuActive && <span className="w-1 h-1 rounded-full bg-brand" />}
        </button>

        <NavLink to="/cart" className={item(isCartActive)}>
          <span className="relative">
            <ShoppingCart size={20} strokeWidth={isCartActive ? 2.4 : 1.8} />
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-brand text-on-brand text-[9px] font-bold font-mono tabular-nums flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </span>
          <span>{itemCount > 0 ? `Cart (${itemCount})` : 'Cart'}</span>
          {isCartActive && <span className="w-1 h-1 rounded-full bg-brand" />}
        </NavLink>

        <button onClick={userProfile ? openProfile : openAuth} className={item(isProfileActive)}>
          <User size={20} strokeWidth={isProfileActive ? 2.4 : 1.8} />
          <span>Profile</span>
          {isProfileActive && <span className="w-1 h-1 rounded-full bg-brand" />}
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
  const isCartPage = location.pathname.startsWith('/cart');

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
        <main className={`flex-grow w-full max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-7 ${isCartPage ? 'pb-48' : 'pb-28'} md:pb-12`}>
          <Outlet />
        </main>
        <Footer />
        <BottomNav />
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
        {userProfile && <UserProfileDrawer isOpen={profileOpen} onClose={() => setProfileOpen(false)} userProfile={userProfile} />}
      </div>
    </StorefrontUIContext.Provider>
  );
};
