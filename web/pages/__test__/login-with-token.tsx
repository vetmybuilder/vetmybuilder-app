// pages/__test__/login-with-token.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import { initFirebase } from "@/utils/firebase"; // your existing helper
import {
  signInWithCustomToken,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

export default function LoginWithToken() {
  if (process.env.NODE_ENV === "production") return null;
  const router = useRouter();
  const { token, redirect = "/" } = router.query as {
    token?: string;
    redirect?: string;
  };

  useEffect(() => {
    (async () => {
      if (!token) return;
      const auth = initFirebase();

      // persist across navigation so the app sees you're logged in
      await setPersistence(auth, browserLocalPersistence);

      try {
        await signInWithCustomToken(auth, token);
        // Wait for auth state so the cookie/localStorage settle before redirect
        await new Promise<void>((resolve) => {
          const unsub = onAuthStateChanged(auth, () => {
            unsub();
            resolve();
          });
        });
        router.replace(redirect || "/");
      } catch (e) {
        console.error("[__test__] signInWithCustomToken failed", e);
        // show a simple error (optional)
        alert("Test login failed");
      }
    })();
  }, [token, router]);

  return <p>Signing in…</p>;
}
