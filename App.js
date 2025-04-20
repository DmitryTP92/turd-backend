import React, { useState, useEffect, useContext, createContext } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  TouchableWithoutFeedback,
  Linking,
  Vibration
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { Picker } from "@react-native-picker/picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { v4 as uuidv4 } from "uuid";
import i18n from "./i18n";

import { db } from "./firebase"; // ✅ Your Firestore instance

// ✅ Modular Firebase Firestore imports
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot
} from "firebase/firestore";

// ✅ All firestoreHelpers grouped
import {
  getReceivedTurd,
  saveUser,
  sendTurd,
  sendTurdInApp,
  flushReceivedTurd,
  saveToMemoryBank,
  savePushToken
} from "./firestoreHelpers";

import { StripeProvider } from "@stripe/stripe-react-native";
import Sound from 'react-native-sound';
import Tts from 'react-native-tts';

import { navigationRef } from "./navigationRef";
import { registerForPushNotificationsAsync } from "./notifications";



// Stripe publishable key
const STRIPE_PUBLISHABLE_KEY = "pk_live_51NwLQgEtcXkw7neRLyoTROeSx4p7vSYagM5a5LGzeWwadg2AmQ8oPBoUAk4kA7iC49wG97r3lEcBQ3LDCUfDpuof00QGwiIRHE";
// Function to play the Turd Alert ringtone
const playTurdAlert = () => {
  const alertSound = new Sound(require('./assets/ringtone.mp3'), (error) => {
    if (error) {
      console.error('Failed to load the sound', error);
      return;
    }
    alertSound.play((success) => {
      if (!success) {
        console.error('Sound playback failed');
      }
    });
  });
};



// Create a Context for User data
const UserContext = createContext();

const Stack = createStackNavigator();

const SentScreen = ({ route, navigation }) => {
  const { selectedGif, message } = route.params || {};
  const randomMessage = TURD_SENT_MESSAGES[Math.floor(Math.random() * TURD_SENT_MESSAGES.length)];

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.navigate("TurdSelection");
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>💩 {randomMessage}</Text>
      {selectedGif && <Image source={{ uri: `https://i.postimg.cc/L4jBdgtR/${selectedGif}` }} style={styles.turdImage} resizeMode="contain" />}
      <Text style={styles.subHeader}>{message}</Text>
    </View>
  );
};
const API_URL = "http://18.171.168.140:3001/send";
const SECRET_CODE = "1093";

const TURD_PRICING = {
  "Happy Turd": 0,
  "Angry Turd": 0,
  "Unicorn Turd": 20,
  "Exploding Turd": 20,
  "Golden Turd": 25,
};

const turds = [
  { name: "Happy Turd", staticImg: require("./assets/Happy_Turd.png"), gif: "Happy_Turd.gif" },
  { name: "Angry Turd", staticImg: require("./assets/Angry_Turd.png"), gif: "Angry_Turd.gif" },
  { name: "Unicorn Turd", staticImg: require("./assets/Unicorn_Turd.png"), gif: "Unicorn_Turd.gif" },
  { name: "Exploding Turd", staticImg: require("./assets/Exploding_Turd.png"), gif: "Exploding_Turd.gif" },
  { name: "Golden Turd", staticImg: require("./assets/Golden_Turd.png"), gif: "Golden_Turd.gif" },
];
const LordTurdingham = require("./assets/Lord_Turdingham.png");

const languages = {
  en: "English",
  ja: "日本語",
  fr: "Français",
  es: "Español",
  ko: "한국어",
};

