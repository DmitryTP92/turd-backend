import { db } from "./firebase";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  onSnapshot
} from "firebase/firestore";

// Save a new user or update existing one
export const saveUser = async (userId, phoneNumber) => {
  const userRef = doc(db, "users", userId);
  await setDoc(userRef, {
    phoneNumber,
    turdCoins: 100,
    isUnlimited: false,
    createdAt: serverTimestamp()
  }, { merge: true });
};

// Update user's TurdCoin balance
export const updateUserBalance = async (userId, newBalance) => {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, { turdCoins: newBalance });
};

// Get user data based on phone number
export const getUserData = async (phoneNumber) => {
  const userId = "user_" + phoneNumber;
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  return userSnap.exists() ? userSnap.data() : null;
};

// Send a turd via WhatsApp (deduct TurdCoins if necessary)
export const sendTurd = async (senderPhone, recipientPhone, gifUrl, message) => {
  const senderId = "user_" + senderPhone;
  const senderRef = doc(db, "users", senderId);
  const senderSnap = await getDoc(senderRef);

  if (!senderSnap.exists()) {
    return { success: false, message: "Sender not found." };
  }

  const senderData = senderSnap.data();
  const extraWords = Math.max(0, message.trim().split(/\s+/).length - 5);

  const turdCost =
    gifUrl.includes("Happy_Turd") || gifUrl.includes("Angry_Turd") ? 0 :
    gifUrl.includes("Unicorn_Turd") || gifUrl.includes("Exploding_Turd") ? 20 :
    gifUrl.includes("Golden_Turd") ? 25 : 0;

  const totalCost = turdCost + extraWords;

  if (!senderData.isUnlimited && senderData.turdCoins < totalCost) {
    return { success: false, message: "Not enough TurdCoins." };
  }

  if (!senderData.isUnlimited) {
    await updateDoc(senderRef, {
      turdCoins: senderData.turdCoins - totalCost
    });
  }

  return { success: true };
};

// Send a turd In-App (deduct TurdCoins if necessary)
export const sendTurdInApp = async (senderId, recipientPhone, gifUrl, message) => {
  try {
    const senderRef = doc(db, "users", senderId);
    const senderSnap = await getDoc(senderRef);

    if (!senderSnap.exists()) {
      return { success: false, message: "Sender not found." };
    }

    const senderData = senderSnap.data();
    const extraWords = Math.max(0, message.trim().split(/\s+/).length - 5);

    const turdCost =
      gifUrl.includes("Happy_Turd") || gifUrl.includes("Angry_Turd") ? 0 :
      gifUrl.includes("Unicorn_Turd") || gifUrl.includes("Exploding_Turd") ? 20 :
      gifUrl.includes("Golden_Turd") ? 25 : 0;

    const totalCost = turdCost + extraWords;

    if (!senderData.isUnlimited && senderData.turdCoins < totalCost) {
      return { success: false, message: "Not enough TurdCoins." };
    }

    await addDoc(collection(db, "turdMessages"), {
      to: recipientPhone,
      gif: gifUrl,
      message,
      sentAt: serverTimestamp()
    });

    if (!senderData.isUnlimited) {
      await updateDoc(senderRef, {
        turdCoins: senderData.turdCoins - totalCost
      });
    }

    return { success: true };
  } catch (error) {
    console.error("sendTurdInApp error:", error);
    return { success: false, message: error.message };
  }
};

// Retrieve the latest turd sent to a phone number
export const getReceivedTurd = async (phoneNumber) => {
  const q = query(collection(db, "turdMessages"), where("to", "==", phoneNumber));
  const querySnapshot = await getDocs(q);

  let found = null;
  for (const docSnap of querySnapshot.docs) {
    found = docSnap.data();
    break;
  }

  return found;
};

// Save received turd to user's memory bank
export const saveToMemoryBank = async (phoneNumber, gifUrl, message) => {
  await addDoc(collection(db, "savedTurds"), {
    user: phoneNumber,
    gif: gifUrl,
    message,
    savedAt: serverTimestamp()
  });
};

// Save the device's push notification token
export const savePushToken = async (userId, token) => {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, { pushToken: token });
};

// Format phone numbers safely
export const formatPhoneNumber = (number) => number.replace(/[^0-9+]/g, '');
