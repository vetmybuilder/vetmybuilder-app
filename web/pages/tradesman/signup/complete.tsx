// web/pages/tradesman/signup/complete.tsx
// Post-OAuth profile completion page for tradesmen.
//
// Reached by users who signed in via Google on the tradesman login page
// but don't yet have a tradesman profile. Collects company name, trade
// types, and service areas, then POSTs to /api/tradesmen/join.

import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import TradePicker from "@/components/TradePicker";
import ServiceAreaPicker from "@/components/ServiceAreaPicker";

export default function TradesmanSignupComplete() {
  const router = useRouter();
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  const [companyName, setCompanyName] = useState("");
  const [tradeTypes, setTradeTypes] = useState<string[]>([]);
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [betaRequired, setBetaRequired] = useState(false);
  const [betaCode, setBetaCode] = useState("");
  const [betaCodeError, setBetaCodeError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/api/auth/beta-status")
      .then(({ data }) => setBetaRequired(!!data.required))
      .catch(() => {});
  }, [api]);

  // Redirect away if not signed in
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/tradesman/login");
    }
  }, [authLoading, user, router]);

  // Check if tradesman profile already exists — if so, bounce to projects
  useEffect(() => {
    if (authLoading || !user) return;

    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        if (!alive) return;

        if (data?.profile) {
          router.replace("/tradesman/projects");
          return;
        }
      } catch {
        // Non-fatal — user can still fill the form
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

    if (!companyName.trim() || tradeTypes.length === 0 || serviceAreas.length === 0) {
      setErr("Please fill in all required fields.");
      return;
    }

    if (betaRequired && !betaCode.trim()) {
      setBetaCodeError("Access code is required.");
      setErr("Please enter your beta access code.");
      return;
    }

    setLoading(true);
    setBetaCodeError(null);
    try {
      await api.post("/api/tradesmen/join", {
        companyName: companyName.trim(),
        tradeTypes: tradeTypes.join(", "),
        serviceAreas: serviceAreas.join(", "),
        betaCode: betaRequired ? betaCode.trim() : undefined,
      });

      try {
        sessionStorage.removeItem("vmb:oauthRole");
        sessionStorage.setItem("vmb:isTradesman", "1");
      } catch {}

      window.location.replace("/tradesman/projects");
    } catch (e: any) {
      const status = e?.response?.status;
      const body = e?.response?.data;
      if (status === 403 && body?.error === "invalid_beta_code") {
        setBetaCodeError("Incorrect access code.");
        setErr("Invalid beta access code.");
      } else {
        setErr(body?.message || "Could not save your profile. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || hydrating) return null;

  return (
    <>
      <Head>
        <title>Complete your profile — VetMyBuilder</title>
      </Head>

      <div className="min-h-screen bg-stone-50 py-16">
        <div className="mx-auto max-w-2xl px-4" data-testid="tradesman-signup-complete-page">
          <div className="rounded-3xl bg-white p-8 shadow-xl shadow-zinc-200/60 sm:p-10">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">
              Almost there
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Tell us about your business so we can match you with the right
              homeowner projects.
            </p>

            <form
              className="mt-6 space-y-6"
              onSubmit={onSubmit}
              noValidate
              aria-label="Complete tradesman profile form"
              data-testid="tradesman-signup-complete-form"
            >
              <div>
                <label
                  className="block text-sm font-bold text-zinc-900 mb-2"
                  htmlFor="tradesman-complete-company"
                >
                  Company name
                </label>
                <input
                  id="tradesman-complete-company"
                  className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
                  placeholder="e.g., Smith & Sons Builders"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  data-testid="tradesman-complete-company"
                />
              </div>

              <TradePicker
                selected={tradeTypes}
                onChange={setTradeTypes}
              />

              <ServiceAreaPicker
                areas={serviceAreas}
                onChange={setServiceAreas}
              />

              {betaRequired && (
                <div>
                  <label
                    className="block text-sm font-bold text-zinc-900 mb-2"
                    htmlFor="tradesman-complete-beta-code"
                  >
                    Beta access code
                  </label>
                  <input
                    id="tradesman-complete-beta-code"
                    className={`w-full rounded-2xl border-2 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors ${
                      betaCodeError
                        ? "border-red-400 focus:border-red-400"
                        : "border-zinc-200 focus:border-red-400"
                    }`}
                    placeholder="Enter your beta access code"
                    type="text"
                    value={betaCode}
                    onChange={(e) => { setBetaCode(e.target.value); setBetaCodeError(null); }}
                    data-testid="input-beta-code"
                  />
                  {betaCodeError && (
                    <p className="mt-1 text-sm text-red-500" role="alert" data-testid="beta-code-error">
                      {betaCodeError}
                    </p>
                  )}
                </div>
              )}

              {err && (
                <p
                  className="text-sm font-medium text-red-500"
                  role="alert"
                  data-testid="tradesman-complete-error"
                >
                  {err}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                data-testid="btn-tradesman-complete"
              >
                {loading ? "Saving…" : "Finish sign up"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