const UserProvider = ({ children }) => {
  const [userId, setUserId] = useState(null);
  const [turdBalance, setTurdBalance] = useState(50);
  const [isUnlimited, setIsUnlimited] = useState(false);

  useEffect(() => {
    const getOrCreateUserId = async () => {
      let id = await AsyncStorage.getItem('userPhone');
      id = id ? `user_${id}` : null;
      if (!id) {
        id = uuidv4();
        await AsyncStorage.setItem('userId', id);
      }
      setUserId(id);

      // Firestore sync logic
      const userRef = doc(db, "users", id);
      onSnapshot(userRef, (docSnap) => {
  if (docSnap.exists()) {
    const data = docSnap.data();
    setTurdBalance(data.isUnlimited ? 999999 : data.turdCoins || 0);
    setIsUnlimited(data.isUnlimited || false);
  }
});
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          turdCoins: 100,
          isUnlimited: false
        });
      } else {
        const userData = userSnap.data();
        setTurdBalance(userData.turdCoins || 50);
        setIsUnlimited(userData.isUnlimited || false);
      }
    };
    getOrCreateUserId();
  }, []);

  const updateBalance = async (amountToAdd) => {
  if (!userId) return;

  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  const current = userSnap.exists() ? userSnap.data().turdCoins || 0 : 0;
  const updated = current + amountToAdd;

  await updateDoc(userRef, {
    turdCoins: updated
  });
  setTurdBalance(updated);

  };

  const activateSecretMode = async () => {
    if (!userId) return;
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, {
      turdCoins: 999999,
      isUnlimited: true
    }, { merge: true });
    setIsUnlimited(true);
    setTurdBalance(999999);
  };

  return (
    <UserContext.Provider value={{ userId, turdBalance, isUnlimited, updateBalance, activateSecretMode }}>
      {children}
    </UserContext.Provider>
  );
};
const WelcomeScreen = ({ navigation }) => {
  const { turdBalance, activateSecretMode, updateBalance } = useContext(UserContext);
  const [selectedLang, setSelectedLang] = useState(i18n.locale);
  const [codeInput, setCodeInput] = useState("");
  const [tapCount, setTapCount] = useState(0);
  const [showSecret, setShowSecret] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [soundOn, setSoundOn] = useState(true); // 🔊 Toggle state

  useEffect(() => {
    const checkIfRegistered = async () => {
      const stored = await AsyncStorage.getItem("userPhone");
      if (stored) setIsRegistered(true);

      const saved = await AsyncStorage.getItem("soundOn");
      if (saved !== null) setSoundOn(saved === "true");
    };
    checkIfRegistered();
  }, []);

  const toggleSound = async () => {
    const newValue = !soundOn;
    setSoundOn(newValue);
    await AsyncStorage.setItem("soundOn", newValue.toString());
  };

  const checkSecretCode = async () => {
    if (codeInput.trim() === SECRET_CODE) {
      await activateSecretMode();
      navigation.reset({ index: 0, routes: [{ name: "Welcome" }] });
      alert(i18n.t("welcome.unlimited_activated"));
    } else {
      alert(i18n.t("welcome.invalid_code"));
    }
    setCodeInput("");
  };

  const handleTap = () => {
    setTapCount((prevCount) => {
      const newCount = prevCount + 1;
      if (!showSecret && newCount >= 11) {
        setShowSecret(true);
        return 0;
      } else if (showSecret && newCount >= 7) {
        setShowSecret(false);
        return 0;
      }
      return newCount;
    });
  };

  const handleRegistration = async () => {
    if (!phoneNumber) {
      alert(i18n.t("welcome.enter_phone"));
      return;
    }

    if (!phoneNumber.startsWith('+')) {
      alert(i18n.t("welcome.enter_phone_international"));
      return;
    }

    const userId = "user_" + phoneNumber;

    await saveUser(userId, phoneNumber);
    await AsyncStorage.setItem("userPhone", phoneNumber);

    setIsRegistered(true);
    navigation.navigate("TurdSelection");
  };

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>
        {/* 🔊 Sound Toggle */}
        <View style={{ position: "absolute", top: 40, left: 20, zIndex: 100 }}>
          <TouchableOpacity onPress={toggleSound}>
            <Text style={{ fontSize: 24, color: "#FFD700" }}>
              {soundOn ? "🔊" : "🔇"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 🌍 Language Picker */}
        <View style={styles.languagePickerContainer}>
          <Picker
            selectedValue={selectedLang}
            style={styles.languagePicker}
            onValueChange={(lang) => {
              i18n.locale = lang;
              setSelectedLang(lang);
            }}
            dropdownIconColor="#FFD700"
          >
            {Object.entries(languages).map(([key, label]) => (
              <Picker.Item key={key} label={label} value={key} />
            ))}
          </Picker>
        </View>

        {/* 🖼️ Welcome Image */}
        <Image
          source={require('./assets/Turdogramme_screen.png')}
          style={{ width: 320, height: 320, marginBottom: 20 }}
          resizeMode="contain"
        />

        <Text style={styles.subHeader}>{i18n.t("welcome.subtitle")}</Text>

        {showSecret && (
          <>
            <TextInput
              style={styles.input}
              placeholder={i18n.t("welcome.placeholder_secret")}
              value={codeInput}
              onChangeText={setCodeInput}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={styles.sendButton} onPress={checkSecretCode}>
              <Text style={styles.sendButtonText}>{i18n.t("welcome.activate_secret")}</Text>
            </TouchableOpacity>
          </>
        )}

        {!isRegistered ? (
          <View style={{ alignItems: "center" }}>
            <TextInput
              placeholder={i18n.t("welcome.placeholder_phone")}
              placeholderTextColor="#888"
              keyboardType="phone-pad"
              style={{
                borderColor: "#ccc",
                borderWidth: 1,
                padding: 10,
                borderRadius: 10,
                width: 250,
                marginBottom: 10,
                color: "#000",
                backgroundColor: "#fff"
              }}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
            <TouchableOpacity style={styles.startButton} onPress={handleRegistration}>
              <Text style={styles.startButtonText}>{i18n.t("welcome.register")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.startButton, { marginTop: 10 }]}
            onPress={() => navigation.navigate("TurdSelection")}
          >
            <Text style={styles.startButtonText}>{i18n.t("welcome.button")}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.startButton, { backgroundColor: "#FF69B4", marginTop: 10 }]}
          onPress={() => navigation.navigate("ReceivedTurd")}
        >
          <Text style={styles.startButtonText}>{i18n.t("welcome.view_received")}</Text>
        </TouchableOpacity>
      </View>
    </TouchableWithoutFeedback>
  );
};

