require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { Expo } = require("expo-server-sdk");
const expo = new Expo();
const admin = require("firebase-admin");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Parse Firebase credentials from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

app.use(cors());
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
  const { priceId, phoneNumber } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'turdogramme://purchase-success',
      cancel_url: 'turdogramme://purchase-cancel',
      metadata: {
        phoneNumber
      }
    });
    res.json({ sessionUrl: session.url });
  } catch (error) {
    console.error("Stripe session creation failed:", error.message);
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
});

app.post('/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
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
        turdCoins: admin.firestore.FieldValue.increment(coins),
      })
      .then(() => {
        console.log(`💰 Added ${coins} TurdCoins to ${userId}`);
      })
      .catch(err => {
        console.error("🔥 Failed to update TurdCoins:", err);
      });
    }
  }
  res.status(200).send('Webhook received');
});

app.post('/gift-turds', async (req, res) => {
  const { senderPhone, recipientPhone, amount } = req.body;
  if (!senderPhone || !recipientPhone || !amount || amount <= 0) {
    return res.status(400).json({ error: "Missing or invalid data." });
  }
  const senderId = `user_${formatPhoneNumber(senderPhone)}`;
  const recipientId = `user_${formatPhoneNumber(recipientPhone)}`;

  try {
    const senderRef = db.collection("users").doc(senderId);
    const recipientRef = db.collection("users").doc(recipientId);
    const senderSnap = await senderRef.get();
    const recipientSnap = await recipientRef.get();

    if (!senderSnap.exists || !recipientSnap.exists) {
      return res.status(404).json({ error: "Sender or recipient not found." });
    }

    const senderData = senderSnap.data();
    if (senderData.turdCoins < amount) {
      return res.status(400).json({ error: "Insufficient TurdCoins." });
    }

    await senderRef.update({
      turdCoins: admin.firestore.FieldValue.increment(-amount)
    });

    await recipientRef.update({
      turdCoins: admin.firestore.FieldValue.increment(amount)
    });

    await db.collection("transactions").add({
      from: senderId,
      to: recipientId,
      amount,
      timestamp: new Date().toISOString(),
      type: "gift"
    });

    res.status(200).json({ success: true, message: "TurdCoins gifted successfully." });
  } catch (err) {
    console.error("Gift TurdCoins failed:", err);
    res.status(500).json({ error: "Gift transaction failed." });
  }
});

app.post('/register', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required" });
  }
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    const userId = `user_${formattedPhone}`;
    const userRef = db.collection("users").doc(userId);
    await userRef.set({
      phoneNumber: formattedPhone,
      turdCoins: 100,
      isUnlimited: false,
    }, { merge: true });
    console.log("✅ User successfully registered:", userId);
    res.status(200).json({ success: true, userId });
  } catch (err) {
    console.error("Failed to register user:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post('/inapp-send', async (req, res) => {
  const { senderId, recipientNumber, gif, message } = req.body;
  try {
    console.log(`In-app send request: ${senderId} -> ${recipientNumber}, gif: ${gif}, message: ${message}`);
    const formatted = formatPhoneNumber(recipientNumber);
    const recipientId = `user_${formatted}`;
    const recipientRef = db.collection("users").doc(recipientId);
    const recipientSnap = await recipientRef.get();
    if (!recipientSnap.exists) {
      return res.status(400).json({ success: false, message: "Recipient not found." });
    }
    const recipientData = recipientSnap.data();
    await storeReceivedTurd(recipientNumber, gif, message, senderId);
    if (recipientData.expoPushToken && Expo.isExpoPushToken(recipientData.expoPushToken)) {
      await expo.sendPushNotificationsAsync([{
        to: recipientData.expoPushToken,
        sound: "turd_alert.mp3",
        channelId: "turd-channel",
        title: "💩 You got turded!",
        body: message || "A mysterious turd has appeared...",
        data: { screen: "ReceivedTurd" },
        badge: 1
      }]);
      console.log("📲 Push notification sent!");
    } else {
      console.log("⚠️ No valid Expo token found for recipient.");
    }
    res.status(200).json({ success: true, message: "Turd sent successfully in-app!" });
  } catch (error) {
    console.error("Error sending turd:", error);
    res.status(500).json({ success: false, message: "Failed to send turd." });
  }
});

app.post('/whatsapp-send', async (req, res) => {
  const { fromPhone, toPhone, gif, message } = req.body;
  try {
    console.log(`WhatsApp send request: ${fromPhone} -> ${toPhone}, gif: ${gif}, message: ${message}`);
    await sendTurdViaWhatsApp(toPhone, gif, message);
    res.status(200).json({ success: true, message: "Turd sent successfully on WhatsApp!" });
  } catch (error) {
    console.error("Error sending turd on WhatsApp:", error);
    res.status(500).json({ success: false, message: "Failed to send turd on WhatsApp." });
  }
});

const storeReceivedTurd = async (recipientPhoneNumber, gifUrl, message = "", senderId = null) => {
  try {
    const formatted = formatPhoneNumber(recipientPhoneNumber);
    const recipientRef = db.collection("received").doc(formatted);
    const turdData = {
      gif: gifUrl,
      message,
      seen: false,
      timestamp: new Date().toISOString(),
      _meta: {
        sender: senderId,
        anonymous: true
      }
    };
    await recipientRef.set(turdData, { merge: true });
    console.log("Turd successfully stored in Firestore.");
  } catch (error) {
    console.error("Error storing received turd:", error);
  }
};

const formatPhoneNumber = (phoneNumber) => {
  const cleaned = phoneNumber.replace(/[\s\-()]/g, "");
  if (!cleaned.startsWith("+")) {
    return "+" + cleaned.replace(/^0+/, "");
  }
  return cleaned;
};

const sendTurdViaWhatsApp = async (toPhone, gif, message) => {
  const gifUrl = `${BASE_GIF_URL}${gif}`;
  const fullMessage = `${message}\n\n💩 ${gifUrl}`;
  const encodedMessage = encodeURIComponent(fullMessage);
  const whatsappUrl = `https://wa.me/${toPhone}?text=${encodedMessage}`;
  try {
    await fetch(whatsappUrl);
    console.log("Turd sent via WhatsApp successfully.");
  } catch (error) {
    console.error("Error sending turd via WhatsApp:", error);
  }
};

const BASE_GIF_URL = "https://i.postimg.cc/";

app.listen(4242, () => console.log('🚀 Turdpire backend running on port 4242'));
