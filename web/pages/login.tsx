// web/pages/login.tsx
import Head from "next/head";
import { initFirebase } from "@/utils/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { signOutUser } from "@/utils/auth";
import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import { useRole } from "@/utils/useRole";
import { trackLogin } from "@/utils/analytics";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import { flushPendingProject } from "@/utils/flushPendingProject";
import OAuthSignInButton from "@/components/forms/OAuthSignInButton";

/**
 * Whitelist of dynamic-route patterns that target a specific resource by
 * id/slug. Only paths matching one of these get to override the role
 * default after sign-in via `?next=`. Everything else (top-level lists,
 * dashboards, settings) drops the captured path so a fresh login lands on
 * `/projects` for homeowners and `/tradesman/jobs` for tradespeople.
 *
 * Decision: the user wants a fresh-login experience that always opens the
 * primary surface for their role, and only deep-links when there's a real
 * reason to (a specific match, project, chat, builder, or public profile).
 */
const DEEP_ROUTE_PATTERNS: RegExp[] = [
  /^\/match\/[^/?#]+/, // /match/<matchId>
  /^\/projects\/\d+(\/|$)/, // /projects/<id> + sub-paths (edit, close, shortlist, recommend)
  /^\/chat\/[^/?#]+/, // /chat/<matchId>
  /^\/builders\/\d+/, // /builders/<recId>
  // Admin entries live under /admin/* and are reached via /admin/login →
  // /login?next=/admin/...; the whole point is to land on the requested
  // admin page, so always treat them as deep links.
  /^\/admin\//,
  // Public tradesperson profile is /tradesman/<slugOrId>. Exclude every
  // known authenticated tradesman list/dashboard path so they're treated
  // as non-deep and fall back to the role default.
  /^\/tradesman\/(?!jobs(\/|$|\?)|matches(\/|$|\?)|leads(\/|$|\?)|account(\/|$|\?)|profile(\/|$|\?)|featured(\/|$|\?)|register-tradesmen(\/|$|\?)|signup(\/|$|\?)|login(\/|$|\?)|billing(\/|$|\?))[^/?#]+/,
];

function isDeepRoute(path: string): boolean {
  if (!path || !path.startsWith("/")) return false;
  return DEEP_ROUTE_PATTERNS.some((re) => re.test(path));
}

function roleDefault(role: string | null | undefined): string {
  return role === "tradesman" ? "/tradesman/jobs" : "/projects";
}

export default function Login() {
  const auth = initFirebase();
  const router = useRouter();
  const { user, loading: authLoading, profileComplete } = useAuth();
  const { role, loading: roleLoading } = useRole();

  const submittingRef = useRef(false);

  // Once we've fired any redirect from the auto-redirect useEffect we
  // mark this true so re-renders (e.g. role/profile state changes that
  // happen after router.replace is queued but before the navigation
  // completes) don't fire a SECOND, conflicting redirect that overrides
  // the first. Without this, e.g. a tradesman-intent redirect to
  // /tradesman/signup/complete was being clobbered by the homeowner
  // /signup/complete branch on the next render.
  const redirectFiredRef = useRef(false);

  const nextRaw = useMemo(() => {
    if (!router.isReady) return "";
    const n = router.query.next;
    return typeof n === "string" ? n : Array.isArray(n) ? n[0] : "";
  }, [router.isReady, router.query.next]);

  const isAdminFlow =
    router.asPath.includes("next=%2Fadmin%2F") ||
    router.asPath.includes("next=/admin/");

  const isVendorFlow =
    !isAdminFlow &&
    !!nextRaw &&
    (nextRaw.startsWith("/tradesman/") || nextRaw.startsWith("/trades/"));

  // Pre-fill email from ?email= query param.
  const initialEmail = useMemo(() => {
    if (!router.isReady) return "";
    const e = router.query.email;
    return typeof e === "string" ? e : Array.isArray(e) ? e[0] : "";
  }, [router.isReady, router.query.email]);

  const [email, setEmail] = useState("");
  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const roleErrorMsg = useMemo((): React.ReactNode | null => {
    if (!router.isReady) return null;
    const e = router.query.role_error;
    if (e === "not-trade")
      return (
        <>
          This is not a trade account.{" "}
          <Link href="/login" className="underline hover:text-red-700">
            Sign in as a homeowner
          </Link>{" "}
          instead.
        </>
      );
    if (e === "not-homeowner")
      return (
        <>
          This is a trade account.{" "}
          <Link href="/tradesman/login" className="underline hover:text-red-700">
            Use the tradesperson sign in
          </Link>{" "}
          instead.
        </>
      );
    return null;
  }, [router.isReady, router.query.role_error]);

  const [err, setErr] = useState<string | null>(null);
  const displayErr: React.ReactNode = roleErrorMsg || err;

  // Redirect already-logged-in users (GuestOnly behaviour)
  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) return;
    if (submittingRef.current) return;
    if (roleErrorMsg) return;
    if (redirectFiredRef.current) return;

    // Wait until /api/me has resolved so we know whether the user has
    // finished homeowner signup. Without this gate, a mid-signup user would
    // briefly land on /projects before auth.tsx's hard-nav to
    // /signup/complete kicked in - a visible flash.
    if (profileComplete === null) return;

    // Tradesman-intent OAuth flow. The OAuthSignInButton stashes
    // "vmb:oauthIntent" before opening the provider popup; we read it here
    // once /api/me has resolved so role is known too. Decision tree:
    //   - already a tradesman        -> /tradesman/jobs
    //   - not yet a tradesman        -> /tradesman/signup/complete
    //     (this page collects the minimum tradesman profile fields and
    //      then bounces to /tradesman/jobs)
    // Homeowner completion is irrelevant in this branch - a signed-in
    // user who intends to be a tradesman does not need a homeowner profile
    // to proceed.
    let oauthIntent: string | null = null;
    try {
      oauthIntent = sessionStorage.getItem("vmb:oauthIntent");
    } catch {}
    if (oauthIntent === "tradesman") {
      // Don't clear vmb:oauthIntent here - the destination page owns
      // the flag's lifecycle. Clearing it here causes a re-render race
      // where the next useEffect tick sees the empty flag and falls
      // through to the homeowner /signup/complete branch.
      redirectFiredRef.current = true;
      // We CANNOT rely on `role === "tradesman"` from useRole here:
      // useRole now treats vmb:oauthIntent="tradesman" as a strong
      // tradesman signal (needed for header/footer/CTAs during
      // mid-signup). If we trusted it for the destination too, a
      // BRAND-NEW Google account would be routed straight to
      // /tradesman/jobs and never see the wizard. Make an
      // authoritative check: only an existing `profile` on
      // /api/tradesmen/me means they've completed signup.
      (async () => {
        let hasProfile = false;
        try {
          const auth = initFirebase();
          const token = auth.currentUser
            ? await auth.currentUser.getIdToken(false)
            : "";
          const r = await fetch("/api/tradesmen/me", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (r.ok) {
            const d = await r.json();
            hasProfile = !!d?.profile;
          }
        } catch {
          // Best-effort. A failed lookup falls through to the wizard
          // path - safer than the dashboard.
        }
        router.replace(
          hasProfile ? "/tradesman/jobs" : "/tradesman/signup/complete",
        );
      })();
      return;
    }

    if (profileComplete === false) {
      redirectFiredRef.current = true;
      router.replace("/signup/complete");
      return;
    }

    // Pending homeowner project draft (guest started the wizard at
    // /projects/new, hit submit, came in via login). Flush it before
    // any other redirect logic so the user lands on their new project.
    let hasPendingPayload = false;
    try {
      hasPendingPayload = !!sessionStorage.getItem("vmb:pendingProjectPayload");
    } catch {}
    if (hasPendingPayload && role !== "tradesman") {
      redirectFiredRef.current = true;
      (async () => {
        const auth = initFirebase();
        const token = auth.currentUser ? await auth.currentUser.getIdToken(false) : "";
        const apiClient = {
          post: (path: string, body: unknown) =>
            fetch(path, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(body),
            }).then(async (r) => ({ data: r.ok ? await r.json() : null })),
        };
        const target = await flushPendingProject(apiClient);
        router.replace(target || roleDefault(role));
      })();
      return;
    }

    const nextParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
    // Only deep-link routes (e.g. /match/123, /projects/45, /chat/7) get
    // to override the role default. Top-level surfaces like /matches,
    // /tradesman/matches, /tradesman/jobs/list etc. drop through to the
    // role-specific landing page below.
    if (nextParam && isDeepRoute(nextParam)) {
      redirectFiredRef.current = true;
      router.replace(nextParam);
      return;
    }

    // Honour a sessionStorage `vmb:oauthReturnTo` set by the OAuth sign-in
    // button. Dedicated key (NOT vmb:returnTo) so the auto-stash from
    // _app.tsx (which can hold values like "/?signedOut=1") can't poison
    // the post-signup redirect target. Apply the same deep-route gate.
    let stashedReturnTo: string | null = null;
    try {
      stashedReturnTo = sessionStorage.getItem("vmb:oauthReturnTo");
      if (stashedReturnTo) sessionStorage.removeItem("vmb:oauthReturnTo");
    } catch {}
    if (stashedReturnTo && isDeepRoute(stashedReturnTo)) {
      redirectFiredRef.current = true;
      router.replace(stashedReturnTo);
      return;
    }

    redirectFiredRef.current = true;
    router.replace(roleDefault(role));
  }, [authLoading, roleLoading, user, role, router, roleErrorMsg, profileComplete]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    submittingRef.current = true;
    setErr(null);

    const nextParam = new URLSearchParams(window.location.search).get("next") ?? "";

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      trackLogin("email");
      const token = await credential.user.getIdToken();

      const isVendorFlowAtSubmit =
        !isAdminFlow &&
        (nextParam.startsWith("/tradesman/") || nextParam.startsWith("/trades/"));

      // Use a relative URL so this always goes through the Next.js rewrite
      // proxy - works in every environment (local, Docker CI, production).
      const meRes = await fetch("/api/tradesmen/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meData = meRes.ok ? await meRes.json() : null;
      const isTradesman =
        String(meData?.role || "").toLowerCase() === "tradesman" ||
        !!meData?.profile;

      if (isVendorFlowAtSubmit && !isTradesman) {
        await signOutUser();
        try { sessionStorage.setItem("vmb:expect-signout", "1"); } catch {}
        const p = new URLSearchParams(window.location.search);
        p.set("role_error", "not-trade");
        window.location.replace(`${window.location.pathname}?${p.toString()}`);
        return;
      }

      if (!isVendorFlowAtSubmit && !isAdminFlow && isTradesman) {
        await signOutUser();
        try { sessionStorage.setItem("vmb:expect-signout", "1"); } catch {}
        window.location.replace(`${window.location.pathname}?role_error=not-homeowner`);
        return;
      }

      // Resolve destination AFTER role detection so the role default lines
      // up with the actual signed-in user. Only honour `?next=` when it
      // points at a deep-link route (a specific match / project / chat /
      // builder / public profile); top-level lists drop through to the
      // role default.
      const baseResolvedNextPath =
        nextParam && isDeepRoute(nextParam)
          ? nextParam
          : roleDefault(isTradesman ? "tradesman" : "user");

      // Flush a pending homeowner project draft (guest started the
      // wizard at /projects/new, hit submit, realised they had an
      // account, switched to /login). Only relevant for homeowners -
      // a trade signing in here doesn't want a homeowner job posted.
      let pendingTarget: string | null = null;
      if (!isTradesman) {
        const apiClient = {
          post: (path: string, body: unknown) =>
            fetch(path, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(body),
            }).then(async (r) => ({ data: r.ok ? await r.json() : null })),
        };
        pendingTarget = await flushPendingProject(apiClient);
      }

      const resolvedNextPath = pendingTarget || baseResolvedNextPath;

      try {
        sessionStorage.setItem("vmb:returnTo", resolvedNextPath);
      } catch {
        // ignore storage errors
      }

      await router.replace(resolvedNextPath);
    } catch (e: any) {
      const code = e?.code ?? "";
      if (
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-email"
      ) {
        setErr("Incorrect email or password. Please try again.");
      } else if (code === "auth/too-many-requests") {
        setErr("Too many failed attempts. Please try again later or reset your password.");
      } else if (code === "auth/user-disabled") {
        setErr("This account has been disabled. Please contact support.");
      } else {
        setErr("Something went wrong. Please try again.");
      }
      submittingRef.current = false;
      setBusy(false);
    }
  };

  if (authLoading) return null;
  if (user && !busy && !roleErrorMsg) return null;

  // Brand selection: emerald for tradesperson sign-in, indigo for
  // homeowner. Admin keeps a neutral slate look (no SSO, no role pill).
  const brand: "indigo" | "emerald" | "admin" = isAdminFlow
    ? "admin"
    : isVendorFlow
    ? "emerald"
    : "indigo";


  const focusRing =
    brand === "emerald"
      ? "focus:border-emerald-500 focus:ring-emerald-500/15"
      : brand === "indigo"
      ? "focus:border-indigo-500 focus:ring-indigo-500/15"
      : "focus:border-slate-500 focus:ring-slate-500/15";

  const linkColor =
    brand === "emerald"
      ? "text-emerald-600 hover:text-emerald-700"
      : brand === "indigo"
      ? "text-indigo-600 hover:text-indigo-700"
      : "text-slate-700 hover:text-slate-900";

  const submitGradient =
    brand === "emerald"
      ? "linear-gradient(135deg,#10b981,#059669)"
      : brand === "indigo"
      ? "linear-gradient(135deg,#6366f1,#4f46e5)"
      : "linear-gradient(135deg,#475569,#334155)";

  const submitShadow =
    brand === "emerald"
      ? "shadow-emerald-500/25"
      : brand === "indigo"
      ? "shadow-indigo-500/25"
      : "shadow-slate-500/25";

  const heading = isAdminFlow
    ? "Admin sign in"
    : isVendorFlow
    ? "Tradesperson sign in"
    : "Welcome back";

  const subcopy = isAdminFlow
    ? "Sign in with your admin account."
    : isVendorFlow
    ? "Sign in to see new jobs, manage your pass, and reply to homeowners."
    : "Sign in to chat with builders and pick up where you left off.";

  return (
    <>
      <Head>
        <title>Sign in - VetMyBuilder</title>
        <meta name="description" content="Sign in to your VetMyBuilder account." />
        {/* Cream brand backdrop - matches /projects, /signup/complete, /404. */}
        <style>{`body { background: #ffffff !important; }`}</style>
      </Head>

      <div className="bg-white min-h-screen relative overflow-hidden">
        <BrandWatermarkScatter />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-8 md:py-20 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-center" data-testid="login-page">
          {/* Form column (left on desktop, below photo on mobile). */}
          <div className="order-2 md:order-1">
            <h1
              className="text-[34px] md:text-[44px] font-black text-slate-900 leading-[1.05] tracking-tight"
              data-testid="login-title"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              {heading}
            </h1>
            <p className="mt-3 text-[14px] text-slate-600">
              {subcopy}
            </p>

            <div className="mt-7 rounded-2xl bg-slate-50 border border-slate-200 p-5 sm:p-6">
              <p className="text-[13px] font-bold text-slate-900 mb-3">Sign in</p>

          {/* OAuth: Google only. Hidden on admin flow. */}
          {!isAdminFlow && (
            <>
              <OAuthSignInButton
                provider="google"
                returnTo={nextRaw && nextRaw.startsWith("/") ? nextRaw : undefined}
                intent={isVendorFlow ? "tradesman" : "homeowner"}
                onError={(msg) => setErr(msg)}
              />

              <div className="my-4 flex items-center gap-3 text-[10.5px] uppercase tracking-wider text-slate-400 font-bold">
                <div className="h-px flex-1 bg-slate-200" />
                <span>Or sign in with email</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
            </>
          )}

          <form
            onSubmit={onSubmit}
            className="space-y-3"
            aria-label="Sign in form"
            data-testid="login-form"
          >
            <div>
              <label
                className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5"
                htmlFor="login-email"
                data-testid="label-login-email"
              >
                Email
              </label>
              <input
                id="login-email"
                className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-900 placeholder:text-slate-400 text-[14px] focus:bg-white focus:outline-none focus:ring-4 transition-colors ${focusRing}`}
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                aria-required="true"
                data-testid="input-login-email"
              />
            </div>

            <div>
              <label
                className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5"
                htmlFor="login-password"
                data-testid="label-login-password"
              >
                Password
              </label>
              <input
                id="login-password"
                className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-900 placeholder:text-slate-400 text-[14px] focus:bg-white focus:outline-none focus:ring-4 transition-colors ${focusRing}`}
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                aria-required="true"
                data-testid="input-login-password"
              />
              <div className="mt-1.5 text-right">
                <Link
                  href={
                    nextRaw
                      ? `/forgot-password?next=${encodeURIComponent(nextRaw)}`
                      : "/forgot-password"
                  }
                  className={`text-[12px] font-bold ${linkColor}`}
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {displayErr && (
              <p
                className="text-red-500 text-sm font-medium"
                role="alert"
                data-testid="login-error"
              >
                {displayErr}
              </p>
            )}

            <button
              className={`w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-extrabold text-[15px] tracking-tight shadow-lg ${submitShadow} hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100`}
              style={{ background: submitGradient }}
              disabled={busy}
              aria-label="Sign in"
              data-testid="btn-login"
            >
              {busy && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                </svg>
              )}
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {!isAdminFlow && (
            <p
              className="mt-4 text-center text-[13px] text-slate-500"
              data-testid="login-to-register"
            >
              {isVendorFlow ? "New tradesperson?" : "New to VetMyBuilder?"}
              <Link
                href={
                  isVendorFlow
                    ? { pathname: "/tradesman/register-tradesmen" }
                    : { pathname: "/signup" }
                }
                className={`font-extrabold ml-1 ${linkColor}`}
                data-testid="link-to-register"
              >
                {isVendorFlow ? "Register your business" : "Create an account"}
              </Link>
            </p>
          )}
            </div>
          </div>

          {/* Photo / illustration column (right on desktop, top on mobile).
              Trade flow gets a trade photo, homeowner gets a finished
              room, admin gets a slate dashboard illustration. */}
          <div className="order-1 md:order-2">
            {isAdminFlow ? (
              <div
                className="relative rounded-2xl overflow-hidden shadow-lg aspect-[16/10] md:aspect-[4/5] flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#334155 100%)",
                }}
              >
                {/* faint dot grid */}
                <svg className="absolute inset-0" width="100%" height="100%" aria-hidden>
                  {Array.from({ length: 30 }).map((_, i) => {
                    const cx = (i * 47) % 600;
                    const cy = (i * 83) % 700;
                    return (
                      <circle
                        key={i}
                        cx={cx}
                        cy={cy}
                        r="2.5"
                        fill="#cbd5e1"
                        opacity={0.12}
                      />
                    );
                  })}
                </svg>
                {/* shield + check */}
                <svg
                  viewBox="0 0 240 240"
                  width="58%"
                  height="58%"
                  aria-hidden
                  style={{ filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.45))" }}
                >
                  <path
                    d="M120 28 L208 60 V128 C208 174 170 200 120 218 C70 200 32 174 32 128 V60 Z"
                    fill="#0f172a"
                    stroke="#cbd5e1"
                    strokeWidth="4"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M78 120 L110 152 L168 92"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden shadow-lg aspect-[16/10] md:aspect-[4/5]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    isVendorFlow
                      ? "/job-images/electrical.jpg"
                      : "/job-images/bathroom.jpg"
                  }
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