const TurdSelectionScreen = ({ navigation }) => (
  <ScrollView contentContainerStyle={[styles.scrollContainer, styles.purpleBackground]}>
    <Text style={styles.header}>{i18n.t("select.title")}</Text>
    <View style={styles.grid}>
    {turds.map((turd, index) => (
        <TouchableOpacity
          key={index}
          style={styles.turdBox}
          onPress={() => navigation.navigate("SendScreen", { selectedGif: turd.gif, cost: TURD_PRICING[turd.name] })}
        >
          <Image source={turd.staticImg} style={styles.turdImage} resizeMode="contain" />
          <Text style={styles.turdText}>{turd.name}</Text>
          {TURD_PRICING[turd.name] > 0 && <Text style={styles.turdCost}>💰 {TURD_PRICING[turd.name]}</Text>}
        </TouchableOpacity>
      ))}
    </View>
    <TouchableOpacity style={styles.turdBox} onPress={() => navigation.navigate("BuyCoins")}>
      <Image source={require("./assets/TurdCoins_purchase.gif")} style={styles.turdImage} resizeMode="contain" />
      <Text style={styles.turdText}>{i18n.t("select.buy_button")}</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
      <Text style={styles.backButtonText}>{i18n.t("select.back")}</Text>
    </TouchableOpacity>
  </ScrollView>
);



const TURD_SENT_MESSAGES = [
  "Turd deployed successfully! 💩",
  "Mission accomplished. The turd is out.",
  "Boom. That turd’s already in orbit 🚀",
  "You just made someone’s day… worse 😈",
  "Payload delivered 💩",
  "Target locked. Turd sent.",
  "Transmission complete: 💩",
  "They’re gonna smell that one from here.",
  "Your stink bomb is en route!",
  "Turd launched. You absolute menace 💥"
];

const getGifFilename = (filename) => filename?.replace(".webp", ".gif").replace(".png", ".gif") || "";

