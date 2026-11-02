import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { PromoCode, UserProfile } from '../types';
import { X, Award, ShoppingBag, DollarSign, Tag, Gift } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

interface UserProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
}

export const UserProfileDrawer: React.FC<UserProfileDrawerProps> = ({ isOpen, onClose, userProfile }) => {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const { logout } = useAuth();

  useEffect(() => {
    if (!isOpen || !userProfile) return;

    const fetchPromos = async () => {
      try {
        const now = Timestamp.now();
        const promoQuery = query(
          collection(db, 'promos'),
          where('active', '==', true),
          where('expiresAt', '>', now)
        );
        const snapshot = await getDocs(promoQuery);
        const activePromos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PromoCode));
        
        // Filter promos that are for everyone or assigned to this user
        const applicablePromos = activePromos.filter(promo => {
            if (promo.usedBy && promo.usedBy.includes(userProfile.uid)) return false;
            if (promo.assignedTo && promo.assignedTo.length > 0) {
                return promo.assignedTo.includes(userProfile.uid);
            }
            // Add segmentation rules (min orders, min spent)
            if (promo.minOrders && (userProfile.totalOrders || 0) < promo.minOrders) return false;
            if (promo.minSpent && (userProfile.totalSpent || 0) < promo.minSpent) return false;
            
            return true;
        });
        
        setPromos(applicablePromos);
      } catch (error) {
        console.error('Error fetching promos:', error);
      } finally {
        setLoadingPromos(false);
      }
    };

    fetchPromos();
  }, [isOpen, userProfile]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10001]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 max-h-[85vh] bg-white rounded-t-[2.5rem] shadow-[0_-8px_30px_rgb(0,0,0,0.12)] z-[10002] overflow-hidden flex flex-col md:max-w-md md:mx-auto md:bottom-24 md:rounded-3xl md:shadow-2xl"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold font-sans">Your Profile</h2>
              <button
                onClick={onClose}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-6 flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
                        {userProfile.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">{userProfile.name || 'User'}</h3>
                        <p className="text-gray-500 text-sm">{userProfile.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex flex-col gap-2">
                        <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                            <Award size={18} />
                        </div>
                        <span className="text-sm text-gray-500 font-medium">Points</span>
                        <span className="text-2xl font-bold text-black">{userProfile.loyaltyPoints || 0}</span>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex flex-col gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                            <ShoppingBag size={18} />
                        </div>
                        <span className="text-sm text-gray-500 font-medium">Orders</span>
                        <span className="text-2xl font-bold text-black">{userProfile.totalOrders || 0}</span>
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                        <Gift size={20} className="text-primary"/> Promo Inbox
                    </h3>
                    {loadingPromos ? (
                        <div className="flex justify-center p-4">
                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : promos.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {promos.map(promo => (
                                <div key={promo.id} className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex justify-between items-center relative overflow-hidden">
                                     <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-bl-full -z-10" />
                                     <div>
                                        <div className="font-mono font-bold text-lg text-primary">{promo.id}</div>
                                        <div className="text-sm text-gray-600">
                                            {promo.discountType === 'percentage' ? `${promo.discountValue}% OFF` : `$${promo.discountValue} OFF`}
                                        </div>
                                     </div>
                                     <button 
                                        className="text-xs font-bold bg-primary text-white px-3 py-1.5 rounded-full hover:bg-black transition-colors"
                                        onClick={() => {
                                            navigator.clipboard.writeText(promo.id);
                                            alert("Copied to clipboard!");
                                        }}
                                     >
                                         Copy
                                     </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl text-center border border-gray-100">
                            No active promos right now. Check back later!
                        </p>
                    )}
                </div>

                <div className="pt-4 border-t border-gray-100 space-y-3">
                    <Link 
                        to="/my-orders" 
                        onClick={onClose}
                        className="w-full text-center block px-6 py-3 bg-gray-100 hover:bg-gray-200 text-black font-semibold rounded-2xl transition-colors"
                    >
                        View Order History
                    </Link>
                    {['admin', 'restaurant_owner', 'manager'].includes(userProfile.role) && (
                        <Link 
                            to="/admin" 
                            onClick={onClose}
                            className="w-full text-center block px-6 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-2xl transition-colors"
                        >
                            Admin Dashboard
                        </Link>
                    )}
                    <button 
                        onClick={() => { onClose(); logout(); }}
                        className="w-full px-6 py-3 text-red-500 hover:bg-red-50 font-semibold rounded-2xl transition-colors"
                    >
                        Sign Out
                    </button>
                </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
