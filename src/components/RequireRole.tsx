import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { UserRole } from '../types';
import { authErrorMessage, useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { PageSpinner, Spinner } from './ui';

/** Route guard: renders children only for the given roles, with a dedicated OrderFlow Admin Access Portal UI. */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { loading, user, userProfile, role, signInWithEmail, signInWithGoogle, resetPassword, logout } = useAuth();
  const { profile, status } = useStore();

  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (loading || (user && !userProfile)) return <PageSpinner />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await resetPassword(email);
        setNotice('Password reset instructions have been sent to your email.');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const brandName = profile?.name || 'OrderFlow';

  if (!userProfile) {
    return (
      <div className="min-h-[100dvh] bg-[#F8F7F4] text-gray-900 font-sans flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden">
        {/* Subtle architectural top bar */}
        <header className="relative z-10 max-w-6xl w-full mx-auto flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-xl px-3.5 py-2 shadow-2xs transition"
          >
            <ArrowLeft size={15} />
            <span>Back to Storefront</span>
          </Link>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs font-medium text-gray-600 shadow-2xs">
            <span
              className={`w-2 h-2 rounded-full ${
                status.state === 'open' ? 'bg-emerald-500' : status.state === 'paused' ? 'bg-amber-500' : 'bg-red-500'
              }`}
            />
            <span>{status.badge}</span>
          </div>
        </header>

        {/* Centered Admin Access Portal Card */}
        <div className="relative z-10 my-auto py-8 flex items-center justify-center">
          <div className="w-full max-w-[420px] bg-white rounded-3xl border border-gray-200/90 shadow-ios-lg p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-widest text-[#287350]">
                  <ShieldCheck size={14} />
                  <span>Admin Access Portal</span>
                </div>
                <h1 className="font-display text-2xl sm:text-[26px] font-extrabold tracking-tight text-gray-900 leading-tight">
                  {mode === 'signin' ? `${brandName} Workspace` : 'Reset Staff Password'}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                  {mode === 'signin'
                    ? 'Sign in with your authorized team account to manage live orders, kitchen tickets, and store settings.'
                    : 'Enter your staff email address and we will send you a password reset link.'}
                </p>
              </div>
              {profile?.logoUrl ? (
                <img
                  src={profile.logoUrl}
                  alt={brandName}
                  className="w-11 h-11 rounded-2xl object-cover border border-gray-200 shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-[#287350] text-white font-display font-extrabold text-base flex items-center justify-center shrink-0 shadow-xs">
                  {brandName.charAt(0)}
                </div>
              )}
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200/80 text-red-700 text-xs font-semibold leading-relaxed" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-semibold leading-relaxed" role="status">
                {notice}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1.5">Work Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@restaurant.com"
                  autoComplete="email"
                  inputMode="email"
                  required
                  className="w-full px-3.5 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-[#287350] focus:ring-2 focus:ring-[#287350]/15 outline-none transition"
                />
              </div>

              {mode === 'signin' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-800">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setError('');
                        setNotice('');
                      }}
                      className="text-xs font-semibold text-[#287350] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                      className="w-full pl-3.5 pr-10 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-[#287350] focus:ring-2 focus:ring-[#287350]/15 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 transition"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[46px] bg-gray-900 hover:bg-black text-white rounded-xl py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition active:scale-[0.99] disabled:opacity-60"
              >
                {busy ? <Spinner size={16} /> : <Lock size={15} />}
                <span>{mode === 'signin' ? 'Sign in to Admin Portal' : 'Send Reset Link'}</span>
              </button>
            </form>

            {mode === 'reset' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError('');
                  setNotice('');
                }}
                className="w-full text-center text-xs font-bold text-gray-600 hover:text-gray-900 py-1"
              >
                ← Back to staff sign-in
              </button>
            ) : (
              <>
                <div className="flex items-center gap-3 text-[11px] font-medium text-gray-400">
                  <span className="h-px flex-1 bg-gray-200" />
                  <span>OR CONTINUE WITH</span>
                  <span className="h-px flex-1 bg-gray-200" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={busy}
                  className="w-full min-h-[44px] bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-xl py-2.5 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2.5 transition disabled:opacity-60"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>Sign in with Google Workspace</span>
                </button>
              </>
            )}
          </div>
        </div>

        <footer className="relative z-10 text-center text-xs text-gray-400 font-mono">
          OrderFlow Operations Console · Authorized Personnel Only
        </footer>
      </div>
    );
  }

  if (!role || !roles.includes(role)) {
    return (
      <div className="min-h-[100dvh] bg-[#F8F7F4] text-gray-900 font-sans flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-gray-200/90 shadow-ios-lg p-7 sm:p-8 text-center space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center mx-auto">
            <ShieldAlert size={24} />
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-widest text-amber-700">
              Insufficient Permissions
            </span>
            <h1 className="font-display text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
              Staff Role Required
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              Signed in as <span className="font-semibold text-gray-800">{userProfile.email}</span> (
              <span className="font-mono text-xs">{role || 'customer'}</span>). Ask the store owner or administrator to grant your account staff or manager access.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <Link
              to="/"
              className="flex-1 min-h-[44px] bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center transition"
            >
              Back to Storefront
            </Link>
            <button
              type="button"
              onClick={logout}
              className="min-h-[44px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <LogOut size={15} />
              <span>Switch account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

