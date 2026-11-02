import React, { useMemo, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
// The "pure" entry does not inject Stripe.js until loadStripe() is called, so customers
// who only browse the menu never download it.
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe } from '@stripe/stripe-js';
import { Lock } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatMoney } from '../lib/money';
import { Sheet, Spinner } from './ui';

let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!stripePromise) stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');
  return stripePromise;
}

interface CheckoutFormProps {
  amount: number;
  orderId: string;
  onSuccess: (orderId: string) => void;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({ amount, orderId, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || processing) return;
    setProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'Please check your payment details.');
      setProcessing(false);
      return;
    }

    const returnUrl = new URL('/order-success', window.location.origin);
    returnUrl.searchParams.set('orderId', orderId);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl.toString() },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed. Please try another card.');
      setProcessing(false);
    } else if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      onSuccess(orderId);
    } else {
      setError('Payment needs another step or was not completed. Please try again.');
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        onReady={() => setReady(true)}
        options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }}
      />
      {!ready && (
        <div className="flex justify-center py-6 text-muted">
          <Spinner />
        </div>
      )}
      {error && (
        <div className="text-red-700 text-sm bg-red-50 p-3 rounded-btn border border-red-100" role="alert">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || !ready || processing}
        className="w-full py-4 rounded-btn font-bold bg-brand text-on-brand disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {processing ? <Spinner size={20} /> : <Lock size={16} />}
        {processing ? 'Processing…' : `Pay ${formatMoney(amount)}`}
      </button>
      <p className="text-[11px] text-center text-muted">Payments are processed securely by Stripe. Order #{orderId}</p>
    </form>
  );
};

interface PaymentSheetProps {
  open: boolean;
  clientSecret: string;
  orderId: string;
  amount: number;
  onSuccess: (orderId: string) => void;
  onCancel: () => void;
}

export default function PaymentSheet({ open, clientSecret, orderId, amount, onSuccess, onCancel }: PaymentSheetProps) {
  const { theme } = useStore();
  const options = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: theme.mode === 'dark' ? ('night' as const) : ('stripe' as const),
        variables: { colorPrimary: theme.brandColor, borderRadius: '12px', fontSizeBase: '16px' },
      },
    }),
    [clientSecret, theme.mode, theme.brandColor],
  );

  return (
    <Sheet open={open} onClose={onCancel} title={`Pay ${formatMoney(amount)}`} size="sm">
      <div className="p-5">
        <Elements stripe={getStripePromise()} options={options} key={clientSecret}>
          <CheckoutForm amount={amount} orderId={orderId} onSuccess={onSuccess} />
        </Elements>
      </div>
    </Sheet>
  );
}