const sendTurdViaWhatsApp = async (phoneNumber, selectedGif, message) => {
  const senderPhone = await AsyncStorage.getItem("userPhone");
  const gifToSend = getGifFilename(selectedGif);

  const result = await sendTurd(senderPhone, phoneNumber, gifToSend, message);

  if (!result.success) {
    alert(result.message || "Something went wrong.");
    return; // Stop if Firestore logic failed (e.g. not enough coins)
  }

  const turdGifMap = {
    "Angry_Turd.gif": "https://i.postimg.cc/WbP8twNh/Angry-Turd.gif",
    "Exploding_Turd.gif": "https://i.postimg.cc/JzrQ57B8/Exploding-Turd.gif",
    "Golden_Turd.gif": "https://i.postimg.cc/mDH3gtKY/Golden-Turd.gif",
    "Unicorn_Turd.gif": "https://i.postimg.cc/1X0pDbm4/Unicorn-Turd.gif",
    "Happy_Turd.gif": "https://i.postimg.cc/L4jBdgtR/Happy-Turd.gif",
  };

  const gifUrl = turdGifMap[gifToSend];
  const fullMessage = `${message}

💩 ${gifUrl}`;
  const encodedMessage = encodeURIComponent(fullMessage);
  const whatsappURL = `https://wa.me/${phoneNumber.replace(/[^0-9]/g, "")}?text=${encodedMessage}`;
  Linking.openURL(whatsappURL);
};

import { formatPhoneNumber } from "./firestoreHelpers"; // ✅ Import at the top

const SendScreen = ({ navigation, route }) => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("inApp");
  const { selectedGif, cost } = route.params || {};
  const { userId, turdBalance, updateBalance, isUnlimited } = useContext(UserContext);

  const getGifFilename = (filename) => filename?.replace(".webp", ".gif").replace(".png", ".gif") || "";

  const isValidPhoneNumber = (number) => {
    const intlPattern = /^\+[1-9]\d{6,14}$/;
    return intlPattern.test(number);
  };

  const sendTurdViaWhatsApp = async (recipientNumber, selectedGif, message) => {
    const senderPhone = await AsyncStorage.getItem("userPhone");
    const gifToSend = getGifFilename(selectedGif);

    const result = await sendTurd(senderPhone, recipientNumber, gifToSend, message);

    if (!result.success) {
      alert(result.message || "Something went wrong.");
      return;
    }

    const turdGifMap = {
      "Angry_Turd.gif": "https://i.postimg.cc/WbP8twNh/Angry-Turd.gif",
      "Exploding_Turd.gif": "https://i.postimg.cc/JzrQ57B8/Exploding-Turd.gif",
      "Golden_Turd.gif": "https://i.postimg.cc/mDH3gtKY/Golden-Turd.gif",
      "Unicorn_Turd.gif": "https://i.postimg.cc/1X0pDbm4/Unicorn-Turd.gif",
      "Happy_Turd.gif": "https://i.postimg.cc/L4jBdgtR/Happy-Turd.gif",
    };

    const gifUrl = turdGifMap[gifToSend];
    const fullMessage = `${message}\n\n💩 ${gifUrl}`;
    const encodedMessage = encodeURIComponent(fullMessage);
    const waUrl = `https://wa.me/${recipientNumber.replace(/[^0-9]/g, "")}?text=${encodedMessage}`;

    console.log('WhatsApp URL:', waUrl);

    Linking.openURL(waUrl)
      .then(() => console.log('WhatsApp opened successfully!'))
      .catch((err) => console.error('Error opening WhatsApp:', err));
  };

  const handleSendTurd = async () => {
    if (!phoneNumber || !selectedGif) {
      alert(i18n.t("send.enter_number"));
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      alert(i18n.t("send.invalid_number"));
      return;
    }

    const gifFilename = getGifFilename(selectedGif);

    const turdGifMap = {
      "Angry_Turd.gif": "https://i.postimg.cc/WbP8twNh/Angry-Turd.gif",
      "Exploding_Turd.gif": "https://i.postimg.cc/JzrQ57B8/Exploding-Turd.gif",
      "Golden_Turd.gif": "https://i.postimg.cc/mDH3gtKY/Golden-Turd.gif",
      "Unicorn_Turd.gif": "https://i.postimg.cc/1X0pDbm4/Unicorn-Turd.gif",
      "Happy_Turd.gif": "https://i.postimg.cc/L4jBdgtR/Happy-Turd.gif",
    };

    const gifToSend = turdGifMap[gifFilename];
    const extraWords = Math.max(0, message.trim().split(/\s+/).length - 5);
    const totalCost = (cost || 0) + extraWords;

    if (turdBalance < totalCost && !isUnlimited) {
      alert(i18n.t("send.not_enough"));
      return;
    }

    try {
      if (deliveryMethod === "inApp") {
        const formattedRecipient = formatPhoneNumber(phoneNumber); // ✅ Format it
        const result = await sendTurdInApp(userId, formattedRecipient, gifToSend, message);

        if (!result.success) throw new Error(result.message || "Failed to send turd.");
        updateBalance(-totalCost);
      } else {
        await sendTurdViaWhatsApp(phoneNumber, selectedGif, message);
      }

      const randomMessage = TURD_SENT_MESSAGES[Math.floor(Math.random() * TURD_SENT_MESSAGES.length)];
      navigation.navigate("SentScreen", { selectedGif: gifToSend, message });
    } catch (error) {
      console.error(error);
      alert(i18n.t("send.fail"));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{i18n.t("send.title")}</Text>
      <TextInput
        style={styles.input}
        placeholder={i18n.t("send.placeholder_number")}
        keyboardType="phone-pad"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
      />
      {!isValidPhoneNumber(phoneNumber) && phoneNumber.length > 0 && (
        <Text style={{ color: "red" }}>{i18n.t("send.invalid_number")}</Text>
      )}
      <TextInput
        style={styles.input}
        placeholder={i18n.t("send.placeholder_message")}
        value={message}
        onChangeText={setMessage}
      />

      <View style={{ flexDirection: "row", marginVertical: 10 }}>
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: deliveryMethod === "inApp" ? "#FFD700" : "#ccc" }]}
          onPress={() => setDeliveryMethod("inApp")}
        >
          <Text style={styles.sendButtonText}>{i18n.t("send.method_inapp")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: deliveryMethod === "whatsapp" ? "#25D366" : "#ccc", marginLeft: 10 }]}
          onPress={() => setDeliveryMethod("whatsapp")}
        >
          <Text style={styles.sendButtonText}>{i18n.t("send.method_whatsapp")}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subHeader}>TurdCoin Balance: {isUnlimited ? "∞" : turdBalance}</Text>
      <Text style={styles.costBreakdown}>
        {cost > 0 && `${i18n.t("send.cost.turd", { cost })} `}
        {message.trim().split(/\s+/).length > 5 &&
          `${i18n.t("send.cost.extra", { extra: Math.max(0, message.trim().split(/\s+/).length - 5) })}`}
      </Text>

      <TouchableOpacity style={styles.sendButton} onPress={handleSendTurd}>
        <Text style={styles.sendButtonText}>{i18n.t("send.send_button")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>{i18n.t("send.back")}</Text>
      </TouchableOpacity>
    </View>
  );
};


