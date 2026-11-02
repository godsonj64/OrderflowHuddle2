/**
 * Order pricing rules. This module is the single source of truth for how a basket is
 * priced. The browser uses it to show live totals; server.ts uses the exact same code
 * with data read from Firestore, so the amount charged can never be set by the client.
 *
 * Isomorphic: no DOM, Firebase or Node imports.
 */
import type { MenuItem, Modifier, ModifierGroup, OrderType, PromoCode, RestaurantProfile } from '../types';
import { fromCents, toCents } from './money';
import { toDate } from './dates';

export const MAX_LINE_QUANTITY = 50;
export const MAX_CART_LINES = 50;

export interface ModifierSelection {
  groupId: string;
  modifierId: string;
}

// ---------------------------------------------------------------------------
// Modifier groups
// ---------------------------------------------------------------------------

export interface GroupRule {
  min: number;
  max: number; // Infinity when unlimited
}

export function groupRule(group: ModifierGroup): GroupRule {
  const rawMin = Math.max(0, Math.floor(Number(group.minSelection) || 0));
  const min = group.required ? Math.max(1, rawMin) : rawMin;
  const rawMax = Math.floor(Number(group.maxSelection) || 0);
  const max = rawMax > 0 ? Math.max(rawMax, min) : Infinity;
  return { min, max };
}

/** Human readable rule, e.g. "Required · Choose 1" or "Optional · Up to 3". */
export function describeGroupRule(group: ModifierGroup): string {
  const { min, max } = groupRule(group);
  const prefix = min > 0 ? 'Required' : 'Optional';
  if (max === Infinity) return min > 1 ? `${prefix} · Choose at least ${min}` : `${prefix} · Choose any`;
  if (min === max) return `${prefix} · Choose ${max}`;
  if (min > 0) return `${prefix} · Choose ${min}–${max}`;
  return `${prefix} · Up to ${max}`;
}

export function isSingleChoice(group: ModifierGroup): boolean {
  return groupRule(group).max === 1;
}

export function hasRequiredChoices(item: MenuItem): boolean {
  return (item.modifierGroups || []).some((g) => groupRule(g).min > 0);
}

export interface ResolvedSelection {
  modifiers: Modifier[];
  errors: string[];
}

