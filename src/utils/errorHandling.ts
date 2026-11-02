import toast from 'react-hot-toast';
import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/** Turns Firestore / network errors into messages a restaurant owner or customer can act on. */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const err = error as { code?: string; message?: string } | null;
  const code = err?.code || '';
  const message = err?.message || '';
  if (/maximum allowed size|exceeds the maximum/i.test(message)) {
    return 'This is too large to save. Try fewer or smaller images.';
  }
  switch (code) {
    case 'permission-denied':
      return "You don't have permission to do that.";
    case 'unavailable':
      return 'You appear to be offline. Please check your connection.';
    case 'not-found':
      return 'That record no longer exists.';
    case 'failed-precondition':
      return 'This action is not allowed right now.';
    case 'resource-exhausted':
      return 'Too many requests. Please try again shortly.';
    case 'invalid-argument':
      return 'Some of the data is invalid. Please check your input.';
    case 'unauthenticated':
      return 'Please sign in again.';
  }
  return message && message.length < 200 && !message.startsWith('{') ? message : fallback;
}

/**
 * Logs an error with context and (by default) shows a toast. Unlike the old
 * handleFirestoreError it never throws, so it is safe inside onSnapshot callbacks,
 * where a throw would escape as an uncaught error and leave loading spinners forever.
 */
export function reportError(error: unknown, context: string, options: { toast?: boolean; message?: string } = {}) {
  const { toast: showToast = true, message } = options;
  console.error(`[${context}]`, error, { uid: auth.currentUser?.uid ?? null });
  if (showToast) toast.error(message || friendlyError(error), { id: `err-${context}` });
}

/** @deprecated Use reportError. Kept for backwards compatibility; logs and rethrows. */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  console.error('Firestore Error:', { operationType, path, error, uid: auth.currentUser?.uid ?? null });
  throw new Error(friendlyError(error));
}
