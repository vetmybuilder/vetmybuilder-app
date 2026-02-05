import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";

function buildConfigFromEnv() {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG_JSON;
  if (raw && raw.trim().length > 0) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn(
        "[firebase] Failed to parse NEXT_PUBLIC_FIREBASE_CONFIG_JSON:",
        e,
      );
    }
  }

  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const allPresent = Object.values(cfg).every(Boolean);
  if (!allPresent) {
    throw new Error(
      "Firebase config missing. Set web/.env.local with NEXT_PUBLIC_FIREBASE_CONFIG_JSON or individual NEXT_PUBLIC_FIREBASE_* vars.",
    );
  }

  return cfg;
}

export function initFirebase() {
  const cfg = buildConfigFromEnv();

  if (!getApps().length) {
    initializeApp(cfg);
  }

  const auth = getAuth();

  if (typeof window !== "undefined") {
    (window as any).firebaseAuth = auth;
    (window as any).signInWithCustomToken = signInWithCustomToken;
  }

  return auth;
}
