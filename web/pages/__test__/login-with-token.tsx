// pages/__test__/login-with-token.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import { initFirebase } from "@/utils/firebase";
import {
  signInWithCustomToken,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

export default function LoginWithToken() {
  if (process.env.NODE_ENV === "production") return null;

  const router = useRouter();
  const q = router.query as Record<string, string | string[] | undefined>;
  const token = Array.isArray(q.token) ? q.token[0] : q.token;
  const redirect = Array.isArray(q.redirect)
    ? q.redirect[0]
    : q.redirect || "/";

  useEffect(() => {
    (async () => {
      if (!token) return;
      const auth = initFirebase();
      await setPersistence(auth, browserLocalPersistence);

      try {
        await signInWithCustomToken(auth, token);
        await new Promise<void>((resolve) => {
          const unsub = onAuthStateChanged(auth, () => {
            unsub();
            resolve();
          });
        });
        router.replace(redirect);
      } catch {
        // Test-only helper - failures surface in the E2E run logs.
      }
    })();
  }, [token, redirect, router]);

  return <p data-testid="test-login-status">Signing in…</p>;
}
