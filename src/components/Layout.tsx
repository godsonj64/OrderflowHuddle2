import React, { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { ShoppingCart, User, LogOut, Menu, Settings, Truck } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { RestaurantProfile } from '../types';
import { AuthModal } from './AuthModal';
import { UserProfileDrawer } from './UserProfileDrawer';
import Logo from './Logo';

export const Layout: React.FC = () => {
  const { userProfile, logout } = useAuth();
  const { cart } = useCart();
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);

  useEffect(() => {
    const unsubProfile = onSnapshot(doc(db, 'restaurant', 'profile'), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as RestaurantProfile);
      }
      setLoadingProfile(false);
    });
    return () => unsubProfile();
  }, []);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50 text-black font-sans flex flex-col overflow-x-hidden">
      <header className="bg-white/95 backdrop-blur-xl sticky top-0 z-50 shadow-[0_2px_24px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 sm:h-20 items-center">
            <div className="flex items-center">
              <Link to="/" className="flex-shrink-0 flex items-center gap-2 sm:gap-3 group">
                {loadingProfile ? (
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 animate-pulse rounded-full" />
                ) : profile?.logoUrl ? (
                  <img src={profile.logoUrl} alt="Logo" className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover shadow-[0_2px_8px_rgba(0,0,0,0.08)]" />
                ) : (
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-black rounded-full flex items-center justify-center text-white font-sans font-bold text-xl sm:text-2xl group-hover:bg-gray-800 transition-colors shadow-sm">
                    {profile?.name ? profile.name.charAt(0).toUpperCase() : 'R'}
                  </div>
                )}
                <div className="flex flex-col">
                  {loadingProfile ? (
                    <div className="h-5 w-32 bg-gray-100 animate-pulse rounded mb-1" />
                  ) : (
                    <span className="font-sans font-extrabold text-lg sm:text-xl tracking-tight text-black leading-none max-w-[140px] sm:max-w-none truncate">{profile?.name || 'Restaurant'}</span>
                  )}
                  <span className="text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-[0.15em] mt-0.5 sm:mt-1">Powered by OrderFlow</span>
                </div>
              </Link>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-5">
              {userProfile && ['admin', 'restaurant_owner', 'manager'].includes(userProfile.role) && (
                <Link to="/admin" className="text-gray-400 hover:text-black flex items-center p-2 rounded-full hover:bg-gray-50 transition-colors">
                  <Settings size={22} />
                </Link>
              )}
              
              {userProfile && userProfile.role === 'driver' && (
                <Link to="/driver" className="text-gray-400 hover:text-black flex items-center p-2 rounded-full hover:bg-gray-50 transition-colors">
                  <Truck size={22} />
                </Link>
              )}
              
              <Link to="/cart" className="text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-full p-2.5 relative transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                <ShoppingCart size={22} className="w-5 h-5 sm:w-6 sm:h-6" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold leading-none text-white bg-primary rounded-full shadow-[0_2px_8px_rgba(31,107,75,0.4)]">
                    {totalItems}
                  </span>
                )}
              </Link>

              {userProfile ? (
                <div className="flex items-center gap-2 sm:gap-4 ml-1 sm:ml-4">
                  <button onClick={() => setIsProfileDrawerOpen(true)} className="flex items-center gap-2 text-gray-700 hover:text-black font-semibold transition-colors bg-white border border-gray-100 rounded-full pl-1.5 pr-4 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {userProfile.name?.charAt(0) || <User size={12} />}
                    </div>
                    <span className="hidden sm:inline text-sm">{userProfile.name || 'Profile'}</span>
                  </button>
                  <button onClick={logout} className="text-gray-400 hover:text-red-500 p-2 transition-colors rounded-full hover:bg-red-50" title="Log out">
                    <LogOut size={20} className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="bg-black text-white px-5 py-2.5 rounded-full font-semibold text-sm shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:bg-gray-900 transition-all hover:-translate-y-0.5 ml-2"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 pb-28 sm:pb-12">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-between items-center z-[9999] rounded-t-[1.5rem] shadow-[0_-8px_32px_rgba(0,0,0,0.08)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Link to="/" className="flex flex-col items-center gap-1 text-gray-400 hover:text-primary active:scale-90 transition-all duration-200">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          <span className="text-[10px] font-bold">Home</span>
        </Link>
        <Link to="/my-orders" className="flex flex-col items-center gap-1 text-gray-400 hover:text-primary active:scale-90 transition-all duration-200">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
          <span className="text-[10px] font-bold">Orders</span>
        </Link>
        <Link to="/cart" className="flex flex-col items-center gap-1 text-gray-400 hover:text-primary active:scale-90 transition-all duration-200 relative">
          <ShoppingCart size={24} className="w-6 h-6" />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-2 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold leading-none text-white bg-primary rounded-full shadow-sm">
              {totalItems}
            </span>
          )}
          <span className="text-[10px] font-bold">Cart</span>
        </Link>
        {userProfile ? (
          <button onClick={() => setIsProfileDrawerOpen(true)} className="flex flex-col items-center gap-1 text-gray-400 hover:text-primary active:scale-90 transition-all duration-200">
            <User size={24} className="w-6 h-6" />
            <span className="text-[10px] font-bold">Profile</span>
          </button>
        ) : (
          <button onClick={() => setIsAuthModalOpen(true)} className="flex flex-col items-center gap-1 text-gray-400 hover:text-primary active:scale-90 transition-all duration-200">
            <User size={24} className="w-6 h-6" />
            <span className="text-[10px] font-bold">Profile</span>
          </button>
        )}
      </div>

      {userProfile && (
        <UserProfileDrawer 
          isOpen={isProfileDrawerOpen}
          onClose={() => setIsProfileDrawerOpen(false)}
          userProfile={userProfile}
        />
      )}

      <footer className="bg-[#0A0A0A] text-gray-400 py-8 pb-28 sm:py-12 sm:pb-12 border-t border-[#1a1a1a] relative overflow-hidden">
        {/* Subtle decorative grid/glow for depth */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.03] via-[#0A0A0A] to-[#0A0A0A] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10 flex flex-col items-center">
          
          {/* Restaurant Header */}
          <div className="mb-6 sm:mb-8 text-center flex flex-col items-center">
            {loadingProfile ? (
              <div className="h-8 w-48 bg-gray-800 animate-pulse rounded lg:mx-0 mx-auto" />
            ) : (
              <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{profile?.name || 'Restaurant'}</h3>
            )}
            <div className="w-10 h-1 bg-white/20 mt-3 sm:mt-4 rounded-full" />
          </div>
          
          {!loadingProfile && profile && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl mb-8 sm:mb-12">
              
              {/* Location */}
              <div className="flex flex-col items-center md:items-start group text-center md:text-left bg-white/[0.015] rounded-[24px] p-6 sm:p-8 border border-white/[0.03] hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-300">
                <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-4 text-gray-400 group-hover:text-white group-hover:scale-110 transition-all duration-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <h4 className="text-white font-bold mb-2 uppercase tracking-[0.2em] text-[9px] sm:text-[10px] opacity-100">Location</h4>
                <p className="text-gray-400 text-[13px] leading-relaxed max-w-[200px] group-hover:text-gray-300 transition-colors">{profile.address || 'Address not provided'}</p>
              </div>

              {/* Hours */}
              <div className="flex flex-col items-center md:items-start group text-center md:text-left bg-white/[0.015] rounded-[24px] p-6 sm:p-8 border border-white/[0.03] hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-300">
                <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-4 text-gray-400 group-hover:text-white group-hover:scale-110 transition-all duration-300">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h4 className="text-white font-bold mb-3 uppercase tracking-[0.2em] text-[9px] sm:text-[10px] opacity-100">Hours</h4>
                <div className="text-gray-400 justify-between text-[13px] w-full space-y-1.5 flex flex-col">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                    const hours = profile.businessHours?.[day];
                    if (!hours) return null;
                    return (
                      <div key={day} className="flex justify-between items-start gap-4 w-full">
                        <span className="text-gray-500 font-medium">{day.slice(0, 3)}</span>
                        <div className="flex flex-col items-end text-right text-gray-300 group-hover:text-white transition-colors">
                          <span>{hours.closed ? 'Closed' : `${hours.open} - ${hours.close}`}</span>
                          {hours.hasSecondSlot && !hours.closed && (
                            <span className="text-gray-500 group-hover:text-gray-400 font-normal mt-0.5 text-xs">{`${hours.open2} - ${hours.close2}`}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Contact */}
              <div className="flex flex-col items-center md:items-start group text-center md:text-left bg-white/[0.015] rounded-[24px] p-6 sm:p-8 border border-white/[0.03] hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-300">
                <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-4 text-gray-400 group-hover:text-white group-hover:scale-110 transition-all duration-300">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <h4 className="text-white font-bold mb-2 uppercase tracking-[0.2em] text-[9px] sm:text-[10px] opacity-100">Contact</h4>
                <div className="text-gray-400 text-[13px] leading-relaxed space-y-1.5 flex flex-col items-center md:items-start">
                  {profile.phone && <a href={`tel:${profile.phone}`} className="block hover:text-white transition-colors group-hover:text-gray-300">{profile.phone}</a>}
                  {profile.email && <a href={`mailto:${profile.email}`} className="block hover:text-white transition-colors group-hover:text-gray-300">{profile.email}</a>}
                  {!profile.phone && !profile.email && 'Contact info not provided'}
                </div>
              </div>

            </div>
          )}

          {/* Bottom Bar */}
          <div className="w-full border-t border-white/5 pt-6 sm:pt-8 flex flex-col lg:flex-row items-center content-center justify-between gap-4 lg:gap-8 relative z-10">
            
            {/* Left Hand Side - Legal Links */}
            <div className="flex-1 flex justify-center lg:justify-start gap-4 sm:gap-6 text-[10px] font-medium text-gray-400 uppercase tracking-widest shrink-0">
              <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
              <Link to="/terms-of-service" className="hover:text-white transition-colors">Terms</Link>
              <Link to="/cookie-policy" className="hover:text-white transition-colors">Cookies</Link>
            </div>
            
            {/* Center - Big OrderFlow Logo */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <Logo className="w-12 h-12 sm:w-16 sm:h-16 text-[#EADDC5] opacity-80 hover:opacity-100 transition-opacity drop-shadow-xl" cutoutFill="#0A0A0A" />
            </div>
            
            {/* Right Hand Side - Copyright */}
            <div className="flex-1 flex justify-center lg:justify-end text-[11px] text-gray-600 font-medium shrink-0 flex-col items-center lg:items-end gap-1">
               <span>© {new Date().getFullYear()} {profile?.name || 'Restaurant'}.</span>
               <span>All rights reserved.</span>
            </div>
            
          </div>
        </div>
      </footer>
    </div>
  );
};
