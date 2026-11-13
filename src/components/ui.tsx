import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, X } from 'lucide-react';

let scrollLocks = 0;

/** Prevents the page behind a sheet from scrolling (important on phones). */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    scrollLocks += 1;
    if (scrollLocks === 1) document.body.style.overflow = 'hidden';
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = '';
    };
  }, [active]);
}

type Surface = 'store' | 'admin';

const SURFACE = {
  store: { panel: 'bg-card text-ink', line: 'border-line', close: 'bg-soft text-ink hover:opacity-80' },
  admin: { panel: 'bg-white text-gray-900', line: 'border-gray-100', close: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
} as const;

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  surface?: Surface;
  hideHeader?: boolean;
  bodyClassName?: string;
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({ open, onClose, title, children, footer, size = 'md', surface = 'store', hideHeader, bodyClassName = '' }: SheetProps) {
  useBodyScrollLock(open);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const s = SURFACE[surface];
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
        >
          <motion.div
            className="absolute inset-0 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 340 }}
            className={`relative w-full ${width} max-h-[92dvh] flex flex-col ${s.panel} rounded-t-[24px] sm:rounded-[24px] shadow-2xl overflow-hidden`}
          >
            <div className="absolute left-1/2 -translate-x-1/2 top-2 h-1 w-10 rounded-full bg-current opacity-15 sm:hidden z-10" />
            {!hideHeader && (
              <div className={`flex items-center justify-between gap-3 px-5 pt-5 pb-3 border-b ${s.line} shrink-0`}>
                <h2 id={titleId} className="text-lg font-bold truncate">
                  {title}
                </h2>
                <button type="button" onClick={onClose} aria-label="Close" className={`p-2 rounded-full transition ${s.close}`}>
                  <X size={18} />
                </button>
              </div>
            )}
            <div className={`flex-1 overflow-y-auto overscroll-contain ${footer ? '' : 'pb-[env(safe-area-inset-bottom)]'} ${bodyClassName}`}>
              {children}
            </div>
            {footer && <div className={`shrink-0 border-t ${s.line} p-4 pb-[max(1rem,env(safe-area-inset-bottom))]`}>{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function PageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 min-h-[50vh] text-current opacity-60" role="status">
      <Spinner size={30} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

/** iOS-style switch row used across admin settings. */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full flex items-start justify-between gap-4 py-3 text-left disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block font-semibold text-gray-900 text-sm">{label}</span>
        {description && <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</span>}
      </span>
      <span className={`relative shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors ${checked ? 'bg-emerald-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: React.ReactNode;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  surface?: Surface;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  busy,
  surface = 'admin',
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const cancelCls = surface === 'store' ? 'bg-soft text-ink' : 'bg-gray-100 text-gray-700 hover:bg-gray-200';
  const confirmCls = danger
    ? 'bg-red-600 text-white hover:bg-red-700'
    : surface === 'store'
      ? 'bg-brand text-on-brand'
      : 'bg-gray-900 text-white hover:bg-black';
  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      size="sm"
      surface={surface}
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className={`flex-1 py-3 rounded-2xl font-semibold text-sm transition ${cancelCls}`}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-60 ${confirmCls}`}
          >
            {busy && <Spinner size={18} />}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className={`p-5 text-sm leading-relaxed ${surface === 'store' ? 'text-muted' : 'text-gray-600'}`}>
        {message}
        {children}
      </div>
    </Sheet>
  );
}

/** Label + input wrapper for admin forms. */
export function Field({ label, hint, children, className = '' }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-500 mt-1 leading-relaxed">{hint}</span>}
    </label>
  );
}

export const adminInput =
  'w-full border border-gray-200 bg-white rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900/15 focus:border-gray-900 outline-none transition disabled:bg-gray-50 disabled:text-gray-400';

