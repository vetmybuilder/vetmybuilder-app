// web/pages/forgot-password.tsx
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { ChevronLeft, Mail } from "lucide-react";
import { initFirebase } from "@/utils/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import GuestOnly from "@/components/GuestOnly";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";

export default function ForgotPassword() {
  const router = useRouter();
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
    <GuestOnly>
      <>
        <Head>
          <title>Reset password - VetMyBuilder</title>
          {/* Mobile stays white; desktop gets the cream brand backdrop so
              BrandWatermarkScatter has somewhere to sit. */}
          <style>{`@media (min-width: 768px) { body { background: #fef6e9 !important; } }`}</style>
        </Head>

        <div className="fixed inset-0 top-14 bg-white md:bg-[#fef6e9] overflow-y-auto">
          <div className="hidden md:block">
            <BrandWatermarkScatter />
          </div>
          <div
            className="relative z-10 mx-auto max-w-md px-5 pt-4 pb-16 md:pt-10"
            data-testid="forgot-password-card"
          >
            <button
              type="button"
              aria-label="Back"
              onClick={() => router.back()}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 mb-4"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {sent ? (
              <div data-testid="forgot-password-success">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 mb-4">
                  <Mail className="h-6 w-6 text-indigo-600" />
                </div>
                <h1
                  className="text-[28px] font-black tracking-tight text-slate-900 leading-tight"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  Check your email
                </h1>
                <p className="mt-2 text-[13.5px] text-slate-500 leading-relaxed">
                  If an account exists for{" "}
                  <span className="font-extrabold text-slate-700">{email}</span>,
                  we've sent a password reset link. Click it to choose a new
                  password.
                </p>
                <p className="mt-3 text-[12px] text-slate-400">
                  Didn't get it? Check your spam folder.
                </p>
                <Link
                  href="/login"
                  className="mt-6 w-full inline-flex items-center justify-center rounded-2xl py-3.5 text-[14px] font-extrabold text-white shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                    boxShadow: "0 8px 22px rgba(99,102,241,0.3)",
                  }}
                >
                  Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h1
                    className="text-[28px] font-extrabold tracking-[-0.01em] text-slate-900 leading-[1.1]"
                  >
                    Forgot your password?
                  </h1>
                  <p className="mt-2 text-[13.5px] text-slate-500 leading-snug">
                    Enter your email and we'll send you a reset link.
                  </p>
                </div>

                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="fp-email"
                      className="block text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-2"
                    >
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
                      className="w-full bg-amber-50/40 rounded-2xl border-[1.5px] border-amber-100 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>

                  {err && (
                    <p
                      className="text-[12.5px] font-semibold text-rose-600"
                      role="alert"
                    >
                      {err}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    data-testid="btn-forgot-submit"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-extrabold text-white shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      background: busy
                        ? "linear-gradient(135deg, #94a3b8, #64748b)"
                        : "linear-gradient(135deg, #6366f1, #4f46e5)",
                      boxShadow: busy
                        ? undefined
                        : "0 8px 22px rgba(99,102,241,0.3)",
                    }}
                  >
                    {busy && (
                      <svg
                        className="h-4 w-4 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                          className="opacity-25"
                        />
                        <path
                          d="M4 12a8 8 0 018-8"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          className="opacity-75"
                        />
                      </svg>
                    )}
                    {busy ? "Sending..." : "Send reset link"}
                  </button>

                  <p className="text-center text-[12.5px] text-slate-500">
                    Remember it?{" "}
                    <Link
                      href="/login"
                      className="font-extrabold text-indigo-700 hover:underline"
                    >
                      Sign in
                    </Link>
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </>
    </GuestOnly>
  );
}
