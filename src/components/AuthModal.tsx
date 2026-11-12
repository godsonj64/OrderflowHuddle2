import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Mail } from 'lucide-react';
import { authErrorMessage, useAuth } from '../context/AuthContext';
import { Sheet, Spinner } from './ui';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Mode = 'signin' | 'signup' | 'reset';

const inputCls =
  'w-full px-4 py-3.5 rounded-xl bg-soft/90 border border-transparent text-ink text-sm font-medium placeholder:text-muted/70 focus:bg-card focus:border-brand/40 focus:ring-2 focus:ring-brand/15 outline-none transition';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setNotice('');
      setPassword('');
      setShowPassword(false);
      setLoading(false);
    }
  }, [isOpen]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
        onClose();
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password, name);
        onClose();
      } else {
        await resetPassword(email);
        setNotice('Check your inbox for a link to reset your password.');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  const title =
    mode === 'signin' ? 'Welcome Back' : mode === 'signup' ? 'Sign Up' : 'Forgot Password';
  const subtitle =
    mode === 'signin'
      ? 'Sign in to your account'
      : mode === 'signup'
        ? 'Create account and choose favorite menu'
        : 'Enter your email address to receive a password reset link';

  return (
    <Sheet open={isOpen} onClose={onClose} title={mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'} size="sm">
      <div className="p-5 sm:p-6 space-y-5">
        {mode !== 'signin' && (
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-ink -mb-2 transition"
          >
            <ArrowLeft size={15} /> Back to Sign In
          </button>
        )}

        <div>
          <h2 className="font-display text-2xl font-extrabold text-ink tracking-tight">
            {title}
          </h2>
          <p className="text-xs text-muted mt-1">{subtitle}</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-100" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-100" role="status">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="Your name"
                autoComplete="name"
                maxLength={100}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-ink mb-1.5">Email</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="Your email"
                autoComplete="email"
                inputMode="email"
                required
              />
              {mode === 'reset' && (
                <Mail size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand" />
              )}
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pr-11`}
                  placeholder="Your password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
              </div>
            </div>
          )}

          {mode === 'signin' && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => switchMode('reset')}
                className="text-xs font-bold text-brand hover:underline"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-on-brand py-3.5 rounded-2xl font-bold text-sm hover:opacity-95 active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
          >
            {loading && <Spinner size={18} />}
            {mode === 'signin' ? 'Login' : mode === 'signup' ? 'Register' : 'Continue'}
          </button>
        </form>

        <p className="text-center text-xs text-muted font-medium">
          {mode === 'signin' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-bold text-brand hover:underline"
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              {mode === 'signup' ? 'Have an account? ' : 'Remembered your password? '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-bold text-brand hover:underline"
              >
                Sign In
              </button>
            </>
          )}
        </p>

        {mode !== 'reset' && (
          <>
            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span className="h-px flex-1 bg-line" /> Or with <span className="h-px flex-1 bg-line" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="w-full bg-card border border-line text-ink py-3.5 rounded-2xl text-xs font-bold hover:bg-soft transition flex items-center justify-center gap-2.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </button>
          </>
        )}

        {mode === 'signup' && (
          <p className="text-center text-[11px] text-muted leading-relaxed pt-1">
            By clicking Register, you agree to our{' '}
            <span className="font-bold text-brand">Terms and Data Policy</span>.
          </p>
        )}
      </div>
    </Sheet>
  );
};

