import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  addDoc
} from "firebase/firestore";

const USERS_COLLECTION = "users";

const TURD_PRICING = {
  "Happy_Turd.gif": 0,
  "Angry_Turd.gif": 0,
  "Unicorn_Turd.gif": 20,
  "Exploding_Turd.gif": 20,
  "Golden_Turd.gif": 25,
};

const BASE_GIF_URL = "https://cdn.turdogramme.com/turds/";

const calculateTurdCost = (gif, message) => {
  const baseCost = TURD_PRICING[gif] || 0;
  const wordCount = message.trim().split(/\s+/).length;
  const extraCost = Math.max(0, wordCount - 5);
  return baseCost + extraCost;
};

// 📞 Sanitize phone number to E.164-like format
const formatPhoneNumber = (number) => {
  const cleaned = number.replace(/[\s\-()]/g, "");
  if (!cleaned.startsWith("+")) {
    return "+" + cleaned.replace(/^0+/, "");
  }
  return cleaned;
};

// Create or update user profile with phone number
export const saveUser = async (userId, phoneNumber) => {
  const formattedNumber = formatPhoneNumber(phoneNumber);
  const userRef = doc(db, USERS_COLLECTION, userId);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      turdCoins: 50,
      hasUnlimited: false,
      phoneNumber: formattedNumber,
      createdAt: new Date().toISOString(),
    });
  } else {
    await updateDoc(userRef, { phoneNumber: formattedNumber });
  }
};

// Get user data
export const getUser = async (userId) => {
  const userRef = doc(db, USERS_COLLECTION, userId);
  const snapshot = await getDoc(userRef);
  return snapshot.exists() ? snapshot.data() : null;
};

// Apply unlock code
export const applySecretCode = async (userId, code) => {
  if (code === "1093") {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, { hasUnlimited: true });
    return true;
  }
  return false;
};

// Check if a phone number exists in Firestore
export const doesPhoneNumberExist = async (phoneNumber) => {
  const formatted = formatPhoneNumber(phoneNumber);
  const usersRef = collection(db, USERS_COLLECTION);
  const snapshot = await getDocs(usersRef);
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (data.phoneNumber === formatted) return true;
  }
  return false;
};

// Send a turd in-app via backend
export const sendTurdInApp = async (senderId, recipientNumber, gif, message = "") => {
  try {
    const formattedRecipient = recipientNumber.replace(/[\s\-()]/g, "");

    const response = await fetch("https://turdogramme-backend.onrender.com/inapp-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId,
        recipientNumber: formattedRecipient,
        gif,
        message
      }),
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Failed to send turd.");
    }

    return { success: true };
  } catch (error) {
    console.error("In-app send error:", error);
    return { success: false, message: error.message };
  }
};

export const giftTurdCoins = async (senderPhone, recipientPhone, amount) => {
  try {
    const response = await fetch("https://turdogramme-backend.onrender.com/gift-turds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderPhone, recipientPhone, amount })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unknown error");

    return { success: true, message: data.message };
  } catch (error) {
    console.error("Gift failed:", error.message);
    return { success: false, message: error.message };
  }
};

export const storeReceivedTurd = async (recipientNumber, gifUrl, message = "") => {
  try {
    const formatted = formatPhoneNumber(recipientNumber);
    const recipientRef = doc(db, "received", formatted);
    const turdData = {
      gif: gifUrl,
      message,
      seen: false,
      timestamp: new Date().toISOString(),
    };
    await setDoc(recipientRef, turdData, { merge: true });
    console.log("Turd successfully stored.");
  } catch (error) {
    console.error("Error storing received turd:", error);
  }
};

export const getReceivedTurd = async (recipientNumber) => {
  try {
    const formatted = formatPhoneNumber(recipientNumber);
    const recipientRef = doc(db, "received", formatted);
    const docSnap = await getDoc(recipientRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (!data.seen) {
        await updateDoc(recipientRef, { seen: true });
        return data;
      } else {
        return null;
      }
    } else {
      console.log("No turd found.");
      return null;
    }
  } catch (error) {
    console.error("Error getting received turd:", error);
    return null;
  }
};

export const flushReceivedTurd = async (phoneNumber) => {
  try {
    const formatted = formatPhoneNumber(phoneNumber);
    await deleteDoc(doc(db, "received", formatted));
    console.log("Turd flushed from Firestore.");
  } catch (error) {
    console.error("Error flushing turd:", error);
  }
};

export const saveToMemoryBank = async (phoneNumber, gif, message) => {
  try {
    const formatted = formatPhoneNumber(phoneNumber);
    const memoryRef = collection(db, "memoryBank", formatted, "turds");
    await addDoc(memoryRef, {
      gif,
      message,
      savedAt: new Date().toISOString(),
    });
    console.log("Turd saved to memory bank.");
  } catch (error) {
    console.error("Error saving turd to memory bank:", error);
  }
};

// ✅ NEW: Save Expo Push Token to Firestore
export const savePushToken = async (userId, token) => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      fcmToken: token,
      updatedAt: new Date().toISOString()
    });
    console.log("Expo push token saved.");
  } catch (error) {
    console.error("Error saving push token:", error);
  }
};
