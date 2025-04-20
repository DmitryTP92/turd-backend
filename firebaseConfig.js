import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCaNicfMvlFlmBFyhR2YH_-4YQ1ZepQU5A",
  authDomain: "turdogramme-prod.firebaseapp.com",
  projectId: "turdogramme-prod",
  storageBucket: "turdogramme-prod.firebasestorage.app",
  messagingSenderId: "608505726015",
  appId: "1:608505726015:web:f8e059d3a084a409c6648a",
  measurementId: "G-0EBEPS53QP"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
