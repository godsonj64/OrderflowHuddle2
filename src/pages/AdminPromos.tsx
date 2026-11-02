import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { PromoCode } from '../types';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, Tag, Calendar, Percent, DollarSign, Users } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { Link, useNavigate } from 'react-router-dom';

export const AdminPromos: React.FC = () => {
  const { userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [expiryDate, setExpiryDate] = useState('');
  const [usageLimit, setUsageLimit] = useState<number | ''>('');
  const [minOrders, setMinOrders] = useState<number | ''>('');
  const [minSpent, setMinSpent] = useState<number | ''>('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile || !['admin', 'restaurant_owner', 'manager'].includes(userProfile.role)) {
      navigate('/');
      return;
    }

    const unsub = onSnapshot(collection(db, 'promos'), (snapshot) => {
      const promosData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PromoCode[];
      setPromos(promosData);
      setLoadingPromos(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'promos');
    });

    return () => unsub();
  }, [userProfile, navigate, authLoading]);

  const handleAddPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    try {
      const promoId = code.trim().toUpperCase();
      const promoData: PromoCode = {
        id: promoId,
        discountType,
        discountValue,
        expiresAt: new Date(expiryDate),
        active,
        usedCount: 0,
        usedBy: [],
        createdAt: serverTimestamp(),
      };

      if (usageLimit !== '') {
        promoData.usageLimit = Number(usageLimit);
      }
      if (minOrders !== '') {
        promoData.minOrders = Number(minOrders);
      }
      if (minSpent !== '') {
        promoData.minSpent = Number(minSpent);
      }

      await setDoc(doc(db, 'promos', promoId), promoData);
      
      // Reset form
      setCode('');
      setDiscountType('percentage');
      setDiscountValue(10);
      setExpiryDate('');
      setUsageLimit('');
      setMinOrders('');
      setMinSpent('');
      setActive(true);
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'promos');
    }
  };

  const [promoToDelete, setPromoToDelete] = useState<string | null>(null);

  const handleDeletePromo = async (id: string) => {
    setPromoToDelete(id);
  };

  const confirmDeletePromo = async () => {
    if (promoToDelete) {
      try {
        await deleteDoc(doc(db, 'promos', promoToDelete));
        setPromoToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `promos/${promoToDelete}`);
      }
    }
  };

  const togglePromoStatus = async (promo: PromoCode) => {
    try {
      await setDoc(doc(db, 'promos', promo.id), { active: !promo.active }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `promos/${promo.id}`);
    }
  };

  if (authLoading || loadingPromos) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  if (!userProfile || !['admin', 'restaurant_owner', 'manager'].includes(userProfile.role)) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-black mb-2">Promo Codes</h1>
          <p className="text-gray-500 text-base sm:text-lg">Manage discounts and promotional codes.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/admin" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-2xl font-medium transition-colors shadow-ios-sm">
            Back to Dashboard
          </Link>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 bg-black hover:bg-gray-900 text-[#EADDC5] px-5 py-2.5 rounded-2xl font-medium transition-colors shadow-ios-sm"
          >
            <Plus size={18} />
            {isAdding ? 'Cancel' : 'New Promo'}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100">
          <h2 className="text-xl font-bold text-black mb-6">Create New Promo Code</h2>
          <form onSubmit={handleAddPromo} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input 
                type="text" 
                value={code} 
                onChange={(e) => setCode(e.target.value.toUpperCase())} 
                className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none uppercase"
                placeholder="e.g. SUMMER20"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
              <select 
                value={discountType} 
                onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Value</label>
              <input 
                type="number" 
                value={discountValue} 
                onChange={(e) => setDiscountValue(Number(e.target.value))} 
                className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                min="0"
                step={discountType === 'percentage' ? '1' : '0.01'}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input 
                type="datetime-local" 
                value={expiryDate} 
                onChange={(e) => setExpiryDate(e.target.value)} 
                className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usage Limit (Optional)</label>
              <input 
                type="number" 
                value={usageLimit} 
                onChange={(e) => setUsageLimit(e.target.value)} 
                className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                min="1"
                placeholder="Leave empty for unlimited"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Orders (Optional)</label>
              <input 
                type="number" 
                value={minOrders} 
                onChange={(e) => setMinOrders(e.target.value)} 
                className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                min="0"
                placeholder="Min total orders"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Spent ($) (Optional)</label>
              <input 
                type="number" 
                value={minSpent} 
                onChange={(e) => setMinSpent(e.target.value)} 
                className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                min="0"
                step="0.01"
                placeholder="Min total spent"
              />
            </div>
            <div className="flex items-center gap-3 md:col-span-2 pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={active} 
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-5 h-5 text-black rounded focus:ring-black"
                />
                <span className="font-medium text-gray-700">Active immediately</span>
              </label>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="bg-black hover:bg-gray-900 text-[#EADDC5] px-8 py-3 rounded-2xl font-bold transition-colors shadow-ios-sm">
                Save Promo Code
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-[2rem] shadow-ios-sm border border-gray-100 overflow-hidden">
        {promos.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No promo codes found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm">
                  <th className="p-4 font-medium">Code</th>
                  <th className="p-4 font-medium">Discount</th>
                  <th className="p-4 font-medium">Usage</th>
                  <th className="p-4 font-medium">Expires</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {promos.map(promo => (
                  <tr key={promo.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2 font-bold text-black">
                        <Tag size={16} className="text-gray-400" />
                        {promo.id}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-1 font-medium text-black bg-gray-100 px-2.5 py-1 rounded-xl">
                        {promo.discountType === 'percentage' ? <Percent size={14} /> : <DollarSign size={14} />}
                        {promo.discountValue}{promo.discountType === 'percentage' ? '%' : ''}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-gray-600 text-sm">
                        <Users size={16} className="text-gray-400" />
                        {promo.usedCount} {promo.usageLimit ? `/ ${promo.usageLimit}` : 'used'}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-gray-600 text-sm">
                        <Calendar size={16} className="text-gray-400" />
                        {promo.expiresAt?.seconds ? new Date(promo.expiresAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                      </div>
                    </td>
                    <td className="p-4">
                      <button 
                        onClick={() => togglePromoStatus(promo)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${promo.active ? 'bg-black text-[#EADDC5] hover:bg-gray-900' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      >
                        {promo.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleDeletePromo(promo.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                        title="Delete Promo"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Promo Modal */}
      {promoToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-ios-lg">
            <h3 className="text-2xl font-bold text-black mb-4">Delete Promo Code</h3>
            <p className="text-gray-500 mb-6">
              Are you sure you want to delete promo code "{promoToDelete}"? This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setPromoToDelete(null)}
                className="flex-1 px-4 py-3 rounded-2xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePromo}
                className="flex-1 px-4 py-3 rounded-2xl font-medium text-[#EADDC5] bg-red-600 hover:bg-red-700 transition-colors shadow-ios-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
