import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MenuItem, PromoCode } from '../types';
import { toCents, roundMoney, parseAmount } from './money';
import {
  computeTotals,
  describeGroupRule,
  priceLines,
  promoDiscountCents,
  promoError,
  resolveSelections,
  selectionsFromModifiers,
  tipCents,
  loyaltyPointsFor,
} from './pricing';

const burger: MenuItem = {
  id: 'burger',
  categoryId: 'mains',
  name: 'Burger',
  basePrice: 10.5,
  active: true,
  modifierGroups: [
    {
      id: 'size',
      name: 'Size',
      required: true,
      minSelection: 1,
      maxSelection: 1,
      modifiers: [
        { id: 'reg', name: 'Regular', price: 0 },
        { id: 'lg', name: 'Large', price: 2.25 },
      ],
    },
    {
      id: 'extras',
      name: 'Extras',
      required: false,
      minSelection: 0,
      maxSelection: 2,
      modifiers: [
        { id: 'cheese', name: 'Cheese', price: 1 },
        { id: 'bacon', name: 'Bacon', price: 1.5 },
        { id: 'egg', name: 'Egg', price: 1.25 },
      ],
    },
  ],
};

const catalog = { items: new Map([[burger.id, burger]]), activeCategoryIds: new Set(['mains']) };

test('money helpers avoid floating point drift', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(roundMoney(19.999), 20);
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount('abc', 5), 5);
  assert.equal(parseAmount('-3'), 0);
});

test('required single-choice group must be selected', () => {
  const r = resolveSelections(burger, []);
  assert.deepEqual(r.errors, ['Please choose size.']);
});

test('max selection is enforced', () => {
  const r = resolveSelections(burger, [
    { groupId: 'size', modifierId: 'reg' },
    { groupId: 'extras', modifierId: 'cheese' },
    { groupId: 'extras', modifierId: 'bacon' },
    { groupId: 'extras', modifierId: 'egg' },
  ]);
  assert.deepEqual(r.errors, ['Choose up to 2 for Extras.']);
});

test('unknown modifiers are rejected and duplicates ignored', () => {
  const r = resolveSelections(burger, [
    { groupId: 'size', modifierId: 'lg' },
    { groupId: 'size', modifierId: 'lg' },
    { groupId: 'extras', modifierId: 'truffle' },
  ]);
  assert.equal(r.modifiers.length, 1);
  assert.deepEqual(r.errors, ['One of your choices is no longer available.']);
});

test('legacy cart modifiers map back to their group', () => {
  const sel = selectionsFromModifiers(burger, [{ id: 'lg', name: 'Large', price: 2.25 }]);
  assert.deepEqual(sel, [{ groupId: 'size', modifierId: 'lg' }]);
});

test('group rule descriptions', () => {
  assert.equal(describeGroupRule(burger.modifierGroups![0]), 'Required · Choose 1');
  assert.equal(describeGroupRule(burger.modifierGroups![1]), 'Optional · Up to 2');
});

test('lines are priced from the catalog, not from the client', () => {
  const { lines, subtotalCents, hasErrors } = priceLines(
    [
      {
        itemId: 'burger',
        quantity: 2,
        selections: [
          { groupId: 'size', modifierId: 'lg' },
          { groupId: 'extras', modifierId: 'bacon' },
        ],
      },
    ],
    catalog,
  );
  assert.equal(hasErrors, false);
  assert.equal(lines[0].unitCents, 1425); // 10.50 + 2.25 + 1.50
  assert.equal(subtotalCents, 2850);
});

test('unavailable, sold out and invalid quantities are flagged', () => {
  const soldOut = { ...burger, id: 'b2', isSoldOut: true };
  const hidden = { ...burger, id: 'b3', active: false };
  const otherCategory = { ...burger, id: 'b4', categoryId: 'hidden' };
  const cat = {
    items: new Map([
      ['burger', burger],
      ['b2', soldOut],
      ['b3', hidden],
      ['b4', otherCategory],
    ]),
    activeCategoryIds: new Set(['mains']),
  };
  const sel = [{ groupId: 'size', modifierId: 'reg' }];
  const { lines, subtotalCents } = priceLines(
    [
      { itemId: 'b2', quantity: 1, selections: sel },
      { itemId: 'b3', quantity: 1, selections: sel },
      { itemId: 'b4', quantity: 1, selections: sel },
      { itemId: 'missing', quantity: 1, selections: [] },
      { itemId: 'burger', quantity: 0, selections: sel },
      { itemId: 'burger', quantity: 1.5, selections: sel },
    ],
    cat,
  );
  assert.deepEqual(
    lines.map((l) => l.status),
    ['sold_out', 'unavailable', 'unavailable', 'unavailable', 'invalid', 'invalid'],
  );
  assert.equal(subtotalCents, 0);
});

