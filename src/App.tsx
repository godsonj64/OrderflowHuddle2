import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Link, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import { CartProvider } from './context/CartContext';
import { Layout } from './components/Layout';
import { AdminLayout } from './components/AdminLayout';
import { RequireRole } from './components/RequireRole';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsent } from './components/CookieConsent';
import { PageSpinner } from './components/ui';
import { Home } from './pages/Home';
import { Cart } from './pages/Cart';
import { OrderTracker } from './pages/OrderTracker';
import { MyOrders } from './pages/MyOrders';
import { OrderSuccess } from './pages/OrderSuccess';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { CookiePolicy } from './pages/CookiePolicy';
import { MANAGER_ROLES, STAFF_ROLES, type UserRole } from './types';

// Admin screens are code-split so customers on phones only download the storefront.
function lazyNamed<T extends Record<string, any>>(loader: () => Promise<T>, name: keyof T) {
  return lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType<any> })));
}
const AdminDashboard = lazyNamed(() => import('./pages/AdminDashboard'), 'AdminDashboard');
const KitchenDashboard = lazyNamed(() => import('./pages/KitchenDashboard'), 'KitchenDashboard');
const AdminMenu = lazyNamed(() => import('./pages/AdminMenu'), 'AdminMenu');
const AdminSettings = lazyNamed(() => import('./pages/AdminSettings'), 'AdminSettings');
const AdminUsers = lazyNamed(() => import('./pages/AdminUsers'), 'AdminUsers');
const AdminPromos = lazyNamed(() => import('./pages/AdminPromos'), 'AdminPromos');
const DriverDashboard = lazyNamed(() => import('./pages/DriverDashboard'), 'DriverDashboard');

const DRIVER_ROLES: UserRole[] = ['driver', ...MANAGER_ROLES];

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="text-center py-24">
      <h1 className="text-3xl font-extrabold mb-2">Page not found</h1>
      <p className="text-muted mb-6">The page you're looking for doesn't exist.</p>
      <Link to="/" className="inline-block bg-brand text-on-brand px-6 py-3 rounded-btn font-semibold">
        Back to the menu
      </Link>
    </div>
  );
}

const admin = (element: React.ReactNode, roles: UserRole[] = STAFF_ROLES) => (
  <RequireRole roles={roles}>
    <Suspense fallback={<PageSpinner />}>{element}</Suspense>
  </RequireRole>
);

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <StoreProvider>
          <CartProvider>
            <Router>
              <ScrollToTop />
              <Toaster
                position="top-center"
                containerStyle={{ top: 'max(12px, env(safe-area-inset-top))' }}
                toastOptions={{ duration: 4000, style: { borderRadius: '16px', background: '#1f2420', color: '#fff', fontSize: '14px' } }}
              />
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="cart" element={<Cart />} />
                  <Route path="order/:orderId" element={<OrderTracker />} />
                  <Route path="my-orders" element={<MyOrders />} />
                  <Route path="order-success" element={<OrderSuccess />} />
                  <Route path="privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="terms-of-service" element={<TermsOfService />} />
                  <Route path="cookie-policy" element={<CookiePolicy />} />
                  <Route path="*" element={<NotFound />} />
                </Route>

                <Route path="/admin" element={admin(<AdminLayout />)}>
                  <Route index element={admin(<AdminDashboard />)} />
                  <Route path="kitchen" element={admin(<KitchenDashboard />)} />
                  <Route path="menu" element={admin(<AdminMenu />, MANAGER_ROLES)} />
                  <Route path="settings" element={admin(<AdminSettings />, MANAGER_ROLES)} />
                  <Route path="users" element={admin(<AdminUsers />, MANAGER_ROLES)} />
                  <Route path="promos" element={admin(<AdminPromos />, MANAGER_ROLES)} />
                </Route>

                <Route path="/driver" element={admin(<AdminLayout />, DRIVER_ROLES)}>
                  <Route index element={admin(<DriverDashboard />, DRIVER_ROLES)} />
                </Route>
              </Routes>
              <CookieConsent />
            </Router>
          </CartProvider>
        </StoreProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
