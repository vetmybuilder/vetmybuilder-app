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

const RETURN_TO_KEY = "vmb:returnTo";

type AccountUser = {
  uid: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  /** True when /api/me returns a tradesman row. Persisted on the user
   *  object so role-aware UI (toasts, brand palette, etc.) can read it
   *  without re-fetching. */
  isTradesman?: boolean;
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
  // Tristate. `null` = not yet known (we haven't fetched /api/me yet for the
  // current Firebase user, or the user is signed out). `true` = /api/me has
  // returned a row with a postcode. `false` = /api/me has returned a row
  // with no postcode (the post-OAuth "finishing signup" state). UI chrome
  // that implies a fully signed-up user should hide on `false` only — `null`
  // means "trust the existing user object" so we don't flash the header on
  // every page load while the profile is being fetched.
  profileComplete: boolean | null;

  ensureSignedIn: () => Promise<FbUser>;
  // Re-fetches /api/me and refreshes user + profileComplete. Call this after
  // the client has done something that changes the server-side profile
  // (e.g. POST /api/account from /signup/complete) so the header and other
  // profile-gated UI update without a full page reload.
  refreshProfile: () => Promise<void>;
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
  profileComplete: null,
  ensureSignedIn: async () => {
    throw new Error("ensureSignedIn not ready");
  },
  refreshProfile: async () => {},
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
    isTradesman: base.isTradesman ?? false,
    displayName: computeDisplayName({ firstName, lastName, username }),
    initials: computeInitials({ firstName, lastName, username }),
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Ctx["user"]>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

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

  const refreshProfile = useCallback<Ctx["refreshProfile"]>(async () => {
    const auth = initFirebase();
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    try {
      const t = await fbUser.getIdToken();
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const me = await res.json();
      setUser(
        buildExtendedUser(fbUser, {
          uid: me.uid ?? fbUser.uid,
          email: me.email ?? fbUser.email ?? null,
          firstName: me.firstName ?? null,
          lastName: me.lastName ?? null,
          username: me.username ?? null,
          isTradesman: !!me.isTradesman,
        }),
      );
      // Postcode is no longer captured at signup, but firstName still is
      // (via /api/auth/signup). A bare touchUserMw upsert from a fresh
      // OAuth Firebase token produces a row WITHOUT firstName, and the
      // /tradesman/login interstitial uses profileComplete=false to detect
      // that case ("OAuth user who hasn't finished signup"). So we treat
      // a row with firstName as complete, otherwise incomplete.
      setProfileComplete(!!me.firstName);
    } catch {
      // non-fatal — caller can retry
    }
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
        setProfileComplete(null);
        return;
      }

      // New Firebase user detected. Reset profileComplete to "unknown"
      // until /api/me has been fetched. We deliberately do NOT set it to
      // `false` here — that would cause the header to briefly suppress its
      // chrome on every page load while /api/me is in flight, even for
      // returning users with a complete profile.
      setProfileComplete(null);

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
              isTradesman: !!me.isTradesman,
            });

            if (!alive) return;
            setUser(merged);
            // See refreshProfile() above for the firstName-gating rationale.
            setProfileComplete(!!me.firstName);

            // Engagement-first signup: a guest who started the wizard at
            // /projects/new and stashed the payload in sessionStorage now
            // gets it auto-posted, regardless of which auth path they took
            // (email signup, OAuth-via-/signup/complete, OAuth-direct, or
            // login). The redundant calls in SignupForm/login/signup-
            // complete still work for their own redirect flows; this is
            // the safety net that catches every other path.
            try {
              const hasPending = sessionStorage.getItem(
                "vmb:pendingProjectPayload",
              );
              if (hasPending) {
                const apiClient = {
                  post: (path: string, body: unknown) =>
                    fetch(path, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${t}`,
                      },
                      body: JSON.stringify(body),
                    }).then(async (r) => {
                      const data = await r.json().catch(() => null);
                      if (!r.ok) {
                        const err: any = new Error(
                          data?.message || data?.error || `HTTP ${r.status}`,
                        );
                        err.response = { status: r.status, data };
                        throw err;
                      }
                      return { data };
                    }),
                };
                const { flushPendingProject } = await import(
                  "@/utils/flushPendingProject"
                );
                const target = await flushPendingProject(apiClient as any);
                if (target) {
                  window.location.assign(target);
                }
              }
            } catch {
              /* non-fatal - other flush sites or the next navigation will handle */
            }

            // Routing decisions based on profileComplete are owned by the
            // route wrappers (GuestOnly for /signup, /login etc., and
            // AuthedOnly for /projects etc.). They read profileComplete from
            // this context and call router.replace themselves once /api/me
            // has resolved. Doing the bounce here too would race with them
            // and cause a visible reload.
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
      profileComplete,
      ensureSignedIn,
      refreshProfile,
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
    [user, token, loading, profileComplete, ensureSignedIn, refreshProfile, hydrateFromSignup, mergeUser],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}

// Module-level flag set for the duration of an explicit user-initiated
// sign-out. AuthedOnly checks this before reacting to `user === null` so
// the protected route doesn't capture itself as `vmb:returnTo` /
// `?next=...` and bounce the user back to it after they sign in again.
// The caller (GlobalMobileMenu.onLogout) issues a hard nav to "/" right
// after signOutUser resolves, which tears the page down before the flag
// would need clearing.
let __signOutInProgress = false;
export function isSignOutInProgress(): boolean {
  return __signOutInProgress;
}

export async function signOutUser() {
  __signOutInProgress = true;
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
