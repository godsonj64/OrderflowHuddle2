import React, { useEffect, useState } from 'react';
import { Lock, Mail, User as UserIcon } from 'lucide-react';
import { authErrorMessage, useAuth } from '../context/AuthContext';
import { Sheet, Spinner } from './ui';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Mode = 'signin' | 'signup' | 'reset';

const inputCls =
  'w-full pl-10 pr-4 py-3 rounded-btn border border-line bg-page text-ink placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-brand outline-none transition';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setNotice('');
      setPassword('');
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

  const title = mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password';
  const subtitle =
    mode === 'signin'
      ? 'Sign in to order, track deliveries and see your rewards.'
      : mode === 'signup'
        ? 'It takes 20 seconds. Then order in a few taps.'
        : "Enter your email and we'll send you a reset link.";

  return (
    <Sheet open={isOpen} onClose={onClose} title={title} size="sm">
      <div className="p-5 sm:p-6 space-y-5">
        <p className="text-sm text-muted -mt-1">{subtitle}</p>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-btn border border-red-100" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-3 bg-emerald-50 text-emerald-800 text-sm rounded-btn border border-emerald-100" role="status">
            {notice}
          </div>
        )}

        {mode !== 'reset' && (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              className="w-full bg-card border border-line text-ink py-3 rounded-btn font-semibold hover:bg-soft transition flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" /> or use email <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
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
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>
          {mode !== 'reset' && (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder={mode === 'signup' ? 'Create a password (6+ characters)' : 'Password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={6}
                required
              />
            </div>
          )}

          {mode === 'signin' && (
            <div className="text-right -mt-1">
              <button type="button" onClick={() => switchMode('reset')} className="text-xs font-semibold text-muted hover:text-ink">
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-on-brand py-3.5 rounded-btn font-bold hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Spinner size={18} />}
            {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button type="button" onClick={() => switchMode('signup')} className="font-bold text-ink hover:underline">
                Create an account
              </button>
            </>
          ) : (
            <>
              {mode === 'signup' ? 'Already have an account? ' : 'Remembered it? '}
              <button type="button" onClick={() => switchMode('signin')} className="font-bold text-ink hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </Sheet>
  );
};
