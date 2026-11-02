import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem } from '../types';

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, 'cartItemId'>) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  promoCode: string | null;
  applyPromo: (code: string, discountAmount: number) => void;
  removePromo: () => void;
  discount: number;
}

const CartContext = createContext<CartContextType>({
  cart: [],
  addToCart: () => {},
  removeFromCart: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  total: 0,
  promoCode: null,
  applyPromo: () => {},
  removePromo: () => {},
  discount: 0,
});

export const useCart = () => useContext(CartContext);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('restaurant_cart');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const uniqueItems = new Map<string, CartItem>();
        
        parsed.forEach((item: any, index: number) => {
          let cartItemId = item.cartItemId;
          if (!cartItemId) {
            const modifiersString = item.selectedModifiers ? item.selectedModifiers.map((m: any) => m.id).sort().join(',') : '';
            cartItemId = `${item.itemId}-${modifiersString}-${index}`;
          }
          
          if (uniqueItems.has(cartItemId)) {
            // If duplicate, just add to quantity
            const existing = uniqueItems.get(cartItemId)!;
            uniqueItems.set(cartItemId, { ...existing, quantity: existing.quantity + (item.quantity || 1) });
          } else {
            uniqueItems.set(cartItemId, { ...item, cartItemId });
          }
        });
        
        return Array.from(uniqueItems.values());
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);

  useEffect(() => {
    localStorage.setItem('restaurant_cart', JSON.stringify(cart));
  }, [cart]);

  const applyPromo = (code: string, discountAmount: number) => {
    setPromoCode(code);
    setDiscount(discountAmount);
  };

  const removePromo = () => {
    setPromoCode(null);
    setDiscount(0);
  };

  const addToCart = (item: Omit<CartItem, 'cartItemId'>) => {
    setCart((prev) => {
      // Create a unique ID based on itemId and selected modifiers
      const modifiersString = item.selectedModifiers ? item.selectedModifiers.map(m => m.id).sort().join(',') : '';
      const cartItemId = `${item.itemId}-${modifiersString}`;

      const existing = prev.find((i) => i.cartItemId === cartItemId);
      if (existing) {
        return prev.map((i) => (i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + item.quantity } : i));
      }
      return [...prev, { ...item, cartItemId }];
    });
  };

  const removeFromCart = (cartItemId: string) => {
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    setCart((prev) => prev.map((i) => (i.cartItemId === cartItemId ? { ...i, quantity } : i)));
  };

  const clearCart = () => setCart([]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, total, promoCode, applyPromo, removePromo, discount }}>
      {children}
    </CartContext.Provider>
  );
};
