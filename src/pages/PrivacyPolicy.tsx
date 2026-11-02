import React from 'react';
import { motion } from 'motion/react';

export const PrivacyPolicy: React.FC = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8 bg-card rounded-card border border-line"
    >
      <h1 className="text-3xl sm:text-4xl font-extrabold text-ink mb-8">Privacy Policy</h1>
      
      <div className="text-muted space-y-6">
        
        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">1. Information We Collect</h2>
          <p>We collect information you provide directly to us, such as when you create an account, place an order, or contact customer support. This may include your name, email address, phone number, delivery address, and payment information.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li>Process and fulfill your orders</li>
            <li>Communicate with you about your orders and our services</li>
            <li>Improve our application and customer experience</li>
            <li>Protect against fraudulent transactions</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">3. Information Sharing</h2>
          <p>We do not sell your personal information. We may share your information with third-party service providers who assist us in operating our application, conducting our business, or servicing you, such as payment processors and delivery partners.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">4. Data Security</h2>
          <p>We implement reasonable security measures to protect your personal information. However, no method of transmission over the Internet or electronic storage is 100% secure.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">5. Your Rights</h2>
          <p>You have the right to access, correct, or delete your personal information. You can manage your account settings within the application or contact us for assistance.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-ink mt-8 mb-4">6. Contact Us</h2>
          <p>If you have any questions about this Privacy Policy, please contact us through the application's support channels.</p>
        </section>
      </div>
    </motion.div>
  );
};
