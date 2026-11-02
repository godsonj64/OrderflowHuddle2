import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order, RestaurantProfile } from '../types';
import { CheckCircle, Clock, Package, Truck, XCircle, Phone, X, Star, Camera } from 'lucide-react';
import { motion } from 'motion/react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import toast from 'react-hot-toast';

export const OrderTracker: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [ratingValue, setRatingValue] = useState<number>(0);
  const [ratingText, setRatingText] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const unsubOrder = onSnapshot(doc(db, 'orders', orderId), (doc) => {
      if (doc.exists()) {
        const newOrder = { id: doc.id, ...doc.data() } as Order;
        setOrder(newOrder);
        
        // Notify on status change
        if (prevStatusRef.current && prevStatusRef.current !== newOrder.status) {
          const statusMessages: Record<string, string> = {
            'confirmed': 'Your order has been confirmed!',
            'preparing': 'We are preparing your order.',
            'ready': 'Your order is ready for pickup!',
            'out_for_delivery': 'Your order is out for delivery!',
            'completed': 'Your order is completed. Enjoy!',
            'cancelled': 'Your order has been cancelled.'
          };
          
          if (statusMessages[newOrder.status]) {
            toast.success(statusMessages[newOrder.status], {
              icon: newOrder.status === 'cancelled' ? '❌' : '✅',
            });
          }
        }
        prevStatusRef.current = newOrder.status;
      } else {
        setOrder(null);
      }
      setLoadingOrder(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, `orders/${orderId}`));

    const unsubProfile = onSnapshot(doc(db, 'restaurant', 'profile'), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as RestaurantProfile);
      }
      setLoadingProfile(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'restaurant/profile'));

    return () => {
      unsubOrder();
      unsubProfile();
    };
  }, [orderId]);

  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleCancelOrder = async () => {
    setShowCancelModal(true);
  };

  const confirmCancelOrder = async () => {
    if (!order || !orderId) return;
    
    setCancelling(true);
    setShowCancelModal(false);
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: 'cancelled' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    } finally {
      setCancelling(false);
    }
  };

  const handleUpdateRating = async () => {
    if (!order || !orderId || ratingValue === 0) return;
    setSubmittingRating(true);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        rating: ratingValue,
        ratingComment: ratingText,
      });
      // We can also update restaurant profile average rating here if we want!
      toast.success('Thank you for your rating!');
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loadingOrder || loadingProfile) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-black mb-4">Order not found</h2>
        <Link to="/" className="text-black font-medium hover:underline">Return to Menu</Link>
      </div>
    );
  }

  const statusSteps = [
    { key: 'new', label: 'Order Placed', icon: Clock },
    { key: 'confirmed', label: 'Confirmed', icon: CheckCircle },
    { key: 'preparing', label: 'Preparing', icon: Package },
    { key: order.type === 'delivery' ? 'out_for_delivery' : 'ready', label: order.type === 'delivery' ? 'Out for Delivery' : 'Ready for Pickup', icon: Truck },
    { key: 'completed', label: 'Completed', icon: CheckCircle },
  ];

  const currentStepIndex = statusSteps.findIndex(s => s.key === order.status);
  const isCancelled = order.status === 'cancelled';
  const canCancel = order.status === 'new' || order.status === 'confirmed';
  const isPreparingOrLater = ['preparing', 'ready', 'out_for_delivery', 'completed'].includes(order.status);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-[2rem] shadow-ios-sm border border-gray-100 p-6 sm:p-10">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-4xl font-bold text-black mb-2 sm:mb-3">Order #{order.id.slice(-6).toUpperCase()}</h1>
          <p className="text-gray-500 text-sm sm:text-lg mb-1">
            {order.type === 'delivery' ? 'Delivery to ' + order.deliveryAddress : 'Pickup Order'}
          </p>
          {order.scheduledTime && (
            <p className="text-emerald-600 font-medium text-sm sm:text-base mb-4">
              📅 Scheduled for: {order.scheduledTime}
            </p>
          )}
          
          {!isCancelled && (
            <div className="flex justify-center gap-4 mt-4">
              {canCancel && (
                <button
                  onClick={handleCancelOrder}
                  disabled={cancelling}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-full font-medium transition-colors disabled:opacity-50"
                >
                  <X size={18} />
                  {cancelling ? 'Cancelling...' : 'Cancel Order'}
                </button>
              )}
              {isPreparingOrLater && profile?.phone && (
                <a
                  href={`tel:${profile.phone}`}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-full font-medium transition-colors"
                >
                  <Phone size={18} />
                  Call Restaurant
                </a>
              )}
            </div>
          )}
        </div>

        {isCancelled ? (
          <div className="bg-red-50 text-red-700 p-4 sm:p-6 rounded-2xl flex items-center gap-3 sm:gap-4 mb-8 sm:mb-12">
            <XCircle size={24} className="sm:w-8 sm:h-8 shrink-0" />
            <div>
              <h3 className="font-bold text-base sm:text-lg">Order Cancelled</h3>
              <p className="text-sm sm:text-base">This order has been cancelled. Please contact the restaurant for details.</p>
            </div>
          </div>
        ) : (
          <>
            {order.type === 'delivery' && order.driverName && order.status !== 'completed' && (
              <div className="bg-emerald-50 text-emerald-800 p-4 sm:p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 sm:mb-12 border border-emerald-100">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                    <Truck size={20} className="sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-emerald-900">Driver Assigned: {order.driverName}</h3>
                    <p className="text-xs sm:text-sm font-medium mt-0.5">
                      {order.deliveryStatus === 'picked_up' ? 'Heading to your location' : 'Heading to restaurant to pick up your order'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="relative mb-12 sm:mb-16">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-100 rounded-2xl hidden sm:block"></div>
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-all duration-500 ease-in-out hidden sm:block"
              style={{ width: `${Math.max(0, (currentStepIndex / (statusSteps.length - 1)) * 100)}%` }}
            ></div>
            
            <div className="relative flex flex-col sm:flex-row justify-between gap-6 sm:gap-0">
              {statusSteps.map((step, index) => {
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const Icon = step.icon;
                
                return (
                  <div key={step.key} className="flex sm:flex-col items-center gap-4 sm:gap-3 relative">
                    {/* Mobile vertical line */}
                    {index !== statusSteps.length - 1 && (
                      <div className="absolute left-5 top-10 bottom-[-24px] w-0.5 bg-gray-100 sm:hidden"></div>
                    )}
                    {index !== statusSteps.length - 1 && isCompleted && (
                      <div className="absolute left-5 top-10 bottom-[-24px] w-0.5 bg-primary sm:hidden"></div>
                    )}

                    <motion.div 
                      initial={false}
                      animate={{ 
                        scale: isCurrent ? 1.1 : 1,
                        backgroundColor: isCompleted ? 'var(--color-primary)' : '#f3f4f6',
                        color: isCompleted ? '#ffffff' : '#9ca3af',
                        borderColor: isCompleted ? 'var(--color-primary)' : '#e5e7eb'
                      }}
                      className="w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 relative bg-white shrink-0"
                    >
                      <Icon size={18} className="sm:w-5 sm:h-5" />
                    </motion.div>
                    <span className={`text-sm font-medium ${isCompleted ? 'text-black' : 'text-gray-400'}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          </>
        )}

        <div className="border-t border-gray-100 pt-6 sm:pt-8">
          <h3 className="text-lg sm:text-xl font-bold text-black mb-4 sm:mb-6">Order Details</h3>
          <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm sm:text-base">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="bg-gray-100 text-gray-600 font-medium px-2 py-0.5 sm:py-1 rounded text-xs sm:text-sm">
                    {item.quantity}x
                  </span>
                  <span className="font-medium text-black">{item.name}</span>
                </div>
                <span className="text-gray-600 font-medium">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {order.notes && (
            <div className="mb-6 sm:mb-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <h4 className="text-sm font-bold text-black mb-2">Order Notes & Allergies</h4>
              <p className="text-gray-600 text-sm">{order.notes}</p>
            </div>
          )}

          <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-600 border-t border-gray-100 pt-4 sm:pt-6">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-medium">${order.subtotal?.toFixed(2) || order.total.toFixed(2)}</span>
            </div>
            {order.deliveryFee ? (
              <div className="flex justify-between">
                <span>Delivery Fee</span>
                <span className="font-medium">${order.deliveryFee.toFixed(2)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-base sm:text-lg font-bold text-black pt-3 border-t border-gray-100">
              <span>Total</span>
              <span>${order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {order.proofOfDeliveryImage && (
          <div className="border-t border-gray-100 pt-6 sm:pt-8 mt-6 sm:mt-8">
            <h3 className="text-lg sm:text-xl font-bold text-black mb-4 sm:mb-6 flex items-center gap-2">
              <Camera size={20} className="text-primary" />
              Proof of Delivery
            </h3>
            <div className="rounded-3xl overflow-hidden border border-gray-100 shadow-ios-sm aspect-square sm:aspect-auto sm:h-80 w-full max-w-sm bg-gray-50 flex items-center justify-center">
              <img 
                src={order.proofOfDeliveryImage} 
                alt="Proof of Delivery" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {order.status === 'completed' && (
          <div className="border-t border-gray-100 pt-6 sm:pt-8 mt-6 sm:mt-8">
            <h3 className="text-lg sm:text-xl font-bold text-black mb-4 sm:mb-6">How was your order?</h3>
            {order.rating ? (
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={24}
                      className={star <= order.rating! ? "fill-[#F5A623] text-[#F5A623]" : "text-gray-300"}
                    />
                  ))}
                </div>
                {order.ratingComment && (
                  <p className="text-gray-600 text-sm">"{order.ratingComment}"</p>
                )}
                <p className="text-gray-400 text-xs mt-4">Thank you for your feedback!</p>
              </div>
            ) : (
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRatingValue(star)}
                      className="focus:outline-none hover:scale-110 transition-transform"
                    >
                      <Star
                        size={32}
                        className={star <= ratingValue ? "fill-[#F5A623] text-[#F5A623]" : "text-gray-300 hover:text-gray-400"}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  value={ratingText}
                  onChange={(e) => setRatingText(e.target.value)}
                  placeholder="Tell us about your experience... (optional)"
                  className="w-full rounded-xl border-gray-200 shadow-sm focus:border-black focus:ring-black mb-4 resize-none"
                  rows={3}
                />
                <button
                  onClick={handleUpdateRating}
                  disabled={ratingValue === 0 || submittingRating}
                  className="w-full sm:w-auto px-6 py-2.5 bg-black text-white rounded-full font-bold hover:bg-gray-800 disabled:bg-gray-300 transition-colors"
                >
                  {submittingRating ? 'Submitting...' : 'Submit Rating'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-ios-lg">
            <h3 className="text-2xl font-bold text-black mb-4">Cancel Order</h3>
            <p className="text-gray-500 mb-6">
              Are you sure you want to cancel this order? This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-3 rounded-full font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                disabled={cancelling}
              >
                Keep Order
              </button>
              <button
                onClick={confirmCancelOrder}
                className="flex-1 px-4 py-3 rounded-full font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
