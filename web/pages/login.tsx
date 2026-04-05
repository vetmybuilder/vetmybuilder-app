// web/pages/login.tsx
import Head from "next/head";
import { initFirebase } from "@/utils/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState, useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import GuestOnly from "@/components/GuestOnly";

export default function Login() {
  const auth = initFirebase();
  const router = useRouter();

  // Read the *explicit* ?next= from the URL for display purposes (vendor flow
  // label, "don't have an account" link target).
  // router.isReady may still be false on first render after client-side
  // navigation, so fall back gracefully — the authoritative read happens inside
  // the submit handler where window.location is always available.
  const nextRaw = useMemo(() => {
    if (!router.isReady) return "";
    const n = router.query.next;
    return typeof n === "string" ? n : Array.isArray(n) ? n[0] : "";
  }, [router.isReady, router.query.next]);

  const hasExplicitNext = !!nextRaw;

  // Detect flow type — router.asPath includes the query string before isReady,
  // so use it for immediate detection without waiting for router.isReady.
  const isAdminFlow =
    router.asPath.includes("next=%2Fadmin%2F") ||
    router.asPath.includes("next=/admin/");

  // Is this login being used for a tradesman flow?
  const isVendorFlow =
    !isAdminFlow &&
    hasExplicitNext &&
    (nextRaw.startsWith("/tradesman/") || nextRaw.startsWith("/trades/"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);

    // Read ?next= at submit time — window.location is always authoritative here,
    // regardless of whether router.isReady has fired yet. This prevents the
    // redirect target being lost when the form is submitted quickly after a
    // client-side navigation (e.g. from /admin/login).
    const nextParam = router.isReady
      ? ((router.query.next as string) ?? "")
      : new URLSearchParams(window.location.search).get("next") ?? "";
    const resolvedNextPath =
      nextParam && nextParam.startsWith("/") ? nextParam : "/projects";

    try {
      try {
        sessionStorage.setItem("vmb:returnTo", resolvedNextPath);
      } catch {
        // ignore storage errors
      }

      await signInWithEmailAndPassword(auth, email, password);

      await router.replace(resolvedNextPath);
    } catch (e: any) {
      setErr(e.message || "Failed to login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GuestOnly>
      <>
      <Head>
        <title>Sign in — VetMyBuilder</title>
        <meta name="description" content="Sign in to your VetMyBuilder account." />
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14 min-h-screen">
        {/* Background matching homepage hero */}
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-stone-50 py-24">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
            <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
          </div>

          <div className="relative z-10 w-full max-w-md px-4 sm:px-0" data-testid="login-page">
            {/* Card */}
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

                {err && (
                  <p
                    className="text-red-500 text-sm font-medium"
                    role="alert"
                    data-testid="login-error"
                  >
                    {err}
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
    </GuestOnly>
  );
}
