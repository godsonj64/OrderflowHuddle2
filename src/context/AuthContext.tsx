import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { isManagerRole, isStaffRole, type UserProfile, type UserRole } from '../types';
import { reportError } from '../utils/errorHandling';

/** Mirrors the bootstrap admin in firestore.rules. */
const BOOTSTRAP_ADMIN_EMAIL = 'godsonj64@gmail.com';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  /** Effective role (the bootstrap admin is always "admin"). */
  role: UserRole | null;
  isStaff: boolean;
  isManager: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateContactInfo: (data: Partial<Pick<UserProfile, 'name' | 'phone' | 'savedAddresses'>>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/weak-password': 'Please use a password with at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/missing-password': 'Please enter your password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled for this store.',
  'auth/unauthorized-domain': 'Sign-in is not enabled for this website address yet. (Owner: add this domain in Firebase Authentication → Settings.)',
  'auth/user-disabled': 'This account has been disabled.',
};

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  return AUTH_ERRORS[code] || 'Something went wrong. Please try again.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const pendingName = useRef<string>('');
  const creatingFor = useRef<string | null>(null);

  useEffect(() => {
    // Surface errors from a redirect-based Google sign-in (used when popups are blocked).
    getRedirectResult(auth).catch((err) => reportError(err, 'auth-redirect', { message: authErrorMessage(err) }));

    let unsubProfile: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      unsubProfile?.();
      unsubProfile = null;
      setUser(currentUser);

      if (!currentUser) {
        setUserProfile(null);
        setLoading(false);
        return;
      }

      const ref = doc(db, 'users', currentUser.uid);
      unsubProfile = onSnapshot(
        ref,
        (snap) => {
          const fromCache = snap.metadata.fromCache;
          if (snap.exists()) {
            setUserProfile(snap.data() as UserProfile);
            setLoading(false);
            return;
          }
          // Only create the profile once we know (from the server) that it does not exist.
          if (fromCache || creatingFor.current === currentUser.uid) return;
          creatingFor.current = currentUser.uid;
          const isBootstrapAdmin = currentUser.email === BOOTSTRAP_ADMIN_EMAIL && currentUser.emailVerified;
          const profile: UserProfile = {
            uid: currentUser.uid,
            email: currentUser.email || '',
            role: isBootstrapAdmin ? 'admin' : 'customer',
            name: (currentUser.displayName || pendingName.current || '').slice(0, 100),
            totalOrders: 0,
            totalSpent: 0,
          };
          setDoc(ref, { ...profile, createdAt: serverTimestamp() })
            .catch((err) => reportError(err, 'create-profile', { toast: false }))
            .finally(() => {
              creatingFor.current = null;
            });
          setUserProfile(profile);
          setLoading(false);
        },
        (err) => {
          reportError(err, 'load-profile', { toast: false });
          setUserProfile(null);
          setLoading(false);
        },
      );
    });

    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') return;
      // In-app browsers (Instagram, TikTok, ...) and some mobile browsers block popups.
      if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), pass);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, pass: string, name: string) => {
    pendingName.current = name.trim();
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    if (name.trim()) {
      await updateProfile(credential.user, { displayName: name.trim() }).catch(() => undefined);
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const updateContactInfo = useCallback(
    async (data: Partial<Pick<UserProfile, 'name' | 'phone' | 'savedAddresses'>>) => {
      if (!user) throw new Error('Please sign in first.');
      await updateDoc(doc(db, 'users', user.uid), data);
    },
    [user],
  );

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      reportError(error, 'logout');
    }
  }, []);

  const value = useMemo<AuthContextType>(() => {
    const isBootstrapAdmin = !!user && user.email === BOOTSTRAP_ADMIN_EMAIL && user.emailVerified;
    const role: UserRole | null = userProfile ? (isBootstrapAdmin ? 'admin' : userProfile.role) : null;
    return {
      user,
      userProfile,
      role,
      isStaff: isStaffRole(role),
      isManager: isManagerRole(role),
      loading,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      resetPassword,
      updateContactInfo,
      logout,
    };
  }, [user, userProfile, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, updateContactInfo, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
