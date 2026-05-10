// web/pages/signup.tsx
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import SignupForm from "@/components/forms/SignupForm";
import GuestOnly from "@/components/GuestOnly";

const PENDING_KEY = "vmb:pendingProjectPayload";

export default function Signup() {
  const router = useRouter();
  const [discardOpen, setDiscardOpen] = useState(false);

  // When a guest fills the wizard then clicks the trade rail instead of
  // signing up as a homeowner, intercept and confirm. Without this the
  // pending payload silently dies on tab close and they wonder where
  // their job went.
  function handleTradeRailClick(e: React.MouseEvent) {
    let hasPending = false;
    try {
      hasPending = !!sessionStorage.getItem(PENDING_KEY);
    } catch {}
    if (!hasPending) return; // no draft to lose - let the link fire normally
    e.preventDefault();
    setDiscardOpen(true);
  }

  function discardAndContinue() {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {}
    router.push("/tradesman/register-tradesmen");
  }

  return (
    <GuestOnly>
      <>
      <Head>
        <title>Create account - VetMyBuilder</title>
        <meta name="description" content="Create your free VetMyBuilder homeowner account." />
      </Head>

      <div className="fixed inset-0 top-14 bg-white overflow-y-auto">
        <div
          className="mx-auto max-w-md md:max-w-4xl px-5 pt-6 pb-16 md:flex md:items-start md:gap-10"
          data-testid="register-page"
        >
          {/* Form column */}
          <div className="md:flex-1 md:max-w-md">
            {/* Heading block - VMB wordmark already shown by SiteHeader */}
            <div className="mb-6">
              <h1
                className="text-[28px] font-extrabold tracking-[-0.01em] text-slate-900 leading-[1.1]"
                id="register-title"
                data-testid="register-title"
              >
                Find your tradesperson
              </h1>
              <p className="mt-2 text-[13.5px] text-slate-500 leading-snug">
                Free for homeowners. Takes a minute.
              </p>
            </div>

            <SignupForm />
          </div>

          {/* Right rail: trade banner + brand photo card. The photo is a
              placeholder slot that can be swapped for an MPU ad later. */}
          <div className="md:w-72 md:shrink-0 mt-8 md:mt-20 space-y-4">
            <Link
              href="/tradesman/register-tradesmen"
              onClick={handleTradeRailClick}
              className="block rounded-2xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 transition-colors p-4 md:p-5"
              data-testid="signup-trade-banner"
            >
              <div className="flex md:flex-col items-center md:items-start gap-3 md:gap-4 md:text-left text-left">
                <span
                  aria-hidden
                  className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-white text-lg md:text-xl shrink-0"
                  style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                >
                  🔧
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">
                    New tradesperson?
                  </div>
                  <div className="font-extrabold text-[15px] md:text-[17px] text-slate-900 leading-snug">
                    Register your business
                  </div>
                  <p className="hidden md:block mt-2 text-[13px] text-slate-600 leading-relaxed">
                    Win local work without paying per lead. No commission.
                  </p>
                  <span className="hidden md:inline-flex mt-3 items-center gap-1 text-emerald-700 font-bold text-sm">
                    Get started <span aria-hidden>→</span>
                  </span>
                </div>
                <span className="md:hidden text-emerald-600 text-xl shrink-0" aria-hidden>→</span>
              </div>
            </Link>

            {/* Brand mood photo. Hidden on mobile to avoid pushing the trade
                banner further down. Easy to swap for an MPU ad slot later. */}
            <div
              className="hidden md:block rounded-2xl overflow-hidden shadow-sm aspect-[4/5] bg-cover bg-center"
              data-testid="signup-side-rail-photo"
              style={{
                backgroundImage:
                  "url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80&auto=format&fit=crop')",
              }}
              role="img"
              aria-label="A bright, freshly renovated home interior"
            />
          </div>
        </div>
      </div>

      {discardOpen && (
        <div
          className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-title"
          data-testid="discard-pending-modal"
        >
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl">
            <h2
              id="discard-title"
              className="text-[20px] font-black tracking-tight text-slate-900"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              You have an unposted job
            </h2>
            <p className="mt-2 text-[13.5px] text-slate-600 leading-relaxed">
              Sign up as a homeowner to post it, or continue as a
              tradesperson and discard the job.
            </p>
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => setDiscardOpen(false)}
                className="w-full inline-flex items-center justify-center py-3 rounded-2xl text-white font-extrabold text-[14px] shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                  boxShadow: "0 8px 22px rgba(99,102,241,0.3)",
                }}
                data-testid="discard-stay"
              >
                Stay and post my job
              </button>
              <button
                type="button"
                onClick={discardAndContinue}
                className="w-full inline-flex items-center justify-center py-3 rounded-2xl bg-white border-[1.5px] border-emerald-300 text-emerald-700 font-extrabold text-[13.5px] hover:bg-emerald-50 transition-colors"
                data-testid="discard-continue"
              >
                Continue as a tradesperson
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    </GuestOnly>
  );
}
