import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';

const KEY = 'cookieConsent';

export const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/driver');

  useEffect(() => {
    let choice: string | null = null;
    try {
      choice = localStorage.getItem(KEY);
    } catch {
      choice = 'unavailable';
    }
    if (!choice) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const decide = (value: 'true' | 'declined') => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // ignore
    }
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && !isAdmin && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed left-0 right-0 bottom-[calc(72px+env(safe-area-inset-bottom))] md:bottom-4 p-3 sm:p-4 z-[900] pointer-events-none"
        >
          <div className="max-w-3xl mx-auto bg-[#141a14] text-[#F2EBE1] p-4 sm:p-5 rounded-3xl shadow-ios-lg pointer-events-auto flex flex-col sm:flex-row items-center gap-4">
            <p className="text-sm text-gray-300 leading-relaxed flex-1 text-center sm:text-left">
              We use essential cookies and local storage to keep you signed in and remember your cart.{' '}
              <Link to="/cookie-policy" className="underline underline-offset-4 text-white">
                Cookie policy
              </Link>
            </p>
            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <button onClick={() => decide('declined')} className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl font-semibold text-gray-300 bg-white/10 hover:bg-white/15 text-sm">
                Decline
              </button>
              <button onClick={() => decide('true')} className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl font-bold text-black bg-white hover:bg-gray-100 text-sm">
                Accept
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