/** Validates selections against the item's modifier groups and returns priced modifiers. */
export function resolveSelections(item: MenuItem, selections: ModifierSelection[]): ResolvedSelection {
  const groups = item.modifierGroups || [];
  const errors: string[] = [];
  const modifiers: Modifier[] = [];
  const seen = new Set<string>();

  for (const sel of selections || []) {
    const key = `${sel.groupId}::${sel.modifierId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const group = groups.find((g) => g.id === sel.groupId);
    const mod = group?.modifiers.find((m) => m.id === sel.modifierId);
    if (!group || !mod) {
      errors.push('One of your choices is no longer available.');
      continue;
    }
    const resolved: Modifier = {
      id: mod.id,
      name: mod.name,
      price: fromCents(toCents(mod.price)),
      groupId: group.id,
      groupName: group.name,
    };
    if (mod.allergenTags?.length) resolved.allergenTags = mod.allergenTags;
    modifiers.push(resolved);
  }

  for (const group of groups) {
    const { min, max } = groupRule(group);
    const count = modifiers.filter((m) => m.groupId === group.id).length;
    if (count < min) {
      errors.push(min === 1 ? `Please choose ${group.name.toLowerCase()}.` : `Choose at least ${min} for ${group.name}.`);
    }
    if (count > max) errors.push(`Choose up to ${max} for ${group.name}.`);
  }

  return { modifiers, errors: Array.from(new Set(errors)) };
}

/**
 * Older carts stored modifiers without their group. Map them back to a group so they
 * can be validated (first group containing the modifier id wins).
 */
export function selectionsFromModifiers(item: MenuItem | undefined, modifiers: Modifier[] | undefined): ModifierSelection[] {
  const groups = item?.modifierGroups || [];
  const result: ModifierSelection[] = [];
  for (const m of modifiers || []) {
    if (m.groupId) {
      result.push({ groupId: m.groupId, modifierId: m.id });
      continue;
    }
    const group = groups.find((g) => g.modifiers.some((x) => x.id === m.id));
    result.push({ groupId: group?.id || '', modifierId: m.id });
  }
  return result;
}

export function unitPriceCents(item: Pick<MenuItem, 'basePrice'>, modifiers: Modifier[]): number {
  return toCents(item.basePrice) + modifiers.reduce((sum, m) => sum + toCents(m.price), 0);
}

// ---------------------------------------------------------------------------
// Basket lines
// ---------------------------------------------------------------------------

export interface CartLineInput {
  itemId: string;
  quantity: number;
  selections: ModifierSelection[];
  notes?: string;
}

export type LineStatus = 'ok' | 'unavailable' | 'sold_out' | 'invalid';

export interface PricedLine {
  input: CartLineInput;
  item?: MenuItem;
  name: string;
  quantity: number;
  modifiers: Modifier[];
  unitCents: number;
  lineCents: number;
  status: LineStatus;
  errors: string[];
}

export interface Catalog {
  items: Map<string, MenuItem>;
  /** When provided, items in categories outside this set are treated as unavailable. */
  activeCategoryIds?: Set<string>;
}

export function priceLine(input: CartLineInput, catalog: Catalog): PricedLine {
  const item = catalog.items.get(input.itemId);
  const quantity = Number(input.quantity);
  const base: PricedLine = {
    input,
    item,
    name: item?.name || 'Unavailable item',
    quantity: Number.isInteger(quantity) ? quantity : 0,
    modifiers: [],
    unitCents: 0,
    lineCents: 0,
    status: 'ok',
    errors: [],
  };

  const categoryActive = !catalog.activeCategoryIds || (item ? catalog.activeCategoryIds.has(item.categoryId) : false);
  if (!item || !item.active || !categoryActive) {
    return { ...base, status: 'unavailable', errors: ['This item is no longer on the menu.'] };
  }
  if (item.isSoldOut) {
    return { ...base, status: 'sold_out', errors: [`${item.name} is sold out right now.`] };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return { ...base, status: 'invalid', errors: [`Quantity must be between 1 and ${MAX_LINE_QUANTITY}.`] };
  }

  const { modifiers, errors } = resolveSelections(item, input.selections);
  const unitCents = unitPriceCents(item, modifiers);
  return {
    ...base,
    modifiers,
    unitCents,
    lineCents: unitCents * quantity,
    status: errors.length ? 'invalid' : 'ok',
    errors,
  };
}

export function priceLines(inputs: CartLineInput[], catalog: Catalog) {
  const lines = inputs.map((l) => priceLine(l, catalog));
  const subtotalCents = lines.reduce((sum, l) => sum + (l.status === 'ok' ? l.lineCents : 0), 0);
  const itemCount = lines.reduce((sum, l) => sum + (l.status === 'ok' ? l.quantity : 0), 0);
  return { lines, subtotalCents, itemCount, hasErrors: lines.some((l) => l.status !== 'ok') };
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export interface PromoContext {
  uid: string;
  totalOrders: number;
  totalSpent: number;
  subtotalCents: number;
  now: Date;
}

/** Returns a customer-facing error, or null when the promo can be applied. */
export function promoError(promo: PromoCode | null | undefined, ctx: PromoContext): string | null {
  if (!promo) return 'That promo code is not valid.';
  if (!promo.active) return 'This promo code is no longer active.';
  const expires = toDate(promo.expiresAt);
  if (expires && expires.getTime() < ctx.now.getTime()) return 'This promo code has expired.';
  if (promo.usageLimit && (promo.usedCount || 0) >= promo.usageLimit) return 'This promo code has reached its usage limit.';
  if (promo.usedBy?.includes(ctx.uid)) return 'You have already used this promo code.';
  if (promo.assignedTo && promo.assignedTo.length > 0 && !promo.assignedTo.includes(ctx.uid)) {
    return 'This promo code is not valid for your account.';
  }
  if (promo.minOrders && ctx.totalOrders < promo.minOrders) {
    return `This promo code unlocks after ${promo.minOrders} order${promo.minOrders === 1 ? '' : 's'}.`;
  }
  if (promo.minSpent && ctx.totalSpent < promo.minSpent) {
    return `This promo code unlocks after spending $${promo.minSpent.toFixed(2)} with us.`;
  }
  if (promo.minSubtotal && ctx.subtotalCents < toCents(promo.minSubtotal)) {
    return `Add $${fromCents(toCents(promo.minSubtotal) - ctx.subtotalCents).toFixed(2)} more to use this code (minimum $${promo.minSubtotal.toFixed(2)}).`;
  }
  if (!(promo.discountValue > 0)) return 'That promo code is not valid.';
  return null;
}

/** Discount in cents, never more than the subtotal. */
export function promoDiscountCents(promo: Pick<PromoCode, 'discountType' | 'discountValue'> | null | undefined, subtotalCents: number): number {
  if (!promo || subtotalCents <= 0) return 0;
  let cents = 0;
  if (promo.discountType === 'percentage') {
    const pct = Math.min(100, Math.max(0, Number(promo.discountValue) || 0));
    cents = Math.round((subtotalCents * pct) / 100);
  } else {
    cents = toCents(promo.discountValue);
  }
  return Math.max(0, Math.min(cents, subtotalCents));
}

// ---------------------------------------------------------------------------
// Tips
// ---------------------------------------------------------------------------

export interface TipChoice {
  /** Percentage of the subtotal (e.g. 15). */
  percent?: number | null;
  /** Fixed dollar amount (used when percent is null). */
  amount?: number | null;
}

export const TIP_PRESETS = [10, 15, 20];

/** Tip in cents. Capped at the larger of the subtotal or $100 to catch typos. */
export function tipCents(subtotalCents: number, choice: TipChoice | null | undefined): number {
  if (!choice) return 0;
  let cents = 0;
  if (choice.percent !== null && choice.percent !== undefined) {
    const pct = Math.max(0, Math.min(100, Number(choice.percent) || 0));
    cents = Math.round((subtotalCents * pct) / 100);
  } else if (choice.amount !== null && choice.amount !== undefined) {
    cents = Math.max(0, toCents(choice.amount));
  }
  return Math.min(cents, Math.max(subtotalCents, 10_000));
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type PricingProfile = Pick<
  RestaurantProfile,
  'deliveryFee' | 'freeDeliveryThreshold' | 'minimumOrder' | 'serviceFeePercent' | 'promotionalZeroFee' | 'taxRate'
>;

export interface TotalsInput {
  subtotalCents: number;
  orderType: OrderType;
  profile: PricingProfile | null | undefined;
  discountCents?: number;
  restaurantTipCents?: number;
  deliveryTipCents?: number;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  restaurantTip: number;
  deliveryTip: number;
  total: number;
  totalCents: number;
  /** Dollars still needed to reach the minimum order (0 when met). */
  minimumOrderShortfall: number;
  /** Dollars still needed for free delivery; null when there is no free delivery offer. */
  freeDeliveryRemaining: number | null;
}

/**
 * Pricing order:
 *  subtotal − discount                → taxable base
 *  + service fee (% of taxable base, waived during the promotional zero-fee period)
 *  + tax (% of taxable base)
 *  + delivery fee (free above the free-delivery threshold, based on the item subtotal)
 *  + tips
 */
export function computeTotals({
  subtotalCents,
  orderType,
  profile,
  discountCents = 0,
  restaurantTipCents = 0,
  deliveryTipCents = 0,
}: TotalsInput): OrderTotals {
  const p = profile || {};
  const subtotal = Math.max(0, Math.round(subtotalCents));
  const discount = Math.max(0, Math.min(Math.round(discountCents), subtotal));
  const base = subtotal - discount;

  const thresholdCents = toCents(p.freeDeliveryThreshold || 0);
  let delivery = 0;
  let freeDeliveryRemaining: number | null = null;
  if (orderType === 'delivery') {
    delivery = Math.max(0, toCents(p.deliveryFee || 0));
    if (thresholdCents > 0 && delivery > 0) {
      if (subtotal >= thresholdCents) delivery = 0;
      freeDeliveryRemaining = fromCents(Math.max(0, thresholdCents - subtotal));
    }
  }

  const servicePct = p.promotionalZeroFee ? 0 : Math.max(0, Number(p.serviceFeePercent) || 0);
  const service = Math.round((base * servicePct) / 100);
  const taxPct = Math.max(0, Number(p.taxRate) || 0);
  const tax = Math.round((base * taxPct) / 100);
  const restaurantTip = Math.max(0, Math.round(restaurantTipCents));
  const deliveryTip = orderType === 'delivery' ? Math.max(0, Math.round(deliveryTipCents)) : 0;

  const totalCents = base + service + tax + delivery + restaurantTip + deliveryTip;
  const minimumCents = toCents(p.minimumOrder || 0);

  return {
    subtotal: fromCents(subtotal),
    discount: fromCents(discount),
    deliveryFee: fromCents(delivery),
    serviceFee: fromCents(service),
    tax: fromCents(tax),
    restaurantTip: fromCents(restaurantTip),
    deliveryTip: fromCents(deliveryTip),
    total: fromCents(totalCents),
    totalCents,
    minimumOrderShortfall: fromCents(Math.max(0, minimumCents - subtotal)),
    freeDeliveryRemaining,
  };
}

/** Loyalty: 1 point per $10 spent on food (after discounts, excluding tips, tax and fees). */
export function loyaltyPointsFor(subtotal: number, discount = 0): number {
  return Math.max(0, Math.floor((toCents(subtotal) - toCents(discount)) / 1000));
}
