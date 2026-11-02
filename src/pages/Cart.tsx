import React, { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { Trash2, Plus, Minus, ArrowRight, CreditCard, ShoppingCart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp, getDoc, doc, updateDoc, increment, arrayUnion, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { CheckoutForm } from '../components/CheckoutForm';
import { AuthModal } from '../components/AuthModal';
import { PromoCode, RestaurantProfile } from '../types';
import { onSnapshot } from 'firebase/firestore';

// Initialize Stripe outside component to avoid recreating the object
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_placeholder');

export const Cart: React.FC = () => {
  const { cart, updateQuantity, removeFromCart, total, clearCart, promoCode, applyPromo, removePromo, discount } = useCart();
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [address, setAddress] = useState('');
  
  // Scheduled Pickup State
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  const [orderNotes, setOrderNotes] = useState('');
  const [restaurantTip, setRestaurantTip] = useState<number>(0);
  const [deliveryTip, setDeliveryTip] = useState<number>(0);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  
  const [promoInput, setPromoInput] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

  useEffect(() => {
    const unsubProfile = onSnapshot(doc(db, 'restaurant', 'profile'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as RestaurantProfile;
        setProfile(data);
        // Auto-select available order type if current one is disabled
        if (orderType === 'delivery' && data.isDeliveryEnabled === false) setOrderType('pickup');
        if (orderType === 'pickup' && data.isPickupEnabled === false) setOrderType('delivery');
      }
    });
    return () => unsubProfile();
  }, [orderType]);

  const handleApplyPromo = async () => {
    if (!promoInput.trim() || !userProfile) return;
    setIsApplyingPromo(true);
    setMessage(null);

    try {
      const promoId = promoInput.trim().toUpperCase();
      const promoDoc = await getDoc(doc(db, 'promos', promoId));
      
      if (!promoDoc.exists()) {
        throw new Error('Invalid promo code.');
      }

      const promo = { id: promoDoc.id, ...promoDoc.data() } as PromoCode;

      if (!promo.active) {
        throw new Error('This promo code is no longer active.');
      }

      if (promo.expiresAt && promo.expiresAt.toDate() < new Date()) {
        throw new Error('This promo code has expired.');
      }

      if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
        throw new Error('This promo code has reached its usage limit.');
      }

      if (promo.usedBy?.includes(userProfile.uid)) {
        throw new Error('You have already used this promo code.');
      }

      if (promo.assignedTo && promo.assignedTo.length > 0 && !promo.assignedTo.includes(userProfile.uid)) {
        throw new Error('This promo code is not valid for your account.');
      }

      if (promo.minOrders !== undefined && (userProfile.totalOrders || 0) < promo.minOrders) {
        throw new Error(`This promo code requires at least ${promo.minOrders} orders.`);
      }

      if (promo.minSpent !== undefined && (userProfile.totalSpent || 0) < promo.minSpent) {
        throw new Error(`This promo code requires at least $${promo.minSpent.toFixed(2)} spent.`);
      }

      const discountAmount = promo.discountType === 'percentage' ? total * (promo.discountValue / 100) : promo.discountValue;
      applyPromo(promoId, discountAmount);
      setMessage({ type: 'success', text: `Promo code applied! You saved $${discountAmount.toFixed(2)}` });
      setPromoInput('');
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to apply promo code.' });
      removePromo();
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const initializePayment = async () => {
    if (!userProfile) return;
    if (orderType === 'delivery' && !address.trim()) {
      setMessage({ type: 'error', text: 'Please enter a delivery address' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    // Bypass Stripe if keys are not configured yet (for testing)
    if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
      handleCheckoutSuccess('mock_payment_' + Date.now());
      return;
    }

    setIsCheckingOut(true);
    setMessage(null);
    try {
      // Generate a user-friendly order ID
      const timestamp = Date.now().toString().slice(-4);
      const namePart = userProfile.name?.split(' ')[0].toUpperCase().substring(0, 4) || 'ORD';
      const newOrderId = `${namePart}-${timestamp}`;
      setPendingOrderId(newOrderId);

      const finalTotal = total - discount + restaurantTip + (orderType === 'delivery' ? deliveryTip : 0);

      const orderData = {
        customerId: userProfile.uid,
        customerName: userProfile.name || '',
        customerEmail: userProfile.email || '',
        customerPhone: userProfile.phone || '',
        items: cart,
        status: 'payment_pending',
        total: finalTotal,
        subtotal: total,
        deliveryFee: 0,
        serviceFee: 0,
        restaurantTip,
        deliveryTip: orderType === 'delivery' ? deliveryTip : 0,
        promoCode: promoCode || '',
        discountAmount: discount || 0,
        type: orderType,
        scheduledTime: isScheduled && scheduledDate && scheduledTime ? `${scheduledDate} ${scheduledTime}` : '',
        deliveryAddress: orderType === 'delivery' ? address : '',
        notes: orderNotes,
        paymentStatus: 'pending',
        createdAt: serverTimestamp(),
      };
      
      await setDoc(doc(db, 'orders', newOrderId), orderData);

      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: finalTotal, orderId: newOrderId }),
      });
      
      const data = await response.json();
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setShowPayment(true);
      } else {
        throw new Error(data.error || 'Failed to initialize payment');
      }
    } catch (error) {
      console.error('Payment init error:', error);
      setMessage({ type: 'error', text: 'Payment system is currently unavailable. Please try again later.' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleCheckoutSuccess = async (paymentIntentId: string) => {
    if (!userProfile) return;
    setIsCheckingOut(true);

    try {
      let finalOrderId = pendingOrderId;
      const finalTotal = total - discount + restaurantTip + (orderType === 'delivery' ? deliveryTip : 0);
      
      if (pendingOrderId && import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
        const response = await fetch('/api/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId, orderId: pendingOrderId }),
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to confirm payment');
        }
      } else if (!pendingOrderId) {
        const timestamp = Date.now().toString().slice(-4);
        const namePart = userProfile.name?.split(' ')[0].toUpperCase().substring(0, 4) || 'ORD';
        finalOrderId = `${namePart}-${timestamp}`;
        // For mock payment without pending order
        const orderData = {
          customerId: userProfile.uid,
          customerName: userProfile.name || '',
          customerEmail: userProfile.email || '',
          customerPhone: userProfile.phone || '',
          items: cart,
          status: 'new',
          total: finalTotal,
          subtotal: total,
          deliveryFee: 0,
          serviceFee: 0,
          restaurantTip,
          deliveryTip: orderType === 'delivery' ? deliveryTip : 0,
          promoCode: promoCode || '',
          discountAmount: discount || 0,
          type: orderType,
          scheduledTime: isScheduled && scheduledDate && scheduledTime ? `${scheduledDate} ${scheduledTime}` : '',
          deliveryAddress: orderType === 'delivery' ? address : '',
          notes: orderNotes,
          paymentStatus: 'paid',
          paymentIntentId: paymentIntentId,
          createdAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'orders', finalOrderId), orderData);
      }

      if (!finalOrderId) throw new Error("Order ID missing");

      const batch = writeBatch(db);

      if (pendingOrderId) {
        batch.update(doc(db, 'orders', finalOrderId), {
          status: 'new',
          paymentStatus: 'paid',
          paymentIntentId: paymentIntentId,
          updatedAt: serverTimestamp(),
        });
      }
      
      if (promoCode) {
        batch.update(doc(db, 'promos', promoCode), {
          usedCount: increment(1),
          usedBy: arrayUnion(userProfile.uid)
        });
      }

      batch.update(doc(db, 'users', userProfile.uid), {
        totalOrders: increment(1),
        totalSpent: increment(finalTotal),
        lastOrderDate: serverTimestamp(),
        loyaltyPoints: increment(Math.floor(finalTotal / 10)) // Award 1 point per $10 spent
      });

      await batch.commit();
      
      clearCart();
      navigate('/order-success', { state: { orderId: finalOrderId } });
    } catch (error: any) {
      console.error('Checkout error:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to complete checkout. Please try again.' });
    } finally {
      setIsCheckingOut(false);
      setShowPayment(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="text-center py-20 sm:py-32 max-w-lg mx-auto">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 border border-gray-100">
          <ShoppingCart className="text-gray-300 w-8 h-8 sm:w-10 sm:h-10" />
        </div>
        <h2 className="text-2xl sm:text-4xl font-extrabold text-black mb-3 sm:mb-4">Your cart is empty</h2>
        <p className="text-gray-500 mb-8 sm:mb-10 text-sm sm:text-lg">Looks like you haven't added any delicious items yet.</p>
        <button onClick={() => navigate('/')} className="bg-primary text-white px-8 py-3.5 sm:py-4 rounded-full font-semibold hover:bg-primary-dark transition-all shadow-md hover:-translate-y-0.5">
          Browse Menu
        </button>
      </div>
    );
  }

  const finalTotal = total - discount + restaurantTip + (orderType === 'delivery' ? deliveryTip : 0);

  return (
    <div className="max-w-5xl mx-auto px-1 sm:px-0">
      <h1 className="text-2xl sm:text-4xl font-extrabold text-black mb-6 sm:mb-10">Your Cart</h1>
      
      {message && (
        <div className={`mb-6 sm:mb-8 p-4 rounded-xl font-medium text-sm sm:text-base ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-10">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {cart.map((item) => (
            <motion.div layout key={item.cartItemId} className="bg-white p-4 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 group">
              <div className="w-full sm:w-auto">
                <h3 className="text-[15px] sm:text-xl font-bold text-black mb-1">{item.name}</h3>
                <p className="text-black font-semibold text-[13px] sm:text-base">${item.price.toFixed(2)}</p>
                {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                  <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-sm text-gray-400">
                    <span className="font-medium text-gray-600">Add-ons:</span>{' '}
                    {item.selectedModifiers.map(a => `${a.name} (+$${a.price.toFixed(2)})`).join(', ')}
                  </div>
                )}
              </div>
              
              <div className="flex items-center w-full sm:w-auto justify-between sm:justify-end gap-4 sm:gap-6">
                <div className="flex items-center bg-gray-50 rounded-full p-1 border border-gray-100">
                  <button disabled={showPayment} onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)} className="p-1.5 bg-white sm:p-2 rounded-full transition-all shadow-sm border border-gray-100/50 disabled:opacity-50">
                    <Minus size={14} className="sm:w-4 sm:h-4 text-gray-600" />
                  </button>
                  <span className="w-6 sm:w-10 text-center font-bold text-black text-sm sm:text-base">{item.quantity}</span>
                  <button disabled={showPayment} onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)} className="p-1.5 bg-white sm:p-2 rounded-full transition-all shadow-sm border border-gray-100/50 disabled:opacity-50">
                    <Plus size={14} className="sm:w-4 sm:h-4 text-gray-600" />
                  </button>
                </div>
                <button disabled={showPayment} onClick={() => removeFromCart(item.cartItemId)} className="text-gray-300 hover:text-red-500 p-2 transition-colors disabled:opacity-50">
                  <Trash2 size={18} className="sm:w-[22px] sm:h-[22px]" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="bg-white p-5 sm:p-8 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 h-fit sticky top-24 sm:top-28">
          <h2 className="text-xl sm:text-2xl font-bold text-black mb-6 sm:mb-8">Order Summary</h2>
          
          <div className="space-y-5 mb-8">
            <div className="flex justify-between text-gray-500 font-medium">
              <span>Subtotal</span>
              <span className="text-black">${total.toFixed(2)}</span>
            </div>
            
            {promoCode && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <div className="flex items-center gap-2">
                  <span>Discount ({promoCode})</span>
                  <button onClick={removePromo} className="text-gray-400 hover:text-red-500 text-xs">Remove</button>
                </div>
                <span>-${discount.toFixed(2)}</span>
              </div>
            )}

            <div className="border-t border-gray-100 pt-5 space-y-3">
              {restaurantTip > 0 && (
                <div className="flex justify-between text-gray-600 text-sm font-medium">
                  <span>Restaurant Tip</span>
                  <span>+${restaurantTip.toFixed(2)}</span>
                </div>
              )}
              {orderType === 'delivery' && deliveryTip > 0 && (
                <div className="flex justify-between text-gray-600 text-sm font-medium">
                  <span>Delivery Tip</span>
                  <span>+${deliveryTip.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xl text-black pt-2">
                <span>Total</span>
                <span>${finalTotal.toFixed(2)}</span>
              </div>
            </div>
            {userProfile && Math.floor(finalTotal / 10) > 0 && (
              <div className="text-sm text-emerald-700 font-medium bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                You will earn {Math.floor(finalTotal / 10)} loyalty points from this order.
              </div>
            )}
          </div>

          {!userProfile ? (
            <button onClick={() => setIsAuthModalOpen(true)} className="w-full bg-primary text-white py-3.5 sm:py-4 rounded-full font-semibold hover:bg-primary-dark transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2">
              Sign in to Checkout <ArrowRight size={18} />
            </button>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="font-semibold text-black block text-[13px] sm:text-sm">Order Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setOrderType('pickup')}
                    disabled={profile?.isPickupEnabled === false || showPayment}
                    className={`py-2.5 rounded-full border font-semibold transition-colors text-sm ${orderType === 'pickup' ? 'bg-primary border-primary text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    Pickup
                  </button>
                  <button 
                    onClick={() => setOrderType('delivery')}
                    disabled={profile?.isDeliveryEnabled === false || showPayment}
                    className={`py-2.5 rounded-full border font-semibold transition-colors text-sm ${orderType === 'delivery' ? 'bg-primary border-primary text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    Delivery
                  </button>
                </div>
              </div>

              {orderType === 'delivery' && (
                <div className="space-y-2">
                  <label className="font-medium text-black block text-sm">Delivery Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={showPayment}
                    className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none disabled:opacity-50"
                    placeholder="Enter your full delivery address..."
                    required
                  />
                </div>
              )}

              {orderType === 'pickup' && profile?.isSchedulePickupEnabled && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isScheduled}
                      onChange={(e) => setIsScheduled(e.target.checked)}
                      disabled={showPayment}
                      className="w-5 h-5 text-black rounded focus:ring-black disabled:opacity-50"
                    />
                    <span className="font-medium text-black">Schedule for later</span>
                  </label>
                  
                  {isScheduled && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Date</label>
                        <input 
                          type="date" 
                          value={scheduledDate}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          disabled={showPayment}
                          className="w-full border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-black outline-none text-sm disabled:opacity-50"
                          required={isScheduled}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Time</label>
                        <input 
                          type="time" 
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          disabled={showPayment}
                          className="w-full border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-black outline-none text-sm disabled:opacity-50"
                          required={isScheduled}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="font-medium text-black block text-sm">Order Notes & Allergies</label>
                <textarea 
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  disabled={showPayment}
                  className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none resize-none h-24 disabled:opacity-50"
                  placeholder="Add any special requests, allergies, or dietary restrictions..."
                />
              </div>

              {/* Tipping Section */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <div className="space-y-2">
                  <label className="font-medium text-black block text-sm">Restaurant Tip <span className="text-xs text-gray-500 font-normal ml-1">(100% goes to the kitchen & staff)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {[10, 15, 20].map((pct) => (
                      <button
                        key={`rest-${pct}`}
                        disabled={showPayment}
                        onClick={() => setRestaurantTip(Number((total * pct / 100).toFixed(2)))}
                        className={`flex-1 min-w-[60px] py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${restaurantTip === Number((total * pct / 100).toFixed(2)) ? 'bg-[#1A211A] border-[#1A211A] text-white shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {pct}%
                      </button>
                    ))}
                    <button 
                      disabled={showPayment}
                      onClick={() => setRestaurantTip(0)} 
                      className={`flex-1 min-w-[60px] py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${restaurantTip === 0 ? 'bg-gray-200 border-gray-300 text-black shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                    >
                      None
                    </button>
                  </div>
                </div>

                {orderType === 'delivery' && (
                  <div className="space-y-2">
                    <label className="font-medium text-black block text-sm">Delivery Tip <span className="text-xs text-gray-500 font-normal ml-1">(100% goes to your driver)</span></label>
                    <div className="flex flex-wrap gap-2">
                      {[10, 15, 20].map((pct) => (
                        <button
                          key={`del-${pct}`}
                          disabled={showPayment}
                          onClick={() => setDeliveryTip(Number((total * pct / 100).toFixed(2)))}
                          className={`flex-1 min-w-[60px] py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${deliveryTip === Number((total * pct / 100).toFixed(2)) ? 'bg-[#1A211A] border-[#1A211A] text-white shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                        >
                          {pct}%
                        </button>
                      ))}
                      <button 
                        disabled={showPayment}
                        onClick={() => setDeliveryTip(0)} 
                        className={`flex-1 min-w-[60px] py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${deliveryTip === 0 ? 'bg-gray-200 border-gray-300 text-black shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                      >
                        None
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {!showPayment && !promoCode && (
                <div className="space-y-2">
                  <label className="font-medium text-black block text-sm">Promo Code</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      className="flex-1 min-w-0 border border-gray-200 rounded-xl p-2.5 sm:p-3 text-sm focus:ring-2 focus:ring-black focus:border-black outline-none uppercase"
                      placeholder="Enter code"
                    />
                    <button 
                      onClick={handleApplyPromo}
                      disabled={isApplyingPromo || !promoInput.trim()}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 sm:px-4 rounded-xl font-medium text-sm transition-colors disabled:opacity-50 shrink-0 whitespace-nowrap"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}

              <AnimatePresence mode="wait">
                {!showPayment ? (
                  <motion.button 
                    key="checkout-btn"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onClick={initializePayment} 
                    disabled={isCheckingOut || (orderType === 'delivery' && !address.trim()) || profile?.isAcceptingOrders === false}
                    className="w-full bg-primary text-white py-3.5 sm:py-4 rounded-full font-bold hover:bg-primary-dark transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <CreditCard size={18} />
                    {profile?.isAcceptingOrders === false ? 'Not Accepting Orders' : (isCheckingOut ? 'Processing...' : 'Continue to Payment')}
                  </motion.button>
                ) : (
                  <motion.div 
                    key="payment-form"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-4 border-t border-gray-100"
                  >
                    {clientSecret && (
                      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                        <CheckoutForm 
                          amount={finalTotal} 
                          orderId={pendingOrderId}
                          onSuccess={handleCheckoutSuccess} 
                          onCancel={() => setShowPayment(false)} 
                        />
                      </Elements>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
};
