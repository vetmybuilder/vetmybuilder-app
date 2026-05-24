// web/pages/tradesman/register-tradesmen.tsx
//
// Trader signup entry point. Intentionally lean: this page only
// AUTHENTICATES the trader (Google or email + password). All company
// detail collection has moved to /tradesman/signup/complete so we
// have a single wizard surface for both Google and email signups.
//
// Flow:
//   - Click "Continue with Google" -> OAuth popup -> /tradesman/signup/complete
//   - Fill email + password + Create account -> Firebase user created
//     -> stamp role-intent -> /tradesman/signup/complete
//   - Already a member? -> /tradesman/login
//
// Replaces the previous 4-step inline wizard (which duplicated all the
// company fields with /tradesman/signup/complete and confused users
// into wondering why the same form appeared twice).

import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRole } from "@/utils/useRole";
import { trackRegisterStepCompleted } from "@/utils/analytics";
import OAuthSignInButton from "@/components/forms/OAuthSignInButton";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import { ensureEmailAvailable } from "@/utils/email";
import PasswordChecklist, {
  isStrongPassword,
} from "@/components/forms/PasswordChecklist";
import { initFirebase } from "@/utils/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";

export default function TradesmanRegisterPage() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useRole();

  // ---- already-signed-in routing ----
  // If a user is already authed, send them to the right place: an
  // active trader goes to the dashboard, a mid-signup trader goes to
  // the wizard, a homeowner goes to /projects. Guarded so we only
  // navigate once per mount (prevents the "Abort fetching component"
  // warning when useRole resolves after the first render).
  const redirectedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (authLoading || !user) return;
    if (busy) return;
    if (redirectedRef.current) return;
    let intent: string | null = null;
    try {
      intent = sessionStorage.getItem("vmb:oauthIntent");
    } catch {}
    if (intent === "tradesman") {
      redirectedRef.current = true;
      router.replace("/tradesman/signup/complete");
      return;
    }
    if (roleLoading) return;
    redirectedRef.current = true;
    router.replace(role === "tradesman" ? "/tradesman/jobs" : "/projects");
  }, [user, authLoading, router, role, roleLoading, busy]);

  // Stamp the trader intent as soon as we have an authed user on this
  // page so /api/tradesmen/me reflects them as tradesman_pending in
  // admin and feeds the header/footer/CTAs accordingly. See
  // server/routes/auth/role-intent.post.js for the receiver.
  useEffect(() => {
    if (authLoading || !user) return;
    api
      .post("/api/auth/role-intent", { role: "tradesman" })
      .catch(() => {});
  }, [user, authLoading, api]);

  // ---- email-signup state ----
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [betaCode, setBetaCode] = useState("");
  const [betaRequired, setBetaRequired] = useState(false);
  const [betaCodeErr, setBetaCodeErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  // Beta gate: trader signups are not gated pre-launch, so this should
  // always come back required:false. We still ask so any future
  // role-aware tweak lands cleanly here too.
  useEffect(() => {
    api
      .get("/api/auth/beta-status?role=trader")
      .then((res) => setBetaRequired(!!res.data?.required))
      .catch(() => {});
  }, [api]);

  const handleClose = () => {
    router.push("/");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    setEmailErr(null);
    setPwErr(null);
    setBetaCodeErr(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setEmailErr("Business email is required.");
      return;
    }
    if (!isStrongPassword(password)) {
      setPwErr(
        "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.",
      );
      return;
    }
    if (password !== confirm) {
      setPwErr("Passwords do not match.");
      return;
    }
    if (betaRequired && !betaCode.trim()) {
      setBetaCodeErr("Access code is required.");
      return;
    }

    setBusy(true);
    try {
      await ensureEmailAvailable(
        api,
        cleanEmail,
        betaRequired ? betaCode.trim() : undefined,
        "trader",
      );

      const auth = initFirebase();
      await createUserWithEmailAndPassword(auth, cleanEmail, password);

      // Stamp the trade role-intent so /api/tradesmen/me reports
      // role='tradesman' even before the wizard saves a profile.
      try {
        await api.post("/api/auth/role-intent", { role: "tradesman" });
      } catch {
        // Non-fatal - the wizard's own role-intent ping will retry.
      }
      trackRegisterStepCompleted(1, "tradesman");

      router.replace("/tradesman/signup/complete");
    } catch (ex: any) {
      const code = ex?.response?.data?.error || ex?.message || "";
      if (code === "invalid_beta_code") {
        setBetaCodeErr("Incorrect access code.");
      } else if (
        typeof code === "string" &&
        /email already|already exists|already in use/i.test(code)
      ) {
        setEmailErr("An account with this email already exists.");
      } else {
        setErr(code || "Sign up failed. Please try again.");
      }
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Register as a Tradesperson — VetMyBuilder</title>
        <meta
          property="og:title"
          content="Register as a Tradesperson — VetMyBuilder"
        />
        <meta
          property="og:description"
          content="The new home for tradespeople. Verified local jobs, direct chat with homeowners, no bidding wars."
        />
        <meta
          property="og:image"
          content="https://vetmybuilder.com/icon-512.png"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <style>{`body { background: #ffffff !important; }`}</style>
      </Head>

      <main
        className="bg-white min-h-screen relative overflow-hidden"
        data-testid="tradesman-register-page"
      >
        <BrandWatermarkScatter />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-8 md:py-20 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-center">
          {/* Form column - left on desktop, below photo on mobile. */}
          <div className="order-2 md:order-1">
            <h1
              className="text-[34px] md:text-[44px] font-black text-slate-900 leading-[1.05] tracking-tight"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Win more work,{" "}
              <span className="text-emerald-700">your way</span>.
            </h1>
            <p className="mt-3 text-[14px] text-slate-600">
              Built by a tradesperson, for tradespeople. Free to join. Takes about 2 minutes.
            </p>

            <div className="mt-7 rounded-2xl bg-slate-50 border border-slate-200 p-5 sm:p-6">
              <p className="text-[13px] font-bold text-slate-900 mb-3">Sign up - tradespeople</p>

              <OAuthSignInButton
                provider="google"
                intent="tradesman"
                onError={(msg) => setErr(msg)}
              />

              <div className="my-4 flex items-center gap-3 text-[10.5px] uppercase tracking-wider text-slate-400 font-bold">
                <div className="h-px flex-1 bg-slate-200" />
                <span>Or sign up with email</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

            <form onSubmit={onSubmit} className="space-y-3" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5"
                >
                  Business email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={`w-full rounded-xl border ${
                    emailErr ? "border-rose-400" : "border-slate-200"
                  } bg-white px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  data-testid="signup-email"
                />
                {emailErr && (
                  <p className="mt-1 text-[12px] text-rose-600" role="alert">
                    {emailErr}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={`w-full rounded-xl border ${
                    pwErr ? "border-rose-400" : "border-slate-200"
                  } bg-white px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  data-testid="signup-password"
                />
                {password && (
                  <div className="mt-2">
                    <PasswordChecklist password={password} />
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirm"
                  className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5"
                >
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  className={`w-full rounded-xl border ${
                    pwErr ? "border-rose-400" : "border-slate-200"
                  } bg-white px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  data-testid="signup-confirm"
                />
                {pwErr && (
                  <p className="mt-1 text-[12px] text-rose-600" role="alert">
                    {pwErr}
                  </p>
                )}
              </div>

              {betaRequired && (
                <div>
                  <label
                    htmlFor="betaCode"
                    className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5"
                  >
                    Access code
                  </label>
                  <input
                    id="betaCode"
                    type="text"
                    value={betaCode}
                    onChange={(e) => setBetaCode(e.target.value)}
                    placeholder="Your access code"
                    className={`w-full rounded-xl border ${
                      betaCodeErr ? "border-rose-400" : "border-slate-200"
                    } bg-white px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                    data-testid="signup-beta-code"
                  />
                  {betaCodeErr && (
                    <p className="mt-1 text-[12px] text-rose-600" role="alert">
                      {betaCodeErr}
                    </p>
                  )}
                </div>
              )}

              {err && (
                <p className="text-[13px] text-rose-600 font-medium" role="alert">
                  {err}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                data-testid="signup-submit"
                className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-extrabold text-white shadow-lg shadow-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>

              <p
                className="mt-4 text-center text-[12.5px] text-slate-500"
                data-testid="vendor-already-member"
              >
                Already a member?{" "}
                <Link
                  href="/login?next=/tradesman/jobs"
                  className="font-extrabold text-emerald-600 hover:underline"
                  data-testid="link-vendor-signin"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          {/* Photo column - right on desktop, top on mobile. */}
          <div className="order-1 md:order-2">
            <div className="relative rounded-2xl overflow-hidden shadow-lg aspect-[16/10] md:aspect-[4/5]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/job-images/plumbing.jpg"
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
