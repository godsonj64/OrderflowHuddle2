import React from 'react';
import { motion } from 'motion/react';

export const TermsOfService: React.FC = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8 bg-card rounded-card border border-line"
    >
      <h1 className="text-3xl sm:text-4xl font-extrabold text-ink mb-8">Terms of Service</h1>
      
      <div className="text-muted space-y-6">
        
        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">1. Acceptance of Terms</h2>
          <p>By accessing or using our application, you agree to be bound by these Terms of Service. If you do not agree to all the terms and conditions, then you may not access the application or use any services.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">2. User Accounts</h2>
          <p>You are responsible for maintaining the confidentiality of your account and password and for restricting access to your computer or device. You agree to accept responsibility for all activities that occur under your account or password.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">3. Ordering and Payment</h2>
          <p>All orders are subject to availability and confirmation of the order price. We reserve the right to refuse any order you place with us. Prices for our products are subject to change without notice.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">4. Delivery and Pickup</h2>
          <p>Delivery times are estimates and cannot be guaranteed. You are responsible for providing an accurate delivery address. For pickup orders, please ensure you arrive within the specified timeframe.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">5. Cancellations and Refunds</h2>
          <p>Orders can only be cancelled before they are confirmed by the restaurant. Refunds for cancelled orders or issues with the food will be handled on a case-by-case basis according to our refund policy.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">6. Limitation of Liability</h2>
          <p>In no event shall we be liable for any direct, indirect, incidental, special, or consequential damages arising out of or in any way connected with the use of our application or services.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">7. Changes to Terms</h2>
          <p>We reserve the right, at our sole discretion, to update, change or replace any part of these Terms of Service by posting updates and changes to our application. It is your responsibility to check our application periodically for changes.</p>
        </section>
      </div>
    </motion.div>
  );
};
