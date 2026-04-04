import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    stripeClient = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  }
  return stripeClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Stripe Checkout Endpoint
  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const stripe = getStripe();
      const { userId } = req.body;
      
      const origin = req.headers.origin || `http://localhost:${PORT}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "paypal"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Matic Pro Subscription",
                description: "Unlimited transcriptions and priority support",
              },
              unit_amount: 500, // $5.00
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${origin}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?canceled=true`,
        client_reference_id: userId,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe Checkout Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Verify Session Endpoint
  app.post("/api/verify-session", async (req, res) => {
    try {
      const stripe = getStripe();
      const { sessionId } = req.body;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (session.payment_status === "paid") {
        res.json({ success: true, userId: session.client_reference_id });
      } else {
        res.json({ success: false });
      }
    } catch (error: any) {
      console.error("Stripe Verify Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
