import React, { useEffect, useState } from 'react';
import { useStripe } from '@stripe/react-stripe-js';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { doc, getDoc, increment, arrayUnion, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

export const OrderSuccess: React.FC = () => {
  const stripe = useStripe();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCart } = useCart();
  const orderId = location.state?.orderId || new URLSearchParams(window.location.search).get('orderId');

  useEffect(() => {
    if (!stripe) {
      return;
    }

    const clientSecret = new URLSearchParams(window.location.search).get(
      'payment_intent_client_secret'
    );

    if (!clientSecret) {
      if (location.state?.orderId) {
        // Direct navigation from Cart after successful payment without redirect
        setStatus('success');
        setMessage('Payment succeeded! Your order is being processed.');
      } else {
        setStatus('failed');
        setMessage('No payment intent found.');
      }
      return;
    }

    stripe.retrievePaymentIntent(clientSecret).then(async ({ paymentIntent }) => {
      switch (paymentIntent?.status) {
        case 'succeeded':
          setStatus('success');
          setMessage('Payment succeeded! Your order is being processed.');
          clearCart();
          if (orderId) {
            try {
              const response = await fetch('/api/confirm-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentIntentId: paymentIntent.id, orderId }),
              });
              
              if (response.ok) {
                const orderRef = doc(db, 'orders', orderId);
                const orderSnap = await getDoc(orderRef);
                
                if (orderSnap.exists()) {
                  const orderData = orderSnap.data();
                  
                  // Only update if it hasn't been updated yet
                  if (orderData.status === 'payment_pending') {
                    const batch = writeBatch(db);

                    batch.update(orderRef, {
                      status: 'new',
                      paymentStatus: 'paid',
                      paymentIntentId: paymentIntent.id,
                      updatedAt: serverTimestamp(),
                    });

                    if (orderData.promoCode) {
                      batch.update(doc(db, 'promos', orderData.promoCode), {
                        usedCount: increment(1),
                        usedBy: arrayUnion(orderData.customerId)
                      });
                    }

                    batch.update(doc(db, 'users', orderData.customerId), {
                      totalOrders: increment(1),
                      totalSpent: increment(orderData.total),
                      lastOrderDate: serverTimestamp()
                    });

                    await batch.commit();
                  }
                }
              } else {
                console.error('Failed to confirm payment on server');
              }
            } catch (error) {
              console.error('Failed to update order status:', error);
            }
          }
          break;
        case 'processing':
          setStatus('loading');
          setMessage('Your payment is processing.');
          break;
        case 'requires_payment_method':
          setStatus('failed');
          setMessage('Your payment was not successful, please try again.');
          break;
        default:
          setStatus('failed');
          setMessage('Something went wrong.');
          break;
      }
    });
  }, [stripe, clearCart]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-ios-lg border border-gray-100 max-w-md w-full text-center">
        {status === 'loading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="animate-spin text-emerald-600 mb-4 sm:mb-6" size={48} />
            <h2 className="text-2xl sm:text-3xl font-bold text-black mb-2 sm:mb-3">Processing Payment</h2>
            <p className="text-gray-500 text-base sm:text-lg">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center">
            <CheckCircle className="text-emerald-500 mb-4 sm:mb-6" size={64} />
            <h2 className="text-2xl sm:text-3xl font-bold text-black mb-2 sm:mb-3">Order Confirmed!</h2>
            <p className="text-gray-500 mb-6 sm:mb-8 text-base sm:text-lg">{message}</p>
            <button
              onClick={() => navigate(orderId ? `/order/${orderId}` : '/')}
              className="bg-primary text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-full font-bold hover:bg-primary-dark transition-all shadow-sm w-full text-sm sm:text-base"
            >
              {orderId ? 'Track Order' : 'Return Home'}
            </button>
          </div>
        )}

        {status === 'failed' && (
          <div className="flex flex-col items-center">
            <XCircle className="text-red-500 mb-4 sm:mb-6" size={64} />
            <h2 className="text-2xl sm:text-3xl font-bold text-black mb-2 sm:mb-3">Payment Failed</h2>
            <p className="text-gray-500 mb-6 sm:mb-8 text-base sm:text-lg">{message}</p>
            <button
              onClick={() => navigate('/cart')}
              className="bg-primary text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-full font-bold hover:bg-primary-dark transition-all shadow-sm w-full text-sm sm:text-base"
            >
              Return to Cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
