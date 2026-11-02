import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, getDocs, collection, query, where, Timestamp, serverTimestamp, deleteField } from 'firebase/firestore';

const RULES = fs.readFileSync(process.env.RULES_PATH || new URL('../../firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'demo-orderflow',
  firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
});

const now = Timestamp.now();
const baseOrder = (over) => ({
  customerId: 'cust1',
  customerName: 'Cara',
  items: [{ cartItemId: 'L1', itemId: 'burger', name: 'Burger', price: 10, quantity: 1, selectedModifiers: [] }],
  status: 'new',
  total: 10,
  subtotal: 10,
  type: 'pickup',
  createdAt: now,
  ...over,
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const user = (uid, role) => setDoc(doc(db, 'users', uid), { uid, email: `${uid}@example.com`, role, totalOrders: 1, totalSpent: 10, createdAt: now });
  await Promise.all([
    user('admin1', 'admin'),
    user('mgr1', 'manager'),
    user('staff1', 'staff'),
    user('driver1', 'driver'),
    user('cust1', 'customer'),
    user('cust2', 'customer'),
  ]);
  await setDoc(doc(db, 'restaurant', 'profile'), { name: 'Huddle', isAcceptingOrders: true, averageRating: 4.5, totalRatings: 10 });
  await setDoc(doc(db, 'categories', 'mains'), { name: 'Mains', displayOrder: 0, active: true });
  await setDoc(doc(db, 'items', 'burger'), { categoryId: 'mains', name: 'Burger', basePrice: 10, active: true, rating: 4.2, ratingCount: 3, soldCount: 5 });
  await setDoc(doc(db, 'orders', 'CARD01'), baseOrder({ paymentMethod: 'card', paymentStatus: 'paid', paymentIntentId: 'pi_1' }));
  await setDoc(doc(db, 'orders', 'PEND01'), baseOrder({ status: 'payment_pending', paymentMethod: 'card', paymentStatus: 'pending', paymentIntentId: 'pi_2' }));
  await setDoc(doc(db, 'orders', 'CASH01'), baseOrder({ type: 'delivery', deliveryAddress: '1 Main St', paymentMethod: 'cash', paymentStatus: 'pending', status: 'ready' }));
  await setDoc(doc(db, 'orders', 'CASH02'), baseOrder({ paymentMethod: 'cash', paymentStatus: 'pending' }));
  await setDoc(doc(db, 'orders', 'LEGACY'), baseOrder({ paymentStatus: 'paid', paymentIntentId: 'pi_legacy' })); // no paymentMethod field
  await setDoc(doc(db, 'promos', 'SAVE5'), { id: 'SAVE5', discountType: 'fixed', discountValue: 5, active: true, usedCount: 0, usedBy: [], createdAt: now });
});

