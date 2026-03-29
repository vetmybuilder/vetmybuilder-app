// web/utils/auth.tsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { initFirebase } from "./firebase";
import {
  onIdTokenChanged,
  signOut,
  type User as FbUser,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";

type AccountUser = {
  uid: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
};

type Ctx = {
  user:
    | (FbUser &
        Partial<AccountUser> & {
          displayName?: string;
          initials?: string;
        })
    | null;
  token: string | null;
  loading: boolean;

  ensureSignedIn: () => Promise<FbUser>;
  hydrateFromSignup: (u: {
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    email?: string | null;
  }) => void;
  mergeUser: (u: Partial<AccountUser>) => void;

  startEmailLinkSignIn: (email: string, continueUrl?: string) => Promise<void>;
  completeEmailLinkSignInIfPresent: () => Promise<FbUser | null>;

  signInWithGoogle: () => Promise<FbUser>;
  signInWithApple: () => Promise<FbUser>;
};

const AuthCtx = createContext<Ctx>({
  user: null,
  token: null,
  loading: true,
  ensureSignedIn: async () => {
    throw new Error("ensureSignedIn not ready");
  },
  hydrateFromSignup: () => {},
  mergeUser: () => {},
  startEmailLinkSignIn: async () => {},
  completeEmailLinkSignInIfPresent: async () => null,
  signInWithGoogle: async () => {
    throw new Error("Google sign-in not ready");
  },
  signInWithApple: async () => {
    throw new Error("Apple sign-in not ready");
  },
});

function computeDisplayName(u: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}) {
  const fn = (u.firstName || "").trim();
  const ln = (u.lastName || "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  const un = (u.username || "").trim();
  return un || undefined;
}

function computeInitials(u: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}) {
  const fn = (u.firstName || "").trim();
  const ln = (u.lastName || "").trim();
  if (fn || ln) {
    const a = fn ? fn[0] : "";
    const b = ln ? ln[0] : "";
    return (a + b).toUpperCase() || undefined;
  }
  return undefined;
}

function buildExtendedUser(fbUser: FbUser, base: Partial<AccountUser>) {
  const firstName = base.firstName ?? null;
  const lastName = base.lastName ?? null;
  const username = base.username ?? null;
  const email = base.email ?? fbUser.email ?? null;
  const uid = base.uid ?? fbUser.uid;

  return Object.assign({}, fbUser, {
    uid,
    email,
    firstName,
    lastName,
    username,
    displayName: computeDisplayName({ firstName, lastName, username }),
    initials: computeInitials({ firstName, lastName, username }),
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Ctx["user"]>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);

  const loading = !authReady || !profileReady;

  const waitersRef = useRef<Array<(u: FbUser) => void>>([]);

  const hydrateFromSignup = useCallback<Ctx["hydrateFromSignup"]>(
    ({ firstName = null, lastName = null, username = null, email = null }) => {
      setUser((prev) =>
        prev
          ? buildExtendedUser(prev as FbUser, {
              uid: prev.uid,
              email: email ?? prev.email ?? null,
              firstName,
              lastName,
              username,
            })
          : prev,
      );
    },
    [],
  );

  const mergeUser = useCallback<Ctx["mergeUser"]>((patch) => {
    setUser((prev) =>
      prev
        ? buildExtendedUser(prev as FbUser, {
            uid: prev.uid,
            email: patch.email ?? prev.email ?? null,
            firstName: patch.firstName ?? prev.firstName ?? null,
            lastName: patch.lastName ?? prev.lastName ?? null,
            username: patch.username ?? prev.username ?? null,
          })
        : prev,
    );
  }, []);

  const ensureSignedIn = useCallback<Ctx["ensureSignedIn"]>(async () => {
    const auth = initFirebase();
    if (auth.currentUser) return auth.currentUser;

    return new Promise<FbUser>((resolve) => {
      waitersRef.current.push(resolve);
    });
  }, []);

  useEffect(() => {
    const auth = initFirebase();
    let alive = true;

    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      setAuthReady(true);

      if (!fbUser) {
        if (!alive) return;
        setUser(null);
        setToken(null);
        setProfileReady(true);
        return;
      }

      try {
        const t = await fbUser.getIdToken();
        if (!alive) return;

        setToken(t);

        setUser(
          buildExtendedUser(fbUser, {
            uid: fbUser.uid,
            email: fbUser.email ?? null,
          }),
        );
        setProfileReady(true);

        const ws = waitersRef.current;
        waitersRef.current = [];
        ws.forEach((fn) => fn(fbUser));

        try {
          const meRes = await fetch("/api/me", {
            headers: { Authorization: `Bearer ${t}` },
            cache: "no-store",
          });

          if (meRes.ok) {
            const me = await meRes.json();

            const merged = buildExtendedUser(fbUser, {
              uid: me.uid ?? fbUser.uid,
              email: me.email ?? fbUser.email ?? null,
              firstName: me.firstName ?? null,
              lastName: me.lastName ?? null,
              username: me.username ?? null,
            });

            if (!alive) return;
            setUser(merged);
          }
        } catch {}
      } catch {
        setProfileReady(true);
      }
    });

    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      ensureSignedIn,
      hydrateFromSignup,
      mergeUser,
      startEmailLinkSignIn: async () => {},
      completeEmailLinkSignInIfPresent: async () => null,
      signInWithGoogle: async () => {
        const auth = initFirebase();
        return (await signInWithPopup(auth, new GoogleAuthProvider())).user;
      },
      signInWithApple: async () => {
        const auth = initFirebase();
        return (await signInWithPopup(auth, new OAuthProvider("apple.com")))
          .user;
      },
    }),
    [user, token, loading, ensureSignedIn, hydrateFromSignup, mergeUser],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}

export async function signOutUser() {
  const auth = initFirebase();
  try {
    await signOut(auth);
  } finally {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {}
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch {}
  }
}
