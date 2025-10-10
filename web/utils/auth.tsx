// web/utils/auth.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { initFirebase } from "./firebase";
import { onIdTokenChanged, signOut, type User as FbUser } from "firebase/auth";

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
  /** Optional: instantly seed names after signup */
  hydrateFromSignup: (u: {
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    email?: string | null;
  }) => void;
};

const AuthCtx = createContext<Ctx>({
  user: null,
  token: null,
  loading: true,
  hydrateFromSignup: () => {},
});

/* ---------- helpers (NO email/uid fallbacks) ---------- */

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

  // show skeleton in UI until names/username are present
  return undefined;
}

/* Build a safe extended user object */
function buildExtendedUser(
  fbUser: FbUser,
  base: Partial<AccountUser>
): Ctx["user"] {
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
    displayName, // may be undefined if unknown (UI shows skeleton)
    initials, // may be undefined if unknown (UI shows skeleton)
  }) as any;
}

/* ---------- Provider ---------- */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Ctx["user"]>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // optimistically seed names right after signup (optional helper)
  const hydrateFromSignup: Ctx["hydrateFromSignup"] = ({
    firstName = null,
    lastName = null,
    username = null,
    email = null,
  }) => {
    setUser((prev) => {
      if (!prev) return prev;
      const merged = buildExtendedUser(prev as FbUser, {
        uid: prev.uid,
        email: email ?? prev.email ?? null,
        firstName,
        lastName,
        username,
      });
      return merged;
    });
  };

  useEffect(() => {
    const auth = initFirebase();
    let alive = true;

    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          if (!alive) return;
          setUser(null);
          setToken(null);
          return;
        }

        const t = await fbUser.getIdToken();
        if (!alive) return;
        setToken(t);

        // Start with a minimal extended user (no email/uid-derived display/initials)
        let merged: Ctx["user"] = buildExtendedUser(fbUser, {
          uid: fbUser.uid,
          email: fbUser.email ?? null,
          firstName: null,
          lastName: null,
          username: null,
        });

        // Try /api/me for canonical user fields
        try {
          const meRes = await fetch("/api/me", {
            headers: { Authorization: `Bearer ${t}` },
            cache: "no-store",
          });

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

          // If names still missing, fall back to /api/account (used by Account page)
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

          merged = buildExtendedUser(fbUser, {
            uid,
            email,
            firstName,
            lastName,
            username,
          });
        } catch {
          // keep minimal merged; UI will show skeleton until next successful fetch
        }

        if (!alive) return;
        setUser(merged);
      } finally {
        if (alive) setLoading(false);
      }
    });

    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, hydrateFromSignup }),
    [user, token, loading]
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
    // Clear any local caches that could keep stale UI around
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {}

    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch {}
  }
}
