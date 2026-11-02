import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Cart } from './pages/Cart';
import { OrderTracker } from './pages/OrderTracker';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminMenu } from './pages/AdminMenu';
import { AdminSettings } from './pages/AdminSettings';
import { AdminUsers } from './pages/AdminUsers';
import { AdminPromos } from './pages/AdminPromos';
import { KitchenDashboard } from './pages/KitchenDashboard';
import { DriverDashboard } from './pages/DriverDashboard';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { CookiePolicy } from './pages/CookiePolicy';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsent } from './components/CookieConsent';
import { OrderSuccess } from './pages/OrderSuccess';
import { MyOrders } from './pages/MyOrders';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { getDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { Toaster } from 'react-hot-toast';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_placeholder');

export default function App() {
  useEffect(() => {
    async function testConnection() {
      try {
        await getDoc(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <CartProvider>
          <Router>
            <Toaster position="top-center" toastOptions={{ duration: 4000, style: { borderRadius: '16px', background: '#333', color: '#fff' } }} />
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="cart" element={<Cart />} />
                <Route path="order/:orderId" element={<OrderTracker />} />
                <Route path="my-orders" element={<MyOrders />} />
                <Route path="order-success" element={
                  <Elements stripe={stripePromise}>
                    <OrderSuccess />
                  </Elements>
                } />
                <Route path="privacy-policy" element={<PrivacyPolicy />} />
                <Route path="terms-of-service" element={<TermsOfService />} />
                <Route path="cookie-policy" element={<CookiePolicy />} />
                
                {/* Admin Routes */}
                <Route path="admin" element={<AdminDashboard />} />
                <Route path="admin/menu" element={<AdminMenu />} />
                <Route path="admin/settings" element={<AdminSettings />} />
                <Route path="admin/users" element={<AdminUsers />} />
                <Route path="admin/promos" element={<AdminPromos />} />
                <Route path="admin/kitchen" element={<KitchenDashboard />} />
                
                {/* Driver Routes */}
                <Route path="driver" element={<DriverDashboard />} />
              </Route>
            </Routes>
            <CookieConsent />
          </Router>
        </CartProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
