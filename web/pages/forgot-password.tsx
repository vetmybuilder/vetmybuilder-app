// web/pages/forgot-password.tsx
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/router";
import { initFirebase } from "@/utils/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import GuestOnly from "@/components/GuestOnly";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";

export default function ForgotPassword() {
  const router = useRouter();
  const nextRaw =
    typeof router.query.next === "string" ? router.query.next : "";
  const backToLoginHref = nextRaw
    ? `/login?next=${encodeURIComponent(nextRaw)}`
    : "/login";

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
          <style>{`body { background: #ffffff !important; }`}</style>
        </Head>

        <main className="bg-white min-h-screen relative overflow-hidden">
          <BrandWatermarkScatter />
          <div
            className="relative z-10 mx-auto max-w-6xl px-6 py-8 md:py-20 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-center"
            data-testid="forgot-password-card"
          >
            {/* Form column. */}
            <div className="order-2 md:order-1">
              {sent ? (
                <div data-testid="forgot-password-success">
                  <h1
                    className="text-[34px] md:text-[44px] font-black text-slate-900 leading-[1.05] tracking-tight"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    Check your email.
                  </h1>
                  <p className="mt-3 text-[14px] text-slate-600">
                    If an account exists for{" "}
                    <span className="font-extrabold text-slate-900">{email}</span>,
                    we&apos;ve sent a password reset link. Click it to choose a
                    new password.
                  </p>
                  <p className="mt-2 text-[13px] text-slate-500">
                    Didn&apos;t get it? Check your spam folder.
                  </p>
                  <Link
                    href={backToLoginHref}
                    className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-extrabold text-white"
                  >
                    Back to sign in
                  </Link>
                </div>
              ) : (
                <>
                  <h1
                    className="text-[34px] md:text-[44px] font-black text-slate-900 leading-[1.05] tracking-tight"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    Forgot your{" "}
                    <span className="text-emerald-700">password</span>?
                  </h1>
                  <p className="mt-3 text-[14px] text-slate-600">
                    No drama. Pop in the email you signed up with and we&apos;ll send a reset link.
                  </p>

                  <div className="mt-7 rounded-2xl bg-slate-50 border border-slate-200 p-5 sm:p-6">
                    <p className="text-[13px] font-bold text-slate-900 mb-3">
                      Send reset link
                    </p>

                    <form onSubmit={onSubmit} className="space-y-3">
                      <div>
                        <label
                          htmlFor="fp-email"
                          className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                        >
                          Email
                        </label>
                        <input
                          id="fp-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          autoComplete="email"
                          placeholder="you@company.com"
                          data-testid="input-forgot-email"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      {err && (
                        <p className="text-[12.5px] font-semibold text-rose-600" role="alert">
                          {err}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={busy}
                        data-testid="btn-forgot-submit"
                        className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-sm font-extrabold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {busy ? "Sending..." : "Send reset link"}
                      </button>

                      <p className="text-center text-[12.5px] text-slate-500">
                        Remembered it?{" "}
                        <Link
                          href={backToLoginHref}
                          className="font-extrabold text-emerald-700 hover:underline"
                        >
                          Back to sign in
                        </Link>
                      </p>
                    </form>
                  </div>
                </>
              )}
            </div>

            {/* Illustration column (right on desktop, top on mobile). */}
            <div className="order-1 md:order-2">
              <div
                className="relative rounded-2xl overflow-hidden shadow-lg aspect-[16/10] md:aspect-[4/5] flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg,#ecfdf5 0%,#d1fae5 60%,#a7f3d0 100%)",
                }}
              >
                <svg
                  className="absolute inset-0"
                  width="100%"
                  height="100%"
                  aria-hidden
                >
                  {Array.from({ length: 18 }).map((_, i) => {
                    const cx = (i * 53) % 600;
                    const cy = (i * 91) % 700;
                    return (
                      <circle
                        key={i}
                        cx={cx}
                        cy={cy}
                        r="3"
                        fill="#10b981"
                        opacity={0.15}
                      />
                    );
                  })}
                </svg>

                <svg
                  viewBox="0 0 240 240"
                  width="60%"
                  height="60%"
                  aria-hidden
                  style={{ filter: "drop-shadow(0 12px 30px rgba(5,150,105,0.30))" }}
                >
                  <rect x="30" y="70" width="180" height="120" rx="14" fill="#ffffff" stroke="#059669" strokeWidth="4" />
                  <path d="M30,84 L120,150 L210,84" fill="none" stroke="#059669" strokeWidth="4" strokeLinejoin="round" />
                  <circle cx="170" cy="60" r="22" fill="#fcd34d" stroke="#b45309" strokeWidth="4" />
                  <circle cx="170" cy="60" r="7" fill="#ffffff" stroke="#b45309" strokeWidth="3" />
                  <path
                    d="M188 75 L218 105 L210 113 L218 121 L210 129 L202 121 L192 131"
                    fill="none"
                    stroke="#b45309"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </main>
      </>
    </GuestOnly>
  );
}