test('totals: discount, service fee, tax, delivery fee and tips', () => {
  const t = computeTotals({
    subtotalCents: 4000,
    orderType: 'delivery',
    profile: { deliveryFee: 4.99, taxRate: 8.25, serviceFeePercent: 3, freeDeliveryThreshold: 50 },
    discountCents: 500,
    restaurantTipCents: 600,
    deliveryTipCents: 300,
  });
  assert.equal(t.subtotal, 40);
  assert.equal(t.discount, 5);
  assert.equal(t.serviceFee, 1.05); // 3% of 35
  assert.equal(t.tax, 2.89); // 8.25% of 35 = 2.8875
  assert.equal(t.deliveryFee, 4.99);
  assert.equal(t.freeDeliveryRemaining, 10);
  assert.equal(t.totalCents, 3500 + 105 + 289 + 499 + 600 + 300);
  assert.equal(t.total, 52.93);
});

test('free delivery threshold and pickup ignore delivery fee and delivery tip', () => {
  const free = computeTotals({ subtotalCents: 5000, orderType: 'delivery', profile: { deliveryFee: 3, freeDeliveryThreshold: 50 } });
  assert.equal(free.deliveryFee, 0);
  assert.equal(free.freeDeliveryRemaining, 0);
  const pickup = computeTotals({ subtotalCents: 1000, orderType: 'pickup', profile: { deliveryFee: 3 }, deliveryTipCents: 200 });
  assert.equal(pickup.deliveryFee, 0);
  assert.equal(pickup.deliveryTip, 0);
  assert.equal(pickup.total, 10);
});

test('promotional zero fee waives the service fee', () => {
  const t = computeTotals({ subtotalCents: 1000, orderType: 'pickup', profile: { serviceFeePercent: 10, promotionalZeroFee: true } });
  assert.equal(t.serviceFee, 0);
});

test('minimum order shortfall', () => {
  const t = computeTotals({ subtotalCents: 1250, orderType: 'pickup', profile: { minimumOrder: 15 } });
  assert.equal(t.minimumOrderShortfall, 2.5);
});

test('discount can never exceed the subtotal (no negative totals)', () => {
  assert.equal(promoDiscountCents({ discountType: 'fixed', discountValue: 25 }, 1000), 1000);
  assert.equal(promoDiscountCents({ discountType: 'percentage', discountValue: 150 }, 1000), 1000);
  assert.equal(promoDiscountCents({ discountType: 'percentage', discountValue: 15 }, 1999), 300);
  const t = computeTotals({ subtotalCents: 1000, orderType: 'pickup', profile: {}, discountCents: 5000 });
  assert.equal(t.total, 0);
});

test('tips: percentage of subtotal, fixed amounts, and typo cap', () => {
  assert.equal(tipCents(2000, { percent: 15 }), 300);
  assert.equal(tipCents(2000, { amount: 4.5 }), 450);
  assert.equal(tipCents(2000, { amount: 900 }), 10_000);
  assert.equal(tipCents(2000, null), 0);
});

test('promo validation', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const base: PromoCode = {
    id: 'SAVE5',
    discountType: 'fixed',
    discountValue: 5,
    active: true,
    usedCount: 0,
    usedBy: [],
    createdAt: now,
  };
  const ctx = { uid: 'u1', totalOrders: 0, totalSpent: 0, subtotalCents: 2000, now };
  assert.equal(promoError(base, ctx), null);
  assert.match(promoError({ ...base, active: false }, ctx)!, /no longer active/);
  assert.match(promoError({ ...base, expiresAt: new Date('2026-05-01') }, ctx)!, /expired/);
  assert.match(promoError({ ...base, usageLimit: 3, usedCount: 3 }, ctx)!, /usage limit/);
  assert.match(promoError({ ...base, usedBy: ['u1'] }, ctx)!, /already used/);
  assert.match(promoError({ ...base, assignedTo: ['u2'] }, ctx)!, /not valid for your account/);
  assert.match(promoError({ ...base, minOrders: 2 }, ctx)!, /after 2 orders/);
  assert.match(promoError({ ...base, minSubtotal: 25 }, ctx)!, /Add \$5\.00 more/);
  assert.match(promoError(null, ctx)!, /not valid/);
});

test('loyalty points exclude discounts', () => {
  assert.equal(loyaltyPointsFor(45, 0), 4);
  assert.equal(loyaltyPointsFor(45, 10), 3);
});
