// web/pages/forgot-password.tsx
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { initFirebase } from "@/utils/firebase";
import { sendPasswordResetEmail } from "firebase/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const auth = initFirebase();
      const actionCodeSettings = {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      };
      await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings);
      setSent(true);
    } catch (e: any) {
      const code = e?.code || "";
      if (code === "auth/user-not-found" || code === "auth/invalid-email") {
        // Don't reveal whether the email exists
        setSent(true);
      } else {
        setErr("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>Reset password • VetMyBuilder</title>
      </Head>

      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Link href="/login" className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-600 text-sm transition-colors">
              ← Back to login
            </Link>
          </div>

          <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 sm:p-10" data-testid="forgot-password-card">
            {sent ? (
              <div className="text-center space-y-4" data-testid="forgot-password-success">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-emerald-600">
                    <path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0l-8 4-8-4"/>
                  </svg>
                </div>
                <h1 className="text-2xl font-black text-zinc-900">Check your email</h1>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  If an account exists for <span className="font-semibold text-zinc-700">{email}</span>, we've sent a password reset link. Click it to choose a new password.
                </p>
                <p className="text-xs text-zinc-400">Didn't get it? Check your spam folder.</p>
                <Link
                  href="/login"
                  className="mt-4 inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-colors"
                >
                  Back to login
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h1 className="text-2xl font-black text-zinc-900 mb-1">Forgot your password?</h1>
                  <p className="text-sm text-zinc-500">Enter your email and we'll send you a reset link.</p>
                </div>

                <form onSubmit={onSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="fp-email" className="block text-sm font-bold text-zinc-900 mb-2">
                      Email address
                    </label>
                    <input
                      id="fp-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="you@example.com"
                      data-testid="input-forgot-email"
                      className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
                    />
                  </div>

                  {err && (
                    <p className="text-red-500 text-sm font-medium" role="alert">{err}</p>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    data-testid="btn-forgot-submit"
                    className="w-full inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {busy ? "Sending…" : "Send reset link"}
                  </button>

                  <p className="text-center text-sm text-zinc-400">
                    Remember it?{" "}
                    <Link href="/login" className="font-semibold text-red-500 hover:underline">
                      Sign in
                    </Link>
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
