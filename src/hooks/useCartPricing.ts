import { useMemo } from 'react';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { priceLines, selectionsFromModifiers, type CartLineInput } from '../lib/pricing';

/**
 * Re-prices the cart against the live menu (prices, availability, sold-out state and
 * modifier rules), using the same code the server runs at checkout.
 */
export function useCartPricing() {
  const { cart } = useCart();
  const { catalog, menuLoading } = useStore();

  return useMemo(() => {
    const inputs: CartLineInput[] = cart.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      selections: selectionsFromModifiers(catalog.items.get(line.itemId), line.selectedModifiers),
      notes: line.prepNotes,
    }));
    const priced = priceLines(inputs, catalog);
    return { ...priced, inputs, ready: !menuLoading };
  }, [cart, catalog, menuLoading]);
}
