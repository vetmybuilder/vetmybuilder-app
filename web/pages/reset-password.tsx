// web/pages/reset-password.tsx
import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { initFirebase } from "@/utils/firebase";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";

type Rule = { label: string; pass: (pw: string) => boolean };

const RULES: Rule[] = [
  { label: "At least 8 characters",        pass: (pw) => pw.length >= 8 },
  { label: "One uppercase letter (A–Z)",   pass: (pw) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter (a–z)",   pass: (pw) => /[a-z]/.test(pw) },
  { label: "One number (0–9)",             pass: (pw) => /[0-9]/.test(pw) },
  { label: "One special character (!@#…)", pass: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export default function ResetPassword() {
  const router = useRouter();
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [invalidCode, setInvalidCode] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Verify the oobCode from the URL on mount
  useEffect(() => {
    const code = String(router.query.oobCode || "");
    if (!code) return; // wait for router to be ready
    const auth = initFirebase();
    verifyPasswordResetCode(auth, code)
      .then(() => {
        setOobCode(code);
        setVerifying(false);
      })
      .catch(() => {
        setInvalidCode(true);
        setVerifying(false);
      });
  }, [router.query.oobCode]);

  const allRulesPass = RULES.every((r) => r.pass(password));
  const passwordsMatch = password === confirm && confirm.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!allRulesPass) { setErr("Please meet all password requirements."); return; }
    if (!passwordsMatch) { setErr("Passwords do not match."); return; }
    if (!oobCode) return;

    setBusy(true);
    try {
      const auth = initFirebase();
      await confirmPasswordReset(auth, oobCode, password);
      setDone(true);
    } catch (e: any) {
      const code = e?.code || "";
      if (code === "auth/expired-action-code") {
        setErr("This reset link has expired. Please request a new one.");
      } else if (code === "auth/invalid-action-code") {
        setErr("This reset link is invalid or has already been used.");
      } else {
        setErr("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (verifying && router.query.oobCode) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-sm text-zinc-400">Verifying link…</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Set new password • VetMyBuilder</title>
      </Head>

      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 sm:p-10" data-testid="reset-password-card">

            {invalidCode ? (
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-red-500">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                  </svg>
                </div>
                <h1 className="text-2xl font-black text-zinc-900">Link expired</h1>
                <p className="text-sm text-zinc-500">This password reset link is invalid or has already been used.</p>
                <Link
                  href="/forgot-password"
                  className="inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-colors"
                >
                  Request a new link
                </Link>
              </div>
            ) : done ? (
              <div className="text-center space-y-4" data-testid="reset-password-success">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-emerald-600">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                </div>
                <h1 className="text-2xl font-black text-zinc-900">Password updated!</h1>
                <p className="text-sm text-zinc-500">Your password has been changed. You can now sign in with your new password.</p>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-colors"
                >
                  Sign in
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h1 className="text-2xl font-black text-zinc-900 mb-1">Set a new password</h1>
                  <p className="text-sm text-zinc-500">Choose a strong password for your account.</p>
                </div>

                <form onSubmit={onSubmit} className="space-y-5">
                  {/* New password */}
                  <div>
                    <label htmlFor="rp-password" className="block text-sm font-bold text-zinc-900 mb-2">
                      New password
                    </label>
                    <div className="relative">
                      <input
                        id="rp-password"
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        placeholder="••••••••"
                        data-testid="input-new-password"
                        className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 pr-12 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                        aria-label={showPw ? "Hide password" : "Show password"}
                      >
                        {showPw ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Password rules */}
                    {password.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {RULES.map((rule) => {
                          const pass = rule.pass(password);
                          return (
                            <li key={rule.label} className={`flex items-center gap-2 text-xs transition-colors ${pass ? "text-emerald-600" : "text-zinc-400"}`}>
                              {pass ? (
                                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                                </svg>
                              ) : (
                                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 opacity-40">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                                </svg>
                              )}
                              {rule.label}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label htmlFor="rp-confirm" className="block text-sm font-bold text-zinc-900 mb-2">
                      Confirm password
                    </label>
                    <input
                      id="rp-confirm"
                      type={showPw ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="••••••••"
                      data-testid="input-confirm-password"
                      className={`w-full rounded-2xl border-2 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors ${
                        confirm.length > 0
                          ? passwordsMatch
                            ? "border-emerald-400 focus:border-emerald-400"
                            : "border-red-300 focus:border-red-400"
                          : "border-zinc-200 focus:border-red-400"
                      }`}
                    />
                    {confirm.length > 0 && !passwordsMatch && (
                      <p className="mt-1.5 text-xs text-red-500">Passwords do not match.</p>
                    )}
                  </div>

                  {err && (
                    <p className="text-red-500 text-sm font-medium" role="alert">{err}</p>
                  )}

                  <button
                    type="submit"
                    disabled={busy || !allRulesPass || !passwordsMatch}
                    data-testid="btn-set-password"
                    className="w-full inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? "Saving…" : "Set new password"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
