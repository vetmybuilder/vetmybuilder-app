// web/pages/signup/complete.tsx
// Post-OAuth profile completion page.
//
// Reached by users who signed in via a social provider (currently Google)
// but don't yet have a complete homeowner profile in MySQL - specifically,
// they're missing a postcode. We only ask for the postcode here; first/last
// name and username are derived server-side from the Google token claims
// (`name` and `email`) by POST /api/account.

import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import { flushPendingProject } from "@/utils/flushPendingProject";
import LocationField from "@/components/forms/LocationField";

type FieldErrors = Partial<Record<"location", string>>;

export default function SignupComplete() {
  const router = useRouter();
  const api = useApi();
  const { user, loading: authLoading, refreshProfile } = useAuth();

  const [location, setLocation] = useState("");
  const [betaCode, setBetaCode] = useState("");
  const [betaRequired, setBetaRequired] = useState(false);
  const [betaCodeErr, setBetaCodeErr] = useState<string | null>(null);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  // Redirect away if not signed in
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // If this user is mid-way through a tradesman signup, they ended up
    // here because some other gate bounced them - deflect to the
    // tradesman onboarding wizard so we don't ask a tradesperson to fill
    // in a homeowner postcode.
    try {
      if (
        sessionStorage.getItem("vmb:tradesmanSignupInProgress") === "1"
      ) {
        router.replace("/tradesman/signup/complete");
      }
    } catch {}
  }, [authLoading, user, router]);

  useEffect(() => {
    api
      .get("/api/auth/beta-status")
      .then((res) => setBetaRequired(!!res.data?.required))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill the postcode if /api/me already has one (e.g. user landed here
  // by mistake) and bounce them out if onboarding is already complete.
  useEffect(() => {
    if (authLoading || !user) return;

    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/api/me");
        if (!alive) return;

        setLocation(data?.locationRaw || "");

        // Already complete? Bounce them to wherever they came from. Use the
        // dedicated `vmb:oauthReturnTo` key (NOT vmb:returnTo) - see the
        // OAuthSignInButton comment for why.
        if (data?.postcodeOutward) {
          let target = "/projects";
          try {
            const stored = sessionStorage.getItem("vmb:oauthReturnTo");
            if (stored && stored.startsWith("/")) target = stored;
            sessionStorage.removeItem("vmb:oauthReturnTo");
          } catch {}
          router.replace(target);
          return;
        }
      } catch {
        // Non-fatal - user can still fill the form manually
      } finally {
        if (alive) setHydrating(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [authLoading, user, api, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setFieldErrors({});
    setBetaCodeErr(null);

    if (!location.trim()) {
      setFieldErrors({ location: "Postcode or city is required." });
      setErr("Please enter your postcode or city.");
      return;
    }

    if (betaRequired) {
      const code = (betaCode || "").trim();
      if (!code) {
        setBetaCodeErr("Beta access code is required.");
        setErr("Please enter your beta access code.");
        return;
      }
      try {
        await api.post("/api/auth/check-email", {
          email: user?.email || "",
          betaCode: code,
        });
      } catch (ex: any) {
        const errCode = ex?.response?.data?.error || "";
        if (errCode === "invalid_beta_code") {
          setBetaCodeErr("Invalid beta access code.");
          setErr("Invalid beta access code.");
          return;
        }
      }
    }

    setLoading(true);
    try {
      await api.post("/api/account", {
        location: location.trim(),
      });

      // Set the push-prompt flag BEFORE refreshProfile so that when
      // profileComplete flips to true, PushPromptMount's effect picks
      // it up on the same tick. Setting it after refreshProfile would
      // miss the trigger (effect already ran with no flag).
      try {
        if ("Notification" in window && !localStorage.getItem("vmb:pushSetupShown")) {
          sessionStorage.setItem("vmb:showPushPrompt", "1");
        }
      } catch {}

      // Re-hydrate the auth context so profileComplete flips to true and the
      // header swaps from the minimal "finishing signup" state to the full
      // logged-in chrome before we navigate away.
      await refreshProfile();

      // Flush a pending project payload (guest started the wizard at
      // /projects/new, hit submit, then completed signup via Google SSO).
      // See utils/flushPendingProject.ts for the contract.
      const pendingTarget = await flushPendingProject(api);

      // Read the dedicated OAuth return-to (NOT vmb:returnTo, which can be
      // poisoned by _app.tsx's auto-stash). Pending project takes
      // priority over the OAuth return-to.
      let target = pendingTarget || "/projects";
      try {
        const stored = sessionStorage.getItem("vmb:oauthReturnTo");
        if (stored && stored.startsWith("/") && !pendingTarget) target = stored;
        sessionStorage.removeItem("vmb:oauthReturnTo");
      } catch {}
      router.replace(target);
    } catch (e: any) {
      const status = e?.response?.status;
      const body = e?.response?.data;

      if (status === 400 && body?.fieldErrors) {
        setFieldErrors(body.fieldErrors as FieldErrors);
        setErr(body?.message || "Please enter your postcode or city.");
      } else {
        setErr(body?.message || "Could not save your profile. Please try again.");
      }
      setLoading(false);
    }
  }

  if (authLoading || hydrating) return null;

  return (
    <>
      <Head>
        <title>Complete your profile - VetMyBuilder</title>
      </Head>

      <div className="fixed inset-0 top-14 bg-white overflow-y-auto">
        <div
          className="mx-auto max-w-md px-5 pt-6 pb-16"
          data-testid="signup-complete-page"
        >
          {/* Heading block - VMB wordmark already shown by SiteHeader */}
          <div className="mb-6">
            <h1
              className="text-[28px] font-extrabold tracking-[-0.01em] text-slate-900 leading-[1.1]"
              id="signup-complete-title"
            >
              Almost there
            </h1>
            <p className="mt-2 text-[13.5px] text-slate-500 leading-snug">
              Just one more thing - what&apos;s your postcode? We use it to match
              you with tradespeople near you.
            </p>
          </div>

          <form
            className="grid gap-5"
            onSubmit={onSubmit}
            noValidate
            aria-label="Complete profile form"
            data-testid="signup-complete-form"
          >
            {betaRequired && (
              <div>
                <label
                  htmlFor="beta-code"
                  className="block text-[12px] font-extrabold uppercase tracking-wide text-slate-700 mb-2"
                >
                  Beta access code <span className="text-amber-600">*</span>
                </label>
                <input
                  id="beta-code"
                  type="text"
                  value={betaCode}
                  onChange={(e) => {
                    setBetaCode(e.target.value);
                    if (betaCodeErr) setBetaCodeErr(null);
                  }}
                  placeholder="Enter your beta access code"
                  className={`w-full rounded-2xl border-2 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                    betaCodeErr
                      ? "border-red-400 focus:border-red-400 focus:ring-red-500/15"
                      : "border-slate-200 focus:border-indigo-400 focus:ring-indigo-500/15"
                  }`}
                  data-testid="input-beta-code"
                />
                {betaCodeErr && (
                  <p
                    className="mt-1 text-sm font-medium text-red-600"
                    role="alert"
                    data-testid="beta-code-error"
                  >
                    {betaCodeErr}
                  </p>
                )}
              </div>
            )}

            <div>
              <LocationField
                id="complete-loc"
                label="Postcode or City/Borough"
                placeholder="e.g., E4, N17, Chingford"
                value={location}
                onChange={(v, meta) => {
                  if (meta) {
                    const token =
                      meta.outward || meta.sector || meta.postcode || v;
                    setLocation(token);
                  } else {
                    setLocation(v);
                  }
                }}
                dataTestId="complete-complete-loc"
                reasonText=""
                error={fieldErrors.location}
              />
              {fieldErrors.location && (
                <p
                  className="mt-1 text-sm font-medium text-red-600"
                  role="alert"
                  data-testid="complete-complete-loc-error"
                >
                  {fieldErrors.location}
                </p>
              )}
            </div>

            <label
              className="flex items-start gap-2.5 cursor-pointer"
              data-testid="agree-terms"
            >
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-500 leading-relaxed">
                By signing up, I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-indigo-700 font-semibold hover:underline">
                  Terms of Use
                </Link>
                {" "}and{" "}
                <Link href="/acceptable-use" target="_blank" className="text-indigo-700 font-semibold hover:underline">
                  Acceptable Use Policy
                </Link>.
              </span>
            </label>

            {err && (
              <p
                className="text-sm font-medium text-red-600"
                role="alert"
                data-testid="signup-complete-error"
              >
                {err}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !agreedTerms}
              className="mt-1 w-full inline-flex items-center justify-center rounded-2xl px-7 py-4 text-[15px] sm:text-base font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
              style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
              data-testid="btn-signup-complete"
            >
              {loading ? "Saving..." : "Finish sign up"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
