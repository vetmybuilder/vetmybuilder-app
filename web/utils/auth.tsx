// web/utils/auth.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { initFirebase } from "./firebase";
import {
  onIdTokenChanged,
  signOut,
  type User,
} from "firebase/auth";

type Ctx = { user: User | null; token: string | null; loading: boolean };
const AuthCtx = createContext<Ctx>({ user: null, token: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = initFirebase();

    // Single source of truth: fires on login, logout, and token refresh
    const unsub = onIdTokenChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const t = await u.getIdToken(); // no forced refresh; Firebase refreshes automatically
        setToken(t);
      } else {
        setToken(null);
      }
      setLoading(false);
    });

    // Optional: when tab regains focus, ask Firebase to refresh token if needed
    const onFocus = async () => {
      const u = auth.currentUser;
      if (u) {
        try {
          const t = await u.getIdToken(true); // force refresh on focus to be extra safe
          setToken(t);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      unsub();
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const value = useMemo(() => ({ user, token, loading }), [user, token, loading]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}

/** Call this to sign the user out (e.g., from a header button). */
export async function signOutUser() {
  const auth = initFirebase();
  await signOut(auth);
}