const BuyCoinsScreen = ({ navigation }) => {
  const { updateBalance } = useContext(UserContext);

  const addCoins = (amount) => {
    updateBalance(amount);
    alert(i18n.t("buy.success", { amount }));
  };

  const handlePurchase = async (priceId) => {
    try {
      const response = await fetch("https://turdogramme-backend.onrender.com/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ priceId }),
      });

      const { sessionUrl } = await response.json();

      if (sessionUrl) {
        await Linking.openURL(sessionUrl);  // ✅ Open Stripe Checkout
      } else {
        alert(i18n.t("buy.checkout_error"));
      }
    } catch (error) {
      console.error("Stripe Checkout Error:", error);
      alert(i18n.t("buy.payment_failed"));
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, styles.scrollContainer]}>
      <Image source={require("./assets/TurdCoins_purchase.gif")} style={{ width: 250, height: 250 }} resizeMode="contain" />
      <Text style={styles.header}>{i18n.t("buy.title")}</Text>

      <TouchableOpacity style={styles.sendButton} onPress={() => handlePurchase("price_1R75QnEtcXkw7neRjAKNLrzW")}>
  <Text style={styles.sendButtonText}>{i18n.t("buy.coins_50")}</Text>
</TouchableOpacity>

<TouchableOpacity style={styles.sendButton} onPress={() => handlePurchase("price_1R75SfEtcXkw7neRENizMESu")}>  
  <Text style={styles.sendButtonText}>{i18n.t("buy.coins_100")}</Text>
