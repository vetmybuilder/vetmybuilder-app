import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { initFirebase } from "./firebase";
import {
  onIdTokenChanged,
  signOut,
  type User as FbUser,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";

const REG_SENTINEL = "__vendor_registration_in_progress__";

/** Server user shape we care about */
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
          displayName?: string | undefined;
          initials?: string | undefined;
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

/* ---------- helpers ---------- */

function computeDisplayName(u: { firstName?: string | null; lastName?: string | null; username?: string | null; }) {
  const fn = (u.firstName || "").trim();
  const ln = (u.lastName || "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  const un = (u.username || "").trim();
  return un || undefined;
}

function computeInitials(u: { firstName?: string | null; lastName?: string | null; username?: string | null; }) {
  const fn = (u.firstName || "").trim();
  const ln = (u.lastName || "").trim();
  if (fn || ln) {
    const a = fn ? fn[0] : "";
    const b = ln ? ln[0] : "";
    const ab = (a + b || a || b).toUpperCase();
    return ab || undefined;
  }
  const un = (u.username || "").trim();
  if (un) {
    const parts = un.split(/[.\-_ ]+/).filter(Boolean);
    const a = parts[0]?.[0] || "";
    const b = parts[1]?.[0] || "";
    const ab = (a + b || a).toUpperCase();
    return ab;
  }
  return undefined;
}

/* --- auth path helpers & return target management --- */

function isAuthPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/auth/complete" ||
    pathname === "/tradesman/login" ||
    pathname === "/tradesman/register"
  );
}

function rememberReturnToFallbackFromReferrer() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    if (sessionStorage.getItem("vmb:returnTo")) return; // already set
    const ref = document.referrer;
    if (!ref) return;
    const u = new URL(ref);
    if (u.origin !== window.location.origin) return; // only same-origin
    if (isAuthPath(u.pathname)) return;
    sessionStorage.setItem("vmb:returnTo", u.pathname + u.search);
  } catch {}
}

function getReturnTo(): string {
  if (typeof window === "undefined") return "/";
  try {
    const v = sessionStorage.getItem("vmb:returnTo");
    if (!v) return "/";
    if (v === REG_SENTINEL) return "/"; // never redirect to sentinel
    return v.startsWith("/") ? v : "/";
  } catch {
    return "/";
  }
}

function setReturnToIfEmpty(path?: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = sessionStorage.getItem("vmb:returnTo");
    if (existing) return;
    const candidate =
      path ||
      (window.location && !isAuthPath(window.location.pathname)
        ? window.location.pathname + window.location.search
        : "/");
    sessionStorage.setItem("vmb:returnTo", candidate || "/");
  } catch {}
}

/* Build a safe extended user object */
function buildExtendedUser(fbUser: FbUser, base: Partial<AccountUser>): Ctx["user"] {
  const firstName = base.firstName ?? null;
  const lastName = base.lastName ?? null;
  const username = base.username ?? null;
  const email = base.email ?? fbUser.email ?? null;
  const uid = base.uid ?? fbUser.uid;

  const displayName = computeDisplayName({ firstName, lastName, username });
  const initials = computeInitials({ firstName, lastName, username });

  return Object.assign({}, fbUser, {
    uid,
    email,
    firstName,
    lastName,
    username,
    displayName,
    initials,
  }) as any;
}

