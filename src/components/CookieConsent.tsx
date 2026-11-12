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
    if (choice) return;

    let interacted = false;
    let dwellDone = false;
    const maybeShow = () => {
      if (interacted && dwellDone) setIsVisible(true);
    };
    const onInteract = () => {
      interacted = true;
      maybeShow();
    };
    const timer = window.setTimeout(() => {
      dwellDone = true;
      maybeShow();
    }, 12_000);

    window.addEventListener('scroll', onInteract, { passive: true, once: true });
    window.addEventListener('pointerdown', onInteract, { passive: true, once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onInteract);
      window.removeEventListener('pointerdown', onInteract);
    };
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
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="fixed left-0 right-0 bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-4 px-3 sm:px-4 z-[900] pointer-events-none"
        >
          <div className="max-w-xl mx-auto bg-[#141a14]/95 backdrop-blur-md text-[#F2EBE1] px-3.5 py-2.5 rounded-2xl shadow-ios-lg pointer-events-auto flex items-center justify-between gap-3">
            <p className="text-xs text-gray-300 leading-snug">
              Essential storage keeps your cart & sign-in active.{' '}
              <Link to="/cookie-policy" className="underline underline-offset-2 text-white">
                Policy
              </Link>
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => decide('declined')} className="px-2.5 py-1.5 rounded-lg font-semibold text-gray-300 hover:bg-white/10 text-xs">
                Dismiss
              </button>
              <button onClick={() => decide('true')} className="px-3 py-1.5 rounded-lg font-bold text-black bg-white hover:bg-gray-100 text-xs">
                OK
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
