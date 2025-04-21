require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const app = express();
const cors = require('cors');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
  const { priceId } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: 'https://your-success-url.com',
      cancel_url: 'https://your-cancel-url.com',
    });

    res.json({ sessionUrl: session.url });
  } catch (error) {
    console.error("Stripe session creation failed:", error.message);
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
});