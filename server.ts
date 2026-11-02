import express from 'express';
import Stripe from 'stripe';
import path from 'path';
import fs from 'fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase Admin
const firebaseApp = admin.initializeApp({
  projectId: firebaseConfig.projectId
});
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parse JSON bodies
  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  let stripeClient: Stripe | null = null;
  function getStripe(): Stripe {
    if (!stripeClient) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        throw new Error('STRIPE_SECRET_KEY environment variable is required');
      }
      stripeClient = new Stripe(key);
    }
    return stripeClient;
  }

  app.post('/api/create-payment-intent', async (req, res) => {
    try {
      const { amount, orderId, currency = 'usd' } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      const stripe = getStripe();
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        metadata: { orderId },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error('Stripe error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/confirm-payment', async (req, res) => {
    try {
      const { paymentIntentId, orderId } = req.body;
      
      if (!paymentIntentId || !orderId) {
        return res.status(400).json({ error: 'paymentIntentId and orderId are required' });
      }

      const stripe = getStripe();
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status === 'succeeded') {
        if (paymentIntent.metadata.orderId !== orderId) {
          return res.status(400).json({ error: 'Payment intent does not match order' });
        }
        res.json({ success: true, status: 'succeeded', paymentIntentId: paymentIntent.id });
      } else {
        res.status(400).json({ error: 'Payment not successful', status: paymentIntent.status });
      }
    } catch (error: any) {
      console.error('Confirm payment error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/refund', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.split('Bearer ')[1];
      
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!userDoc.exists) {
        return res.status(403).json({ error: 'User not found' });
      }

      const userData = userDoc.data();
      if (!userData || !['admin', 'restaurant_owner', 'manager'].includes(userData.role)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      }

      const { paymentIntentId, amount } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ error: 'paymentIntentId is required' });
      }

      const stripe = getStripe();
      
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
      };
      
      if (amount) {
        refundParams.amount = Math.round(amount * 100);
      }

      const refund = await stripe.refunds.create(refundParams);

      res.json({ success: true, refund });
    } catch (error: any) {
      console.error('Stripe refund error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
