import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CartItem, Modifier } from '../types';
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from '../lib/pricing';

const CART_KEY = 'restaurant_cart';
const PROMO_KEY = 'restaurant_promo';

interface CartContextType {
  cart: CartItem[];
  itemCount: number;
  addToCart: (item: Omit<CartItem, 'cartItemId'>) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  replaceCart: (items: Omit<CartItem, 'cartItemId'>[]) => void;
  clearCart: () => void;
  promoCode: string | null;
  setPromoCode: (code: string | null) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
};

/** Identical item + choices + instructions merge into one line. */
export function cartLineKey(itemId: string, modifiers: Modifier[] = [], notes = ''): string {
  const mods = modifiers
    .map((m) => `${m.groupId || ''}:${m.id}`)
    .sort()
    .join(',');
  return `${itemId}|${mods}|${notes.trim().toLowerCase()}`;
}

function sanitize(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const lines = new Map<string, CartItem>();
  for (const item of raw as any[]) {
    if (!item || typeof item.itemId !== 'string') continue;
    const selectedModifiers: Modifier[] = Array.isArray(item.selectedModifiers) ? item.selectedModifiers : [];
    const prepNotes = typeof item.prepNotes === 'string' ? item.prepNotes : '';
    const key = cartLineKey(item.itemId, selectedModifiers, prepNotes);
    const quantity = Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.floor(Number(item.quantity) || 1)));
    const existing = lines.get(key);
    if (existing) {
      existing.quantity = Math.min(MAX_LINE_QUANTITY, existing.quantity + quantity);
    } else {
      lines.set(key, {
        cartItemId: key,
        itemId: item.itemId,
        name: String(item.name || ''),
        price: Number(item.price) || 0,
        quantity,
        selectedModifiers,
        ...(prepNotes ? { prepNotes } : {}),
      });
    }
  }
  return Array.from(lines.values()).slice(0, MAX_CART_LINES);
}

function readCart(): CartItem[] {
  try {
    return sanitize(JSON.parse(localStorage.getItem(CART_KEY) || '[]'));
  } catch {
    return [];
  }
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>(readCart);
  const [promoCode, setPromoCodeState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(PROMO_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // Private mode / storage full: the cart still works for this session.
    }
  }, [cart]);

  // Keep carts in sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_KEY) setCart(readCart());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPromoCode = useCallback((code: string | null) => {
    setPromoCodeState(code);
    try {
      if (code) sessionStorage.setItem(PROMO_KEY, code);
      else sessionStorage.removeItem(PROMO_KEY);
    } catch {
      // ignore
    }
  }, []);

  const addToCart = useCallback((item: Omit<CartItem, 'cartItemId'>) => {
    setCart((prev) => {
      const key = cartLineKey(item.itemId, item.selectedModifiers, item.prepNotes);
      const existing = prev.find((i) => i.cartItemId === key);
      if (existing) {
        return prev.map((i) =>
          i.cartItemId === key ? { ...i, quantity: Math.min(MAX_LINE_QUANTITY, i.quantity + item.quantity), price: item.price, name: item.name } : i,
        );
      }
      if (prev.length >= MAX_CART_LINES) return prev;
      return [...prev, { ...item, cartItemId: key, quantity: Math.min(MAX_LINE_QUANTITY, item.quantity) }];
    });
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.cartItemId !== cartItemId)
        : prev.map((i) => (i.cartItemId === cartItemId ? { ...i, quantity: Math.min(MAX_LINE_QUANTITY, Math.floor(quantity)) } : i)),
    );
  }, []);

  const replaceCart = useCallback((items: Omit<CartItem, 'cartItemId'>[]) => {
    setCart(sanitize(items));
  }, []);

  const clearCart = useCallback(() => {
    setCart((prev) => (prev.length ? [] : prev));
    setPromoCode(null);
  }, [setPromoCode]);

  const value = useMemo<CartContextType>(
    () => ({
      cart,
      itemCount: cart.reduce((sum, i) => sum + i.quantity, 0),
      addToCart,
      removeFromCart,
      updateQuantity,
      replaceCart,
      clearCart,
      promoCode,
      setPromoCode,
    }),
    [cart, addToCart, removeFromCart, updateQuantity, replaceCart, clearCart, promoCode, setPromoCode],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
