import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDCciwpypjLW795u45AGWYx-7ABlC0xIaM",
  authDomain: "helix-58312.firebaseapp.com",
  projectId: "helix-58312",
  storageBucket: "helix-58312.firebasestorage.app",
  messagingSenderId: "185838190470",
  appId: "1:185838190470:web:65c360d18dfe7e965af607",
  measurementId: "G-BD4JEKC1ZC"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);