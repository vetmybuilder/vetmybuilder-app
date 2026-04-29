// web/pages/tradesman/login.tsx
//
// Entry point when a visitor clicks "Tradesperson" in the site header.
//
// Branches on auth state:
//   - Guest                           → /login?next=/tradesman/jobs
//   - Signed-in tradesperson          → /tradesman/jobs
//   - Signed-in completed homeowner   → /login?next=/tradesman/jobs
//   - Signed-in mid-homeowner signup  → render the interstitial below, so
//     the user can explicitly choose between continuing as a tradesperson,
//     finishing their homeowner signup, or signing out.

import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Wrench, User, LogOut } from "lucide-react";
import { useAuth, signOutUser } from "@/utils/auth";
import { useApi } from "@/utils/api";

type Phase = "hydrating" | "redirecting" | "interstitial";

export default function TradesmanLoginAlias() {
  const router = useRouter();
  const api = useApi();
  const { user, loading: authLoading, profileComplete } = useAuth();
  const [phase, setPhase] = useState<Phase>("hydrating");
  const signingOutRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    // Once the user has clicked "Sign out and start over", the Firebase
    // auth listener will fire a null user. Ignore that transition here —
    // the click handler is responsible for the subsequent navigation.
    if (signingOutRef.current) return;

    if (!user) {
      try {
        sessionStorage.setItem("vmb:returnTo", "/tradesman/jobs");
      } catch {}
      setPhase("redirecting");
      router.replace({
        pathname: "/login",
        query: { next: "/tradesman/jobs" },
      });
      return;
    }

    let alive = true;
    (async () => {
      // Check tradesperson status up-front so we can redirect without
      // waiting on profileComplete to settle — on some browsers profile
      // resolution takes long enough that a pure-tradesperson visitor
      // would stay stuck on the spinner.
      let isTradesman = false;
      try {
        const { data } = await api.get("/api/tradesmen/me");
        isTradesman =
          String(data?.role || "").toLowerCase() === "tradesman" ||
          !!data?.profile;
      } catch (e) {
        console.warn("[tradesman/login] /api/tradesmen/me failed", e);
      }
      if (!alive) return;

      if (isTradesman) {
        setPhase("redirecting");
        router.replace("/tradesman/jobs");
        return;
      }

      if (profileComplete === null) return; // wait for the next render

      if (profileComplete === true) {
        setPhase("redirecting");
        router.replace({
          pathname: "/login",
          query: { next: "/tradesman/jobs" },
        });
        return;
      }

      setPhase("interstitial");
    })();

    return () => {
      alive = false;
    };
  }, [authLoading, user, profileComplete, api, router]);

  const continueAsTradesperson = () => {
    try {
      sessionStorage.setItem("vmb:oauthIntent", "tradesman");
    } catch {}
    router.replace("/tradesman/signup/complete");
  };

  const finishHomeowner = () => {
    router.replace("/signup/complete");
  };

  const signOutAndStartOver = async () => {
    // Block the guest-redirect effect from firing once Firebase flips
    // user → null during signOutUser. We own the post-signout navigation.
    signingOutRef.current = true;
    setPhase("redirecting");
    try {
      await signOutUser();
    } catch (e) {
      console.warn("[tradesman/login] signOutUser failed", e);
    }
    if (typeof window !== "undefined") {
      window.location.replace("/?signedOut=1");
    }
  };

  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
        <title>Tradesperson • Vetmybuilder</title>
      </Head>
      {phase === "interstitial" ? (
        <div
          className="min-h-[70vh] flex items-center justify-center p-6"
          data-testid="tradesman-login-interstitial"
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg shadow-zinc-200/60 p-7 sm:p-9 space-y-6">
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                You haven&apos;t finished setting up your homeowner account
              </h1>
              <p className="text-sm text-zinc-600">
                You&apos;re currently in the middle of a homeowner signup.
                What would you like to do?
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={continueAsTradesperson}
                data-testid="interstitial-continue-as-tradesperson"
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 transition-colors"
              >
                <Wrench className="h-4 w-4" />
                Continue as a tradesperson
              </button>

              <button
                type="button"
                onClick={finishHomeowner}
                data-testid="interstitial-finish-homeowner"
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-sm shadow-indigo-600/25 hover:bg-indigo-500 transition-colors"
              >
                <User className="h-4 w-4" />
                Finish setting up my homeowner account
              </button>
            </div>

            <div className="pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={signOutAndStartOver}
                data-testid="interstitial-sign-out"
                className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out and start over
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="min-h-[50vh] flex items-center justify-center"
          data-testid="tradesman-login-loading"
        >
          <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-zinc-500 animate-spin" />
          <span className="sr-only">Loading…</span>
        </div>
      )}
    </>
  );
}
