import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../lib/api';

/**
 * Landing page after a redirect-based payment (3-D Secure, bank redirects, ...).
 * The server verifies the payment with Stripe, then we show the order tracker.
 */
export const OrderSuccess: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const { user, loading } = useAuth();
  const [state, setState] = useState<'checking' | 'processing' | 'failed'>('checking');
  const ran = useRef(false);

  const params = new URLSearchParams(location.search);
  const orderId = (location.state as { orderId?: string } | null)?.orderId || params.get('orderId');
  const redirectStatus = params.get('redirect_status');

  useEffect(() => {
    if (loading || ran.current) return;
    if (!orderId) {
      navigate('/', { replace: true });
      return;
    }
    if (!user) return; // wait for the session to be restored after the redirect
    ran.current = true;

    if (redirectStatus === 'failed') {
      setState('failed');
      return;
    }

    api
      .confirmPayment(orderId)
      .then((res) => {
        if (res.paid) {
          try {
            sessionStorage.removeItem('pending_checkout_order');
          } catch {
            // ignore
          }
          clearCart();
          toast.success('Payment received. Thank you!');
          navigate(`/order/${orderId}`, { replace: true, state: { placed: true } });
        } else if (res.stripeStatus === 'processing') {
          setState('processing');
        } else {
          setState('failed');
        }
      })
      .catch(() => setState('failed'));
  }, [loading, user, orderId, redirectStatus, clearCart, navigate]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-card p-8 rounded-card border border-line max-w-md w-full text-center">
        {state === 'checking' && (
          <>
            <Loader2 className="animate-spin mx-auto mb-4 text-brand" size={44} />
            <h1 className="text-2xl font-extrabold mb-2">Confirming your payment…</h1>
            <p className="text-muted">This only takes a moment.</p>
          </>
        )}
        {state === 'processing' && (
          <>
            <CheckCircle className="mx-auto mb-4 text-amber-500" size={52} />
            <h1 className="text-2xl font-extrabold mb-2">Payment processing</h1>
            <p className="text-muted mb-6">Your bank is still processing the payment. We'll start your order as soon as it clears.</p>
            <Link to={`/order/${orderId}`} className="block bg-brand text-on-brand py-3.5 rounded-btn font-bold">
              View order
            </Link>
          </>
        )}
        {state === 'failed' && (
          <>
            <XCircle className="mx-auto mb-4 text-red-500" size={52} />
            <h1 className="text-2xl font-extrabold mb-2">Payment not completed</h1>
            <p className="text-muted mb-6">Your card was not charged. You can try again from your cart.</p>
            <Link to="/cart" className="block bg-brand text-on-brand py-3.5 rounded-btn font-bold">
              Back to cart
            </Link>
          </>
        )}
      </div>
    </div>
  );
};
