import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithCustomToken,
  connectAuthEmulator,
} from "firebase/auth";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

function buildConfigFromEnv(): FirebaseConfig {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG_JSON;
  if (raw && raw.trim().length > 0) {
    try {
      return JSON.parse(raw) as FirebaseConfig;
    } catch {
      // Fall through to env-var-driven config.
    }
  }

  const cfg: FirebaseConfig = {
    apiKey: String(process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ""),
    authDomain: String(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || ""),
    projectId: String(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const allPresent = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId);
  if (!allPresent) {
    throw new Error(
      "Firebase config missing. Set web/.env.local with NEXT_PUBLIC_FIREBASE_CONFIG_JSON or individual NEXT_PUBLIC_FIREBASE_* vars.",
    );
  }

  return cfg;
}

function getAuthEmulatorHost(): string | undefined {
  if (typeof window === "undefined") return undefined;

  const w = window as any;

  // ✅ Prefer runtime-injected value (works in Docker without rebuild)
  const runtimeHost =
    w.__FIREBASE_AUTH_EMULATOR_HOST ||
    w.__NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;

  const envHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;

  const host = String(runtimeHost || envHost || "").trim();
  return host || undefined;
}

export function initFirebase() {
  const cfg = buildConfigFromEnv();

  if (!getApps().length) {
    initializeApp(cfg);
  }

  const auth = getAuth();

  // ✅ Connect to Firebase Auth Emulator (only once)
  const emulatorHost = getAuthEmulatorHost();
  if (typeof window !== "undefined" && emulatorHost) {
    const w = window as any;
    if (!w.__authEmulatorConnected) {
      connectAuthEmulator(auth, `http://${emulatorHost}`, {
        disableWarnings: true,
      });
      w.__authEmulatorConnected = true;
      w.__authEmulatorHost = emulatorHost;
    }
  }

  if (typeof window !== "undefined") {
    (window as any).firebaseAuth = auth;
    (window as any).signInWithCustomToken = signInWithCustomToken;
  }

  return auth;
}
