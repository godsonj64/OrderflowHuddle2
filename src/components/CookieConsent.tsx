import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';

export const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      // Small delay to not overwhelm the user immediately on load
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem('cookieConsent', 'true');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 z-[10000] pointer-events-none md:bottom-0 bottom-20"
        >
          <div className="max-w-4xl mx-auto bg-black text-[#EADDC5] p-6 sm:p-8 rounded-[2rem] shadow-ios-lg pointer-events-auto flex flex-col sm:flex-row items-center justify-between gap-6 border border-gray-800">
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg font-bold mb-2">We value your privacy</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                We use cookies to enhance your browsing experience, serve personalized ads or content, and analyze our traffic. By clicking "Accept All", you consent to our use of cookies.
              </p>
              <div className="mt-2">
                <Link to="/cookie-policy" className="text-gray-300 hover:text-[#EADDC5] text-sm underline underline-offset-4 transition-colors">
                  Read our Cookie Policy
                </Link>
              </div>
            </div>
            <div className="flex gap-3 w-full sm:w-auto shrink-0">
              <button
                onClick={() => setIsVisible(false)}
                className="flex-1 sm:flex-none px-6 py-3 rounded-2xl font-medium text-gray-300 bg-gray-900 hover:bg-gray-800 transition-colors text-sm"
              >
                Decline
              </button>
              <button
                onClick={acceptCookies}
                className="flex-1 sm:flex-none px-6 py-3 rounded-2xl font-bold text-black bg-white hover:bg-gray-100 transition-colors shadow-ios-sm text-sm"
              >
                Accept All
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
