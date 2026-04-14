// web/pages/signup/complete.tsx
// Post-OAuth profile completion page.
//
// Reached by users who signed in via a social provider (currently Google)
// but don't yet have a complete homeowner profile in MySQL — specifically,
// they're missing a postcode. We only ask for the postcode here; first/last
// name and username are derived server-side from the Google token claims
// (`name` and `email`) by POST /api/account.

import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import LocationField from "@/components/forms/LocationField";

type FieldErrors = Partial<Record<"location", string>>;

export default function SignupComplete() {
  const router = useRouter();
  const api = useApi();
  const { user, loading: authLoading, refreshProfile } = useAuth();

  const [location, setLocation] = useState("");
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
    // here because some other gate bounced them — deflect to the
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
        // dedicated `vmb:oauthReturnTo` key (NOT vmb:returnTo) — see the
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
        // Non-fatal — user can still fill the form manually
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

    if (!location.trim()) {
      setFieldErrors({ location: "Postcode or city is required." });
      setErr("Please enter your postcode or city.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/account", {
        location: location.trim(),
      });

      // Re-hydrate the auth context so profileComplete flips to true and the
      // header swaps from the minimal "finishing signup" state to the full
      // logged-in chrome before we navigate away.
      await refreshProfile();

      // Read the dedicated OAuth return-to (NOT vmb:returnTo, which can be
      // poisoned by _app.tsx's auto-stash).
      let target = "/projects";
      try {
        const stored = sessionStorage.getItem("vmb:oauthReturnTo");
        if (stored && stored.startsWith("/")) target = stored;
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
        <div className="mx-auto max-w-md px-4" data-testid="signup-complete-page">
          <div className="rounded-3xl bg-white p-8 shadow-xl shadow-zinc-200/60 sm:p-10">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">
              Almost there
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Just one more thing — what's your postcode? We use it to match
              you with tradespeople near you.
            </p>

            <form
              className="mt-6 grid gap-4"
              onSubmit={onSubmit}
              noValidate
              aria-label="Complete profile form"
              data-testid="signup-complete-form"
            >
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
                    className="mt-1 text-sm font-medium text-red-500"
                    role="alert"
                    data-testid="complete-complete-loc-error"
                  >
                    {fieldErrors.location}
                  </p>
                )}
              </div>

              {err && (
                <p
                  className="text-sm font-medium text-red-500"
                  role="alert"
                  data-testid="signup-complete-error"
                >
                  {err}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                data-testid="btn-signup-complete"
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
