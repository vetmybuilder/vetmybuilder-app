// web/pages/tradesman/login.tsx
// Dedicated tradesman login page with Google SSO + email/password.
import { useState, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { initFirebase } from "@/utils/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { signOutUser } from "@/utils/auth";
import OAuthSignInButton from "@/components/forms/OAuthSignInButton";
import GuestOnly from "@/components/GuestOnly";

export default function TradesmanLogin() {
  const auth = initFirebase();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    submittingRef.current = true;
    setErr(null);

    try {
      try { sessionStorage.setItem("vmb:returnTo", "/tradesman/projects"); } catch {}

      const credential = await signInWithEmailAndPassword(auth, email, password);
      const token = await credential.user.getIdToken();

      const meRes = await fetch("/api/tradesmen/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meData = meRes.ok ? await meRes.json() : null;
      const isTradesman =
        String(meData?.role || "").toLowerCase() === "tradesman" ||
        !!meData?.profile;

      if (!isTradesman) {
        await signOutUser();
        try { sessionStorage.setItem("vmb:expect-signout", "1"); } catch {}
        setErr("This is not a trade account.");
        return;
      }

      await router.replace("/tradesman/projects");
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

  return (
    <GuestOnly>
      <Head>
        <title>Tradesperson sign in — VetMyBuilder</title>
        <meta name="description" content="Sign in to your tradesperson account on VetMyBuilder." />
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14 min-h-screen">
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-stone-50 py-24">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
            <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
          </div>

          <div className="relative z-10 w-full max-w-md px-4 sm:px-0" data-testid="tradesman-login-page">
            <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 sm:p-10">
              <div className="mb-8">
                <h1 className="text-3xl font-black tracking-tight text-zinc-900">
                  Tradesperson sign in
                </h1>
                <p className="mt-2 text-zinc-500 text-sm">
                  Sign in to your tradesperson account.
                </p>
              </div>

              <div onClick={() => { try { sessionStorage.setItem("vmb:oauthRole", "tradesman"); } catch {} }}>
                <OAuthSignInButton
                  provider="google"
                  returnTo="/tradesman/projects"
                  onError={(msg) => setErr(msg)}
                />
              </div>

              {process.env.NEXT_PUBLIC_FACEBOOK_LOGIN === "1" && (
                <div className="mt-3" onClick={() => { try { sessionStorage.setItem("vmb:oauthRole", "tradesman"); } catch {} }}>
                  <OAuthSignInButton
                    provider="facebook"
                    returnTo="/tradesman/projects"
                    onError={(msg) => setErr(msg)}
                  />
                </div>
              )}

              <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-400">
                <div className="h-px flex-1 bg-zinc-200" />
                <span>or</span>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>

              <form
                onSubmit={onSubmit}
                className="space-y-5"
                aria-label="Sign in form"
                data-testid="tradesman-login-form"
              >
                <div>
                  <label
                    className="block text-sm font-bold text-zinc-900 mb-2"
                    htmlFor="tradesman-login-email"
                  >
                    Email address
                  </label>
                  <input
                    id="tradesman-login-email"
                    className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
                    placeholder="you@example.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    data-testid="input-tradesman-login-email"
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-bold text-zinc-900 mb-2"
                    htmlFor="tradesman-login-password"
                  >
                    Password
                  </label>
                  <input
                    id="tradesman-login-password"
                    className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
                    placeholder="••••••••"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    data-testid="input-tradesman-login-password"
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
                    data-testid="tradesman-login-error"
                  >
                    {err}
                  </p>
                )}

                <button
                  className="w-full inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={busy}
                  data-testid="btn-tradesman-login"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p className="text-sm text-zinc-500 mt-6 text-center">
                Don&apos;t have an account?{" "}
                <Link
                  href="/tradesman/register-tradesmen"
                  className="font-bold text-red-500 hover:text-red-600"
                  data-testid="tradesman-link-to-register"
                >
                  Create one
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </GuestOnly>
  );
}
