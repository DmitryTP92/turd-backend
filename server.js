const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Stripe = require("stripe");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { formatPhoneNumber } = require("./utils");
const { Expo } = require("expo-server-sdk");

dotenv.config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const expo = new Expo();

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
});

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4242;

// Create Stripe Checkout Session
app.post("/create-checkout-session", async (req, res) => {
  const { priceId } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: "https://turd-backend.onrender.com/success",
      cancel_url: "https://turd-backend.onrender.com/cancel",
    });

    res.json({ sessionUrl: session.url });
  } catch (error) {
    console.error("Stripe session error:", error);
    res.status(500).send("Stripe error");
  }
});

// Stripe Webhook
app.post("/webhook", express.raw({ type: "application/json" }), (request, response) => {
  const sig = request.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook Error:", err.message);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    console.log("Payment successful.");
  }

  response.status(200).send("Received");
});

// Gift TurdCoins
app.post("/gift-turds", async (req, res) => {
  const { senderPhone, recipientPhone, amount } = req.body;

  try {
    const senderId = "user_" + formatPhoneNumber(senderPhone);
    const recipientId = "user_" + formatPhoneNumber(recipientPhone);

    const senderRef = db.collection("users").doc(senderId);
    const recipientRef = db.collection("users").doc(recipientId);

    const senderSnap = await senderRef.get();
    if (!senderSnap.exists) throw new Error("Sender not found");

    const senderData = senderSnap.data();
    if (!senderData.isUnlimited && senderData.turdCoins < amount) throw new Error("Insufficient balance");

    if (!senderData.isUnlimited) {
      await senderRef.update({ turdCoins: senderData.turdCoins - amount });
    }

    const recipientSnap = await recipientRef.get();
    if (recipientSnap.exists) {
      const recipientData = recipientSnap.data();
      await recipientRef.update({ turdCoins: (recipientData.turdCoins || 0) + amount });
    } else {
      await recipientRef.set({ turdCoins: amount, isUnlimited: false });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Gift error:", error);
    res.status(200).json({ success: false, message: error.message });
  }
});

// Save push token
app.post("/register", async (req, res) => {
  const { userId, token } = req.body;
  try {
    await db.collection("users").doc(userId).update({ pushToken: token });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Save push token error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Send in-app turd
app.post("/inapp-send", async (req, res) => {
  const { senderPhone, to, gif, message } = req.body;
  try {
    await db.collection("turdMessages").add({
      to,
      gif,
      message,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const senderId = "user_" + formatPhoneNumber(senderPhone);
    const senderRef = db.collection("users").doc(senderId);
    const senderSnap = await senderRef.get();

    if (senderSnap.exists) {
      const senderData = senderSnap.data();
      if (!senderData.isUnlimited) {
        let baseCost = 0;

        const gifFilename = gif.split("/").pop();
        switch (gifFilename) {
          case "Happy_Turd.gif":
          case "Angry_Turd.gif":
            baseCost = 0;
            break;
          case "Exploding_Turd.gif":
          case "Unicorn_Turd.gif":
            baseCost = 20;
            break;
          case "Golden_Turd.gif":
            baseCost = 25;
            break;
          default:
            baseCost = 0;
        }

        const wordCount = message ? message.trim().split(/\s+/).length : 0;
        const extraWords = Math.max(0, wordCount - 5);
        const extraCost = extraWords * 1;

        const totalCost = baseCost + extraCost;
        const newBalance = Math.max(0, (senderData.turdCoins || 0) - totalCost);

        await senderRef.update({ turdCoins: newBalance });
      }
    }

    const recipientRef = db.collection("users").doc("user_" + formatPhoneNumber(to));
    const recipientSnap = await recipientRef.get();
    if (recipientSnap.exists) {
      const recipientData = recipientSnap.data();
      const pushToken = recipientData.pushToken;

      if (pushToken && Expo.isExpoPushToken(pushToken)) {
        await expo.sendPushNotificationsAsync([
          {
            to: pushToken,
            sound: "ringtone.mp3",
            title: "Incoming Turd!",
            body: "Someone sent you a Turd 💩",
            data: { screen: "ReceivedTurd" },
          },
        ]);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("In-app send error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get received turd
app.post("/get-received-turd", async (req, res) => {
  const { phoneNumber } = req.body;
  try {
    const turdsRef = db.collection("turdMessages");
    const snapshot = await turdsRef.where("to", "==", phoneNumber).orderBy("sentAt", "asc").limit(1).get();

    if (snapshot.empty) {
      return res.status(200).json(null);
    }

    const doc = snapshot.docs[0];
    const turdData = doc.data();

    await doc.ref.delete();
    res.status(200).json(turdData);
  } catch (error) {
    console.error("Get/Delete turd error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
