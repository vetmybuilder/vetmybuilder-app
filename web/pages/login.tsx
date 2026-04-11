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
import OAuthSignInButton from "@/components/forms/OAuthSignInButton";

export default function Login() {
  const auth = initFirebase();
  const router = useRouter();
  const { user, loading: authLoading, profileComplete } = useAuth();
  const { role, loading: roleLoading } = useRole();

  const submittingRef = useRef(false);

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

  const [email, setEmail] = useState("");
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

    // Wait until /api/me has resolved so we know whether the user has
    // finished homeowner signup. Without this gate, a mid-signup user would
    // briefly land on /projects before auth.tsx's hard-nav to
    // /signup/complete kicked in — a visible flash.
    if (profileComplete === null) return;

    if (profileComplete === false) {
      router.replace("/signup/complete");
      return;
    }

    const nextParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
    if (nextParam && nextParam.startsWith("/")) {
      router.replace(nextParam);
      return;
    }

    // Honour a sessionStorage `vmb:oauthReturnTo` set by the OAuth sign-in
    // button. Dedicated key (NOT vmb:returnTo) so the auto-stash from
    // _app.tsx (which can hold values like "/?signedOut=1") can't poison
    // the post-signup redirect target.
    let stashedReturnTo: string | null = null;
    try {
      stashedReturnTo = sessionStorage.getItem("vmb:oauthReturnTo");
      if (stashedReturnTo) sessionStorage.removeItem("vmb:oauthReturnTo");
    } catch {}
    if (stashedReturnTo && stashedReturnTo.startsWith("/")) {
      router.replace(stashedReturnTo);
      return;
    }

    if (role === "tradesman") {
      router.replace("/tradesman/projects");
    } else {
      router.replace("/projects");
    }
  }, [authLoading, roleLoading, user, role, router, roleErrorMsg, profileComplete]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    submittingRef.current = true;
    setErr(null);

    const nextParam = new URLSearchParams(window.location.search).get("next") ?? "";
    const resolvedNextPath =
      nextParam && nextParam.startsWith("/") ? nextParam : "/projects";

    try {
      try {
        sessionStorage.setItem("vmb:returnTo", resolvedNextPath);
      } catch {
        // ignore storage errors
      }

      const credential = await signInWithEmailAndPassword(auth, email, password);
      const token = await credential.user.getIdToken();

      const isVendorFlowAtSubmit =
        !isAdminFlow &&
        (nextParam.startsWith("/tradesman/") || nextParam.startsWith("/trades/"));

      // Use a relative URL so this always goes through the Next.js rewrite
      // proxy — works in every environment (local, Docker CI, production).
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
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  if (authLoading) return null;
  if (user && !busy && !roleErrorMsg) return null;

  return (
    <>
      <Head>
        <title>Sign in — VetMyBuilder</title>
        <meta name="description" content="Sign in to your VetMyBuilder account." />
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14 min-h-screen">
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-stone-50 py-24">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
            <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
          </div>

          <div className="relative z-10 w-full max-w-md px-4 sm:px-0" data-testid="login-page">
            <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 sm:p-10" data-testid="login-card">
              <div className="mb-8">
                <h1 className="text-3xl font-black tracking-tight text-zinc-900" data-testid="login-title">
                  {isAdminFlow ? "Admin sign in" : isVendorFlow ? "Tradesperson sign in" : "Welcome back"}
                </h1>
                <p className="mt-2 text-zinc-500 text-sm">
                  {isAdminFlow
                    ? "Sign in with your admin account."
                    : isVendorFlow
                      ? "Sign in to your tradesperson account."
                      : "Sign in to your homeowner account."}
                </p>
              </div>

              {!isAdminFlow && !isVendorFlow && (
                <>
                  <div className="grid gap-3">
                    <OAuthSignInButton
                      provider="google"
                      returnTo={nextRaw && nextRaw.startsWith("/") ? nextRaw : undefined}
                      onError={(msg) => setErr(msg)}
                    />
                    {process.env.NEXT_PUBLIC_FACEBOOK_LOGIN === "1" && (
                      <OAuthSignInButton
                        provider="facebook"
                        returnTo={nextRaw && nextRaw.startsWith("/") ? nextRaw : undefined}
                        onError={(msg) => setErr(msg)}
                      />
                    )}
                  </div>

                  <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-400">
                    <div className="h-px flex-1 bg-zinc-200" />
                    <span>or</span>
                    <div className="h-px flex-1 bg-zinc-200" />
                  </div>
                </>
              )}

              <form
                onSubmit={onSubmit}
                className="space-y-5"
                aria-label="Sign in form"
                data-testid="login-form"
              >
                <div>
                  <label
                    className="block text-sm font-bold text-zinc-900 mb-2"
                    htmlFor="login-email"
                    data-testid="label-login-email"
                  >
                    Email address
                  </label>
                  <input
                    id="login-email"
                    className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
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
                    className="block text-sm font-bold text-zinc-900 mb-2"
                    htmlFor="login-password"
                    data-testid="label-login-password"
                  >
                    Password
                  </label>
                  <input
                    id="login-password"
                    className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
                    placeholder="••••••••"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    aria-required="true"
                    data-testid="input-login-password"
                  />
                  <div className="mt-2 text-right">
                    <Link href="/forgot-password" className="text-xs text-zinc-400 hover:text-red-500 transition-colors">
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
                  className="w-full inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={busy}
                  aria-label="Sign in"
                  data-testid="btn-login"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </form>

              {!isAdminFlow && (
                <p
                  className="text-sm text-zinc-500 mt-6 text-center"
                  data-testid="login-to-register"
                >
                  Don&apos;t have an account?{" "}
                  <Link
                    href={
                      isVendorFlow
                        ? { pathname: "/tradesman/register-tradesmen" }
                        : { pathname: "/signup" }
                    }
                    className="font-bold text-red-500 hover:text-red-600"
                    data-testid="link-to-register"
                  >
                    Create one
                  </Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
