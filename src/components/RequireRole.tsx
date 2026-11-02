import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import type { UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './AuthModal';
import { PageSpinner } from './ui';

/** Route guard: renders children only for the given roles. */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { loading, user, userProfile, role } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  if (loading || (user && !userProfile)) return <PageSpinner />;

  if (!userProfile) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl border border-gray-100 shadow-ios p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Team sign-in</h1>
          <p className="text-gray-500 text-sm mb-6">Sign in with your staff account to continue.</p>
          <button onClick={() => setAuthOpen(true)} className="w-full bg-gray-900 text-white py-3 rounded-2xl font-semibold">
            Sign in
          </button>
          <Link to="/" className="block mt-4 text-sm text-gray-500 hover:text-gray-900">
            Back to the menu
          </Link>
        </div>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  if (!role || !roles.includes(role)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl border border-gray-100 shadow-ios p-8 text-center">
          <ShieldAlert className="mx-auto text-amber-500 mb-3" size={36} />
          <h1 className="text-xl font-bold text-gray-900 mb-2">No access</h1>
          <p className="text-gray-500 text-sm mb-6">Your account doesn't have permission to view this page. Ask the owner to update your role.</p>
          <Link to="/" className="inline-block bg-gray-900 text-white px-6 py-3 rounded-2xl font-semibold">
            Back to the menu
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
