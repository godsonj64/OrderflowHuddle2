import React from 'react';
import { motion } from 'motion/react';

export const CookiePolicy: React.FC = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8 bg-white rounded-[2rem] shadow-ios-sm border border-gray-100"
    >
      <h1 className="text-4xl font-bold text-black mb-8">Cookie Policy</h1>
      
      <div className="prose prose-lg text-gray-600 space-y-6">
        <p>Last updated: {new Date().toLocaleDateString()}</p>
        
        <section>
          <h2 className="text-2xl font-bold text-black mt-8 mb-4">1. What Are Cookies</h2>
          <p>Cookies are small pieces of text sent by your web browser by a website you visit. A cookie file is stored in your web browser and allows the Service or a third-party to recognize you and make your next visit easier and the Service more useful to you.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-black mt-8 mb-4">2. How We Use Cookies</h2>
          <p>When you use and access the Service, we may place a number of cookies files in your web browser. We use cookies for the following purposes:</p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li>To enable certain functions of the Service</li>
            <li>To provide analytics</li>
            <li>To store your preferences</li>
            <li>To enable advertisements delivery, including behavioral advertising</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-black mt-8 mb-4">3. Types of Cookies We Use</h2>
          <p>We use both session and persistent cookies on the Service and we use different types of cookies to run the Service:</p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li><strong>Essential cookies:</strong> We may use essential cookies to authenticate users and prevent fraudulent use of user accounts.</li>
            <li><strong>Preferences cookies:</strong> We may use preferences cookies to remember information that changes the way the Service behaves or looks, such as the "remember me" functionality of a registered user or a user's language preference.</li>
            <li><strong>Analytics cookies:</strong> We may use analytics cookies to track information how the Service is used so that we can make improvements. We may also use analytics cookies to test new advertisements, pages, features or new functionality of the Service to see how our users react to them.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-black mt-8 mb-4">4. Third-Party Cookies</h2>
          <p>In addition to our own cookies, we may also use various third-parties cookies to report usage statistics of the Service, deliver advertisements on and through the Service, and so on.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-black mt-8 mb-4">5. What Are Your Choices Regarding Cookies</h2>
          <p>If you'd like to delete cookies or instruct your web browser to delete or refuse cookies, please visit the help pages of your web browser. Please note, however, that if you delete cookies or refuse to accept them, you might not be able to use all of the features we offer, you may not be able to store your preferences, and some of our pages might not display properly.</p>
        </section>
      </div>
    </motion.div>
  );
};
