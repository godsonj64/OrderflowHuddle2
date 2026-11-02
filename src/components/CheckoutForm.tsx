import React, { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';

interface CheckoutFormProps {
  amount: number;
  orderId: string | null;
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
}

export const CheckoutForm: React.FC<CheckoutFormProps> = ({ amount, orderId, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'An error occurred.');
      setProcessing(false);
      return;
    }

    const returnUrl = new URL(window.location.origin + '/order-success');
    if (orderId) {
      returnUrl.searchParams.set('orderId', orderId);
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl.toString(),
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed.');
      setProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    } else {
      setError('Payment failed or requires additional action.');
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement options={{ wallets: { applePay: 'never', googlePay: 'never' } }} />
      
      {error && (
        <div className="text-red-500 text-sm bg-red-50 p-3 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="flex-1 px-4 py-3 rounded-2xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className="flex-1 px-4 py-3 rounded-full font-bold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
        >
          {processing ? <Loader2 className="animate-spin" size={20} /> : `Pay $${amount.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
};
