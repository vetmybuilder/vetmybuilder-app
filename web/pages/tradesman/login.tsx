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
import { Wrench, LogOut } from "lucide-react";
import { useAuth, signOutUser } from "@/utils/auth";
import { useApi } from "@/utils/api";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";

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
      } catch {
        // Not yet a tradesman - fall through to the interstitial below.
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

  const signOutAndStartOver = async () => {
    // Block the guest-redirect effect from firing once Firebase flips
    // user → null during signOutUser. We own the post-signout navigation.
    signingOutRef.current = true;
    setPhase("redirecting");
    try {
      await signOutUser();
    } catch {
      // Best effort - the hard nav below resets local state regardless.
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
        {/* Cream brand backdrop - matches /projects, /login, /404. */}
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>
      {phase === "interstitial" ? (
        <div
          className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-12 relative overflow-hidden"
          data-testid="tradesman-login-interstitial"
        >
          <BrandWatermarkScatter />
          <div className="relative z-10 mx-auto max-w-md px-5 pt-16 sm:pt-24 pb-8 flex flex-col min-h-full">
            <div className="rounded-3xl bg-white border border-amber-100 shadow-xl shadow-amber-100/40 p-7 sm:p-9">
              {/* Emerald avatar tile up top — anchors the card and signals
                  the trades brand at a glance. */}
              <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg shadow-emerald-500/25"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
              >
                <Wrench className="h-6 w-6" />
              </div>

              <div className="mb-7 text-center">
                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-1.5">
                  Tradesperson signup
                </div>
                <h1 className="text-[26px] font-black tracking-[-0.01em] text-slate-900 leading-[1.15]">
                  Pick up where you left off
                </h1>
                <p className="mt-2.5 text-[13.5px] text-slate-500 leading-snug">
                  Your trade signup isn't finished yet. Carry on from where you stopped.
                </p>
              </div>

              {/* Primary CTA - resume the trade signup */}
              <button
                type="button"
                onClick={continueAsTradesperson}
                data-testid="interstitial-continue-as-tradesperson"
                className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-extrabold text-[15px] tracking-tight shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
              >
                <Wrench className="h-4 w-4" />
                Continue trade signup
              </button>

              {/* Tertiary - sign out and start over (text only) */}
              <button
                type="button"
                onClick={signOutAndStartOver}
                data-testid="interstitial-sign-out"
                className="mt-5 w-full inline-flex items-center justify-center gap-1.5 text-[12.5px] font-bold text-slate-500 hover:text-slate-900 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out and start over
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 flex items-center justify-center"
          data-testid="tradesman-login-loading"
        >
          <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-emerald-600 animate-spin" />
          <span className="sr-only">Loading…</span>
        </div>
      )}
    </>
  );
}