const as = (uid, extra = {}) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...extra }).firestore();
const anon = env.unauthenticatedContext().firestore();
const customer = as('cust1');
const other = as('cust2');
const staff = as('staff1');
const manager = as('mgr1');
const driver = as('driver1');

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${err?.message?.split('\n')[0]}`);
  }
}

console.log('\nStorefront reads');
await check('anyone can read the menu and profile', async () => {
  await assertSucceeds(getDoc(doc(anon, 'restaurant', 'profile')));
  await assertSucceeds(getDoc(doc(anon, 'items', 'burger')));
  await assertSucceeds(getDocs(collection(anon, 'categories')));
});

console.log('\nOrders: customers');
await check('customers cannot create orders directly (server prices them)', () =>
  assertFails(setDoc(doc(customer, 'orders', 'HACK01'), baseOrder({ total: 0.01, status: 'new', createdAt: serverTimestamp() }))));
await check('customer can read own order', () => assertSucceeds(getDoc(doc(customer, 'orders', 'CARD01'))));
await check('customer cannot read someone else\'s order', () => assertFails(getDoc(doc(other, 'orders', 'CARD01'))));
await check('customer can list own orders (no composite index needed)', () =>
  assertSucceeds(getDocs(query(collection(customer, 'orders'), where('customerId', '==', 'cust1')))));
await check('customer cannot mark a pending order as paid', () =>
  assertFails(updateDoc(doc(customer, 'orders', 'PEND01'), { status: 'new', paymentStatus: 'paid', updatedAt: serverTimestamp() })));
await check('customer cannot cancel directly (refunds happen on the server)', () =>
  assertFails(updateDoc(doc(customer, 'orders', 'CARD01'), { status: 'cancelled' })));

console.log('\nOrders: staff');
await check('staff can move an order through the kitchen', () =>
  assertSucceeds(updateDoc(doc(staff, 'orders', 'CARD01'), { status: 'confirmed', updatedAt: serverTimestamp() })));
await check('staff cannot change the order total', () =>
  assertFails(updateDoc(doc(staff, 'orders', 'CARD01'), { total: 1 })));
await check('staff cannot change items', () =>
  assertFails(updateDoc(doc(staff, 'orders', 'CARD01'), { items: [{ itemId: 'x', name: 'x', price: 0, quantity: 1 }] })));
await check('staff cannot cancel a paid card order without a refund', () =>
  assertFails(updateDoc(doc(staff, 'orders', 'CARD01'), { status: 'cancelled' })));
await check('staff cannot mark a card order as paid / refunded', () =>
  assertFails(updateDoc(doc(staff, 'orders', 'PEND01'), { paymentStatus: 'paid' })));
await check('staff can record a cash payment', () =>
  assertSucceeds(updateDoc(doc(staff, 'orders', 'CASH02'), { paymentStatus: 'paid', paidAt: serverTimestamp(), paymentCollectedBy: 'Sam' })));
await check('staff can undo a mistaken cash payment', () =>
  assertSucceeds(updateDoc(doc(staff, 'orders', 'CASH02'), { paymentStatus: 'pending', paidAt: deleteField(), paymentCollectedBy: deleteField() })));
await check('staff cannot mark cash orders as refunded', () =>
  assertFails(updateDoc(doc(staff, 'orders', 'CASH02'), { paymentStatus: 'refunded' })));
await check('staff can cancel an unpaid cash order', () =>
  assertSucceeds(updateDoc(doc(staff, 'orders', 'CASH02'), { status: 'cancelled', cancelledBy: 'staff' })));
await check('cancelled orders cannot be revived', () =>
  assertFails(updateDoc(doc(staff, 'orders', 'CASH02'), { status: 'new' })));
await check('staff cannot cancel paid legacy orders (no paymentMethod field)', () =>
  assertFails(updateDoc(doc(staff, 'orders', 'LEGACY'), { status: 'cancelled' })));
await check('staff can still progress legacy orders', () =>
  assertSucceeds(updateDoc(doc(staff, 'orders', 'LEGACY'), { status: 'preparing' })));

console.log('\nOrders: drivers');
await check('driver can list delivery orders', () =>
  assertSucceeds(getDocs(query(collection(driver, 'orders'), where('type', '==', 'delivery'), where('status', 'in', ['ready', 'preparing'])))));
await check('driver cannot read pickup orders', () => assertFails(getDoc(doc(driver, 'orders', 'CARD01'))));
await check('driver can claim a delivery', () =>
  assertSucceeds(updateDoc(doc(driver, 'orders', 'CASH01'), { driverId: 'driver1', driverName: 'Dee', deliveryStatus: 'assigned', updatedAt: serverTimestamp() })));
await check('driver can record cash collected', () =>
  assertSucceeds(updateDoc(doc(driver, 'orders', 'CASH01'), { paymentStatus: 'paid', paidAt: serverTimestamp(), paymentCollectedBy: 'Dee' })));
await check('driver cannot change the total', () => assertFails(updateDoc(doc(driver, 'orders', 'CASH01'), { total: 0 })));
await check('driver cannot cancel orders', () => assertFails(updateDoc(doc(driver, 'orders', 'CASH01'), { status: 'cancelled' })));
await check('driver can complete with a large proof-of-delivery photo', () =>
  assertSucceeds(updateDoc(doc(driver, 'orders', 'CASH01'), {
    status: 'completed', deliveryStatus: 'delivered', proofOfDeliveryImage: 'data:image/jpeg;base64,' + 'A'.repeat(400000), updatedAt: serverTimestamp(),
  })));

console.log('\nOrders: payment bypass attempts');
await check('staff cannot push an unpaid checkout to the kitchen', () =>
  assertFails(updateDoc(doc(staff, 'orders', 'PEND01'), { status: 'new' })));
await check('staff cannot add unexpected fields (allowlist)', () =>
  assertFails(updateDoc(doc(staff, 'orders', 'CARD01'), { notes: 'free food please' })));
await check('staff can clean up an abandoned checkout', () =>
  assertSucceeds(updateDoc(doc(staff, 'orders', 'PEND01'), { status: 'cancelled', cancelledBy: 'staff' })));

console.log('\nUsers');
await check('self sign-up as customer with zeroed stats', () =>
  assertSucceeds(setDoc(doc(as('newbie'), 'users', 'newbie'), { uid: 'newbie', email: 'newbie@example.com', role: 'customer', name: 'New', totalOrders: 0, totalSpent: 0, createdAt: serverTimestamp() })));
await check('self sign-up cannot start with fake spend', () =>
  assertFails(setDoc(doc(as('faker'), 'users', 'faker'), { uid: 'faker', email: 'faker@example.com', role: 'customer', totalOrders: 0, totalSpent: 5000 })));
await check('self sign-up cannot be admin', () =>
  assertFails(setDoc(doc(as('sneaky'), 'users', 'sneaky'), { uid: 'sneaky', email: 'sneaky@example.com', role: 'admin' })));
await check('customer can edit name, phone and addresses', () =>
  assertSucceeds(updateDoc(doc(customer, 'users', 'cust1'), { name: 'Cara B', phone: '555-123-4567', savedAddresses: ['1 Main St'] })));
await check('customer cannot inflate totalSpent (promo segmentation)', () =>
  assertFails(updateDoc(doc(customer, 'users', 'cust1'), { totalSpent: 99999 })));
await check('customer cannot give themselves loyalty points', () =>
  assertFails(updateDoc(doc(customer, 'users', 'cust1'), { loyaltyPoints: 500 })));
await check('customer cannot change their role', () => assertFails(updateDoc(doc(customer, 'users', 'cust1'), { role: 'manager' })));
await check('customer cannot read other users', () => assertFails(getDoc(doc(customer, 'users', 'cust2'))));
await check('manager can promote a customer to staff', () => assertSucceeds(updateDoc(doc(manager, 'users', 'cust2'), { role: 'staff' })));
await check('manager cannot create an admin', () => assertFails(updateDoc(doc(manager, 'users', 'cust2'), { role: 'admin' })));

console.log('\nRestaurant profile');
await check('staff can pause ordering', () =>
  assertSucceeds(updateDoc(doc(staff, 'restaurant', 'profile'), { pausedUntil: Timestamp.fromMillis(Date.now() + 900000), estimatedPrepMinutes: 35 })));
await check('staff cannot change store settings', () => assertFails(updateDoc(doc(staff, 'restaurant', 'profile'), { name: 'Hacked' })));
await check('manager can update settings and theme', () =>
  assertSucceeds(updateDoc(doc(manager, 'restaurant', 'profile'), { name: 'Huddle Snack Stop', theme: { preset: 'midnight' }, taxRate: 8.25 })));
await check('manager cannot fake the average rating', () => assertFails(updateDoc(doc(manager, 'restaurant', 'profile'), { averageRating: 5 })));
await check('tax rate must be sane', () => assertFails(updateDoc(doc(manager, 'restaurant', 'profile'), { taxRate: 80 })));
await check('customers cannot change the profile', () => assertFails(updateDoc(doc(customer, 'restaurant', 'profile'), { isAcceptingOrders: false })));

console.log('\nMenu');
await check('staff can mark an item sold out', () => assertSucceeds(updateDoc(doc(staff, 'items', 'burger'), { isSoldOut: true })));
await check('staff cannot change prices', () => assertFails(updateDoc(doc(staff, 'items', 'burger'), { basePrice: 1 })));
await check('manager can edit an item', () => assertSucceeds(updateDoc(doc(manager, 'items', 'burger'), { basePrice: 11.5, isFeatured: true })));
await check('manager cannot fake item ratings', () => assertFails(updateDoc(doc(manager, 'items', 'burger'), { rating: 5 })));
await check('manager cannot create items with fake sales', () =>
  assertFails(setDoc(doc(manager, 'items', 'fries'), { categoryId: 'mains', name: 'Fries', basePrice: 3, active: true, ratingCount: 50 })));
await check('customers cannot edit the menu', () => assertFails(updateDoc(doc(customer, 'items', 'burger'), { basePrice: 0 })));

console.log('\nPromos');
await check('signed-in customers can read promos', () => assertSucceeds(getDoc(doc(customer, 'promos', 'SAVE5'))));
await check('customers cannot mark promos as used', () =>
  assertFails(updateDoc(doc(customer, 'promos', 'SAVE5'), { usedCount: 1, usedBy: ['cust1'] })));
await check('manager can create a promo', () =>
  assertSucceeds(setDoc(doc(manager, 'promos', 'TEN'), { id: 'TEN', discountType: 'percentage', discountValue: 10, active: true, usedCount: 0, usedBy: [], minSubtotal: 20, createdAt: serverTimestamp() })));
await check('percentage promos cannot exceed 100%', () =>
  assertFails(setDoc(doc(manager, 'promos', 'BIG'), { id: 'BIG', discountType: 'percentage', discountValue: 150, active: true, usedCount: 0, usedBy: [], createdAt: serverTimestamp() })));
await check('promo id must match the document id', () =>
  assertFails(setDoc(doc(manager, 'promos', 'AAA'), { id: 'BBB', discountType: 'fixed', discountValue: 5, active: true, usedCount: 0, usedBy: [], createdAt: serverTimestamp() })));

await env.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