/* ---------- Provider ---------- */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Ctx["user"]>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [waiters, setWaiters] = useState<Array<(u: FbUser) => void>>([]);

  useEffect(() => {
    rememberReturnToFallbackFromReferrer();
  }, []);

  const hydrateFromSignup: Ctx["hydrateFromSignup"] = useCallback(
    ({ firstName = null, lastName = null, username = null, email = null }) => {
      setUser((prev) => {
        if (!prev) return prev;
        return buildExtendedUser(prev as FbUser, {
          uid: prev.uid,
          email: email ?? prev.email ?? null,
          firstName,
          lastName,
          username,
        });
      });
    },
    []
  );

  const mergeUser: Ctx["mergeUser"] = useCallback((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      return buildExtendedUser(prev as FbUser, {
        uid: prev.uid,
        email: patch.email ?? prev.email ?? null,
        firstName: patch.firstName ?? prev.firstName ?? null,
        lastName: patch.lastName ?? prev.lastName ?? null,
        username: patch.username ?? prev.username ?? null,
      });
    });
  }, []);

  const ensureSignedIn = useCallback<Ctx["ensureSignedIn"]>(async () => {
    const gsid = (window as any).__GSID || null;

    const auth = initFirebase();
    const current = auth.currentUser;
    if (current) return current;

    try {
      if (typeof window !== "undefined" && window.location) {
        const here = window.location.pathname + window.location.search;
        if (!isAuthPath(window.location.pathname)) {
          setReturnToIfEmpty(here);
        }
      }
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent("vmb:auth:required", { detail: { gsid, ts: Date.now() } })
      );
    } catch {}

    return new Promise<FbUser>((resolve) => {
      setWaiters((prev) => [...prev, resolve]);
    });
  }, []);

  const startEmailLinkSignIn = useCallback<Ctx["startEmailLinkSignIn"]>(
    async (email, continueUrl) => {
      const auth = initFirebase();
      setReturnToIfEmpty();
      const url =
        continueUrl ||
        (typeof window !== "undefined"
          ? window.location.origin + "/auth/complete"
          : "https://vetmybuilder.com/auth/complete");
      const settings = { url, handleCodeInApp: true };
      try {
        localStorage.setItem("vmb.magic.email", email);
      } catch {}
      await sendSignInLinkToEmail(auth, email, settings);
    },
    []
  );

  const completeEmailLinkSignInIfPresent = useCallback<Ctx["completeEmailLinkSignInIfPresent"]>(
    async () => {
      if (typeof window === "undefined") return null;
      const auth = initFirebase();
      const href = window.location.href;
      if (!isSignInWithEmailLink(auth, href)) return null;

      let email = "";
      try {
        email = localStorage.getItem("vmb.magic.email") || "";
      } catch {}
      if (!email) {
        throw new Error("EMAIL_REQUIRED");
      }

      const cred = await signInWithEmailLink(auth, email, href);
      try {
        localStorage.removeItem("vmb.magic.email");
      } catch {}
      return cred.user;
    },
    []
  );

  const signInWithGoogle = useCallback<Ctx["signInWithGoogle"]>(async () => {
    const auth = initFirebase();
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  }, []);

  const signInWithApple = useCallback<Ctx["signInWithApple"]>(async () => {
    const auth = initFirebase();
    const provider = new OAuthProvider("apple.com");
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  }, []);

  useEffect(() => {
    const auth = initFirebase();
    let alive = true;

    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          if (!alive) return;
          setUser(null);
          setToken(null);
          try {
            window.dispatchEvent(
              new CustomEvent("vmb:auth:changed", {
                detail: { uid: null, gsid: (window as any).__GSID || null, ts: Date.now() },
              })
            );
          } catch {}
          return;
        }

        const t = await fbUser.getIdToken();
        if (!alive) return;
        setToken(t);

        let merged: Ctx["user"] = buildExtendedUser(fbUser, {
          uid: fbUser.uid,
          email: fbUser.email ?? null,
          firstName: null,
          lastName: null,
          username: null,
        });

        try {
          const meRes = await fetch("/api/me", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });

          let firstName: string | null = null;
          let lastName: string | null = null;
          let username: string | null = null;
          let email: string | null = fbUser.email ?? null;
          let uid: string = fbUser.uid;

          if (meRes.ok) {
            const me = await meRes.json();
            uid = me.uid ?? uid;
            email = me.email ?? email;
            firstName = me.firstName ?? null;
            lastName = me.lastName ?? null;
            username = me.username ?? null;
          }

          if (!firstName && !lastName && !username) {
            const accRes = await fetch("/api/account", {
              headers: { Authorization: `Bearer ${t}` },
              cache: "no-store",
            });
            if (accRes.ok) {
              const acc = await accRes.json();
              const u = acc?.user ?? acc;
              firstName = u?.firstName ?? firstName;
              lastName = u?.lastName ?? lastName;
              username = u?.username ?? username;
              email = u?.email ?? email;
              uid = u?.uid ?? uid;
            }
          }

          merged = buildExtendedUser(fbUser, { uid, email, firstName, lastName, username });
        } catch {}

        if (!alive) return;
        setUser(merged);

        if (waiters.length > 0 && fbUser) {
          waiters.forEach((fn) => fn(fbUser));
          setWaiters([]);
        }

        // Redirect off auth pages after login — but skip if sentinel is set
        try {
          if (typeof window !== "undefined" && fbUser) {
            const { pathname } = window.location;
            const rtRaw = sessionStorage.getItem("vmb:returnTo");
            if (isAuthPath(pathname) && rtRaw !== REG_SENTINEL) {
              const rt = getReturnTo();
              const already = sessionStorage.getItem("vmb:didLoginRedirect");
              if (!already) {
                sessionStorage.setItem("vmb:didLoginRedirect", String(Date.now()));
                window.location.replace(rt || "/");
              }
            }
          }
        } catch {}

        try {
          window.dispatchEvent(
            new CustomEvent("vmb:auth:changed", {
              detail: { uid: fbUser.uid, gsid: (window as any).__GSID || null, ts: Date.now() },
            })
          );
        } catch {}
      } finally {
        if (alive) setLoading(false);
      }
    });

    return () => {
      alive = false;
      unsub();
    };
  }, [waiters]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      ensureSignedIn,
      hydrateFromSignup,
      mergeUser,
      startEmailLinkSignIn,
      completeEmailLinkSignInIfPresent,
      signInWithGoogle,
      signInWithApple,
    }),
    [
      user,
      token,
      loading,
      ensureSignedIn,
      hydrateFromSignup,
      mergeUser,
      startEmailLinkSignIn,
      completeEmailLinkSignInIfPresent,
      signInWithGoogle,
      signInWithApple,
    ]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ---------- Public API ---------- */

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
