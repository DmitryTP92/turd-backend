require("dotenv").config();

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { Expo } = require("expo-server-sdk");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const expo = new Expo();

app.use(cors());
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// 🔐 Firebase Admin Setup
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// 🧼 Utils
const formatPhoneNumber = (num) => {
  const cleaned = num.replace(/[\s\-()]/g, "");
  return cleaned.startsWith("+") ? cleaned : "+" + cleaned.replace(/^0+/, "");
};

// 💩 In-app Turd Sending
app.post("/inapp-send", async (req, res) => {
  const { senderId, recipientNumber, gif, message = "" } = req.body;

  try {
    const formatted = formatPhoneNumber(recipientNumber);
    const recipientId = `user_${formatted}`;
    const recipientRef = db.collection("users").doc(recipientId);
    const recipientSnap = await recipientRef.get();
    if (!recipientSnap.exists) return res.status(400).json({ success: false, message: "Recipient not found." });

    const wordCount = message.trim().split(/\s+/).length;
    const baseCost = {
      "Happy_Turd.gif": 0,
      "Angry_Turd.gif": 0,
      "Unicorn_Turd.gif": 20,
      "Exploding_Turd.gif": 20,
      "Golden_Turd.gif": 25,
    }[gif] || 0;
    const extraCost = Math.max(0, wordCount - 5);
    const totalCost = baseCost + extraCost;

    const senderRef = db.collection("users").doc(senderId);
    const senderSnap = await senderRef.get();
    if (!senderSnap.exists) return res.status(400).json({ success: false, message: "Sender not found." });

    const senderData = senderSnap.data();
    const isUnlimited = senderData.isUnlimited || false;
    if (!isUnlimited && senderData.turdCoins < totalCost) {
      return res.status(400).json({ success: false, message: "Not enough TurdCoins." });
    }

    await db.collection("received").doc(formatted).set({
      gif,
      message,
      seen: false,
      timestamp: new Date().toISOString(),
      _meta: { sender: senderId, anonymous: true }
    }, { merge: true });

    if (!isUnlimited) {
      await senderRef.update({
        turdCoins: admin.firestore.FieldValue.increment(-totalCost)
      });
    }

    const recipientData = recipientSnap.data();
    if (recipientData.fcmToken && Expo.isExpoPushToken(recipientData.fcmToken)) {
      await expo.sendPushNotificationsAsync([{
        to: recipientData.fcmToken,
        sound: "turd_alert.mp3",
        title: "💩 You got turded!",
        body: message || "A mysterious turd has appeared...",
        data: { screen: "ReceivedTurd" },
      }]);
    }

    res.json({ success: true, message: "Turd sent!" });
  } catch (err) {
    console.error("In-app send error:", err);
    res.status(500).json({ success: false, message: "Backend error" });
  }
});

// 🎁 Gift Turds
app.post("/gift-turds", async (req, res) => {
  const { senderPhone, recipientPhone, amount } = req.body;
  const senderId = `user_${formatPhoneNumber(senderPhone)}`;
  const recipientId = `user_${formatPhoneNumber(recipientPhone)}`;

  try {
    const senderRef = db.collection("users").doc(senderId);
    const recipientRef = db.collection("users").doc(recipientId);
    const senderSnap = await senderRef.get();
    const recipientSnap = await recipientRef.get();

    if (!senderSnap.exists || !recipientSnap.exists) return res.status(404).json({ error: "User(s) not found" });

    const senderCoins = senderSnap.data().turdCoins || 0;
    if (senderCoins < amount) return res.status(400).json({ error: "Insufficient coins" });

    await senderRef.update({ turdCoins: admin.firestore.FieldValue.increment(-amount) });
    await recipientRef.update({ turdCoins: admin.firestore.FieldValue.increment(amount) });

    res.json({ success: true });
  } catch (err) {
    console.error("Gift error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 📱 User Registration
app.post("/register", async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: "Phone is required" });

  const formatted = formatPhoneNumber(phoneNumber);
  const userId = `user_${formatted}`;

  try {
    await db.collection("users").doc(userId).set({
      phoneNumber: formatted,
      turdCoins: 100,
      isUnlimited: false,
    }, { merge: true });

    res.json({ success: true, userId });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 💸 Stripe Checkout
app.post("/create-checkout-session", async (req, res) => {
  const { priceId, phoneNumber } = req.body;

  try {
    const successUrl = process.env.STRIPE_SUCCESS_URL || "https://turdogramme.com/success";
    const cancelUrl = process.env.STRIPE_CANCEL_URL || "https://turdogramme.com/cancel";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { phoneNumber }
    });
    res.json({ sessionUrl: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

// 🧾 Stripe Webhook
app.post("/webhook", (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const phone = session.metadata?.phoneNumber;
    const amount = session.amount_total / 100;

    let coins = 0;
    if (amount === 1) coins = 50;
    else if (amount === 1.5) coins = 100;
    else if (amount === 2) coins = 300;

    if (phone && coins > 0) {
      const userId = `user_${phone}`;
      db.collection("users").doc(userId).update({
        turdCoins: admin.firestore.FieldValue.increment(coins)
      }).then(() => {
        console.log(`💰 Credited ${coins} coins to ${userId}`);
      }).catch(err => {
        console.error("Failed to update coins:", err);
      });
    }
  }

  res.sendStatus(200);
});

app.listen(4242, () => console.log("🚽 TurdPire backend running on port 4242"));
