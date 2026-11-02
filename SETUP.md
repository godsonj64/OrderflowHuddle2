# OrderFlow — setup & operations

## How ordering works

Prices are **calculated on the server**. The browser only sends item ids, quantities
and choices to `POST /api/checkout`; the server reads the menu, profile and promo
from Firestore, applies the rules in `src/lib/pricing.ts` (the same code the
storefront uses to display totals) and creates the order. Customers cannot create
orders or mark them paid directly — `firestore.rules` blocks it.

| Step | Card | Cash |
| --- | --- | --- |
| Checkout | Order saved as `payment_pending`, Stripe PaymentIntent created for the server-computed total | Order saved as `new`, `paymentStatus: pending` |
| Payment | Confirmed by the server with Stripe (`/api/orders/:id/confirm-payment` and the webhook) | Staff / driver taps **Mark paid (cash)** (recorded with their name and time) |
| Cancel | Customer (before the kitchen accepts) or staff; **refunded automatically** | Cancelled; staff returns cash if already paid |

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | server | Card payments and refunds. Without it the store can only take cash orders. |
| `VITE_STRIPE_PUBLIC_KEY` | build | Stripe publishable key for the payment form. |
| `STRIPE_WEBHOOK_SECRET` | server | Recommended. Confirms payments even if the customer closes the page, and syncs refunds made in the Stripe dashboard. Point a webhook at `https://<your-domain>/api/stripe/webhook` with `payment_intent.succeeded` and `charge.refunded`. |
| `ADMIN_EMAILS` | server | Optional, comma separated. Bootstrap admin(s); defaults to the address in `firestore.rules`. |
| `PORT` | server | Defaults to 3000. |

The server uses the **Firebase Admin SDK** with Application Default Credentials
(automatic on Cloud Run in the same Google Cloud project). If it cannot reach
Firestore, `/api/health` reports `"firestore": "error"` and the admin dashboard shows
a red banner — checkout will not work until the service account has Firestore access.

## Deploy the security rules

`firestore.rules` changed substantially (server-created orders, staff field
allow-lists, cash payments). Deploy it together with the app, e.g.:

```bash
firebase deploy --only firestore:rules
```

## Owner checklist after deploying

1. **Settings → Hours**: confirm the time zone (pre-filled from your device) and save.
   Opening hours are enforced at checkout.
2. **Settings → Payments**: enable cash and/or card payments.
3. **Settings → Ordering**: delivery fee, free-delivery threshold, minimum order, tax and service fee.
4. **Settings → Appearance**: theme, colors, fonts, layout, banner, announcement bar.
5. **Menu**: add option groups (sizes, extras) and mark best sellers as *Featured*.
6. **Orders / Kitchen**: tap **Sound off** once to enable the new-order chime on that device.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # TypeScript
npm test           # pricing / opening-hours unit tests
npm run test:rules # Firestore security rules in the emulator (needs Java 11+)
```

### Running fully offline against the Firebase emulators

```bash
npx firebase-tools emulators:start --only firestore,auth --project imager-ai-470613
```

Then, in a second terminal:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 VITE_USE_FIREBASE_EMULATORS=true npm run dev
```