</TouchableOpacity>

<TouchableOpacity style={styles.sendButton} onPress={() => handlePurchase("price_1R75T3EtcXkw7neRMIdaAyiG")}>  
  <Text style={styles.sendButtonText}>{i18n.t("buy.coins_300")}</Text>
</TouchableOpacity>

     <TouchableOpacity
  style={[styles.sendButton, { backgroundColor: "#FF69B4" }]}
  onPress={() => navigation.navigate("GiftScreen")}
>
  <Text style={styles.sendButtonText}>{i18n.t("buy.gift_button")}</Text>
</TouchableOpacity>

    </ScrollView>
  );
};

const GiftScreen = ({ navigation }) => {
  const { updateBalance } = useContext(UserContext);
  const [recipientNumber, setRecipientNumber] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [isValidNumber, setIsValidNumber] = useState(true);

  const validatePhoneNumber = (number) => {
    const phoneRegex = /^\+[1-9]\d{7,14}$/; // International format
    return phoneRegex.test(number);
  };

  const sendGift = async () => {
    const amount = parseInt(giftAmount);
    if (!recipientNumber || isNaN(amount) || amount <= 0) {
      alert(i18n.t("gift.invalid_input"));
      return;
    }

    if (!validatePhoneNumber(recipientNumber)) {
      alert(i18n.t("gift.error_invalid_number"));
      return;
    }

    try {
      const response = await fetch("https://turdogramme-backend.onrender.com/gift-tc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: recipientNumber, amount }),
      });

      if (response.ok) {
        updateBalance(-amount);
        alert(i18n.t("gift.success", { amount }));
        navigation.goBack();
      } else {
        alert(i18n.t("gift.failed"));
      }
    } catch (error) {
      console.error("Gift error:", error);
      alert(i18n.t("common.error_generic"));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{i18n.t("gift.title")}</Text>
      <TextInput
        style={[styles.input, !isValidNumber && { borderColor: "red" }]}
        placeholder={i18n.t("gift.placeholder_number")}
        keyboardType="phone-pad"
        value={recipientNumber}
        onChangeText={(text) => {
          setRecipientNumber(text);
          setIsValidNumber(validatePhoneNumber(text));
        }}
      />
      {!isValidNumber && (
        <Text style={{ color: "red", marginBottom: 5 }}>
  {i18n.t("gift.invalid_format")}
</Text>
      )}
      <TextInput
        style={styles.input}
        placeholder={i18n.t("gift.placeholder_amount")}
        keyboardType="number-pad"
        value={giftAmount}
        onChangeText={setGiftAmount}
      />
      <TouchableOpacity style={styles.sendButton} onPress={sendGift}>
        <Text style={styles.sendButtonText}>{i18n.t("gift.send_button")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>{i18n.t("gift.back")}</Text>
      </TouchableOpacity>
    </View>
  );
};

const ReceivedTurdScreen = ({ navigation }) => {
  const [turd, setTurd] = useState(null);
  const [userPhone, setUserPhone] = useState(null);

  useEffect(() => {
    const fetchTurd = async () => {
      const storedPhone = await AsyncStorage.getItem("userPhone");
      if (!storedPhone) return;

      setUserPhone(storedPhone);

      const result = await getReceivedTurd(storedPhone);
      if (result && result.gif) {
        setTurd(result);

        const soundSetting = await AsyncStorage.getItem("soundOn");
        const isSoundOn = soundSetting === null || soundSetting === "true";

        if (isSoundOn) {
          playTurdAlert();
          Vibration.vibrate();
        }

        // 🔊 Speak the turd message using selected language
        const lang = i18n.locale || 'en'; // fallback to English
        if (result.message) {
          Speech.speak(result.message, {
            language: lang,
            rate: 1.0,
            pitch: 1.0,
          });
        }
      }
    };

    fetchTurd();
  }, []);

  const handleSave = async () => {
    if (!userPhone || !turd) return;
    await saveToMemoryBank(userPhone, turd.gif, turd.message);
    alert(i18n.t("common.saved_to_memory"));
    navigation.goBack();
  };

  if (!turd) {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>{i18n.t("received.none")}</Text>
        <Text style={styles.subHeader}>{i18n.t("received.none_sub")}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{i18n.t("common.back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{i18n.t("received.incoming")}</Text>
      <Text style={styles.subHeader}>{i18n.t("received.anonymous")}</Text>
      <Image source={{ uri: turd.gif }} style={styles.turdImage} resizeMode="contain" />
      <Text style={styles.subHeader}>{turd.message}</Text>

      <View style={{ flexDirection: 'row', marginTop: 20 }}>
        <TouchableOpacity style={styles.sendButton} onPress={handleFlush}>
          <Text style={styles.sendButtonText}>{i18n.t("common.flush")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.sendButton, { marginLeft: 10 }]} onPress={handleSave}>
          <Text style={styles.sendButtonText}>{i18n.t("common.saved")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{i18n.t("common.back")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function App() {
  useEffect(() => {
    registerForPushNotificationsAsync().then(async (token) => {
      if (token) {
        console.log("✅ Push Token:", token);
        const phone = await AsyncStorage.getItem('userPhone');
        const userId = phone ? `user_${phone}` : null;
  
        if (userId) {
          await savePushToken(userId, token);
        }
      }
    });
  
    // 👇 Handle tap on notification
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === "ReceivedTurd") {
        navigationRef.navigate("ReceivedTurd");
      }
    });
  
    return () => {
      subscription.remove();
    };
  }, []);
  
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <UserProvider>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="TurdSelection" component={TurdSelectionScreen} />
            <Stack.Screen name="SendScreen" component={SendScreen} />
            <Stack.Screen name="BuyCoins" component={BuyCoinsScreen} />
            <Stack.Screen name="GiftScreen" component={GiftScreen} />
            <Stack.Screen name="ReceivedTurd" component={ReceivedTurdScreen} />
            <Stack.Screen name="SentScreen" component={SentScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </UserProvider>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#6A0DAD", alignItems: "center", justifyContent: "center", padding: 20 },
  scrollContainer: { alignItems: "center", paddingTop: 40, paddingBottom: 40 },
  purpleBackground: { backgroundColor: "#6A0DAD", flexGrow: 1 },
  header: { fontSize: 32, fontWeight: "bold", color: "#FFD700", textAlign: "center", marginBottom: 10 },
  subHeader: { fontSize: 18, color: "white", textAlign: "center", marginBottom: 10 },
  startButton: { backgroundColor: "#FFD700", padding: 15, borderRadius: 10 },
  startButtonText: { fontSize: 18, fontWeight: "bold", color: "#6A0DAD" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  turdBox: { alignItems: "center", justifyContent: "center", borderRadius: 10, margin: 10 },
  turdImage: { width: 100, height: 100 },
  turdText: { color: "#FFD700", fontSize: 14, fontWeight: "bold", marginTop: 5 },
  turdCost: { color: "#FFD700", fontSize: 12, fontWeight: "bold" },
  input: { width: "80%", backgroundColor: "white", padding: 10, borderRadius: 10, textAlign: "center", fontSize: 18, marginBottom: 10 },
  sendButton: { backgroundColor: "#FFD700", padding: 15, borderRadius: 10, marginTop: 10 },
  sendButtonText: { fontSize: 18, fontWeight: "bold", color: "#6A0DAD" },
  backButton: { marginTop: 20, padding: 10, backgroundColor: "white", borderRadius: 5 },
  backButtonText: { color: "#6A0DAD", fontSize: 16, fontWeight: "bold" },
  costBreakdown: { fontSize: 16, color: "#FFD700", textAlign: "center", marginBottom: 10 },
  languagePickerContainer: {
    position: "absolute",
    top: 20,
    right: -10,
    width: 150,
    backgroundColor: "#6A0DAD",
    zIndex: 100,
    borderRadius: 10,
    padding: 5,
    overflow: "hidden",
  },
  languagePicker: {
    height: 60,
    color: "white",
  },
  lordTurdingham: {
    width: 2000,
    height: 2000,
    marginBottom: 10,
    resizeMode: "contain",
  },
  
});
