// web/pages/signup.tsx
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import SignupForm from "@/components/forms/SignupForm";
import GuestOnly from "@/components/GuestOnly";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";

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
        {/* Cream brand backdrop - matches /projects, /login, /404. */}
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      {/* SiteHeader is sticky and Layout's <main> already pads pt-14
          below it. The wrapper uses -mt-14 to extend its cream bg under
          the header (so scroll feels continuous on desktop) but pt-0 on
          mobile so the inner content sits immediately below the header
          instead of 56px down. */}
      <div className="bg-white md:bg-[#fef6e9] min-h-screen -mt-14 pt-0 md:pt-14 pb-0 md:pb-12 relative overflow-hidden">
        <BrandWatermarkScatter />
        {/* Mobile: edge-to-edge white surface so the cream chrome
            doesn't frame the form. Desktop: keep the card-on-cream
            chrome with the side rail. */}
        <div
          className="relative z-10 mx-auto max-w-none md:max-w-4xl px-0 md:px-5 pt-0 md:pt-6 pb-0 md:pb-16 md:flex md:items-start md:gap-10"
          data-testid="register-page"
        >
          <div className="md:flex-1 md:max-w-md">
            <div className="bg-white border-0 shadow-none px-5 pt-5 pb-6 md:rounded-3xl md:border md:border-amber-100 md:shadow-xl md:shadow-amber-100/40 md:p-8">
              {/* Compact mobile-first trade banner ABOVE the form so
                  guests who landed here by mistake (tradesperson, not
                  homeowner) see the right entry point without scrolling
                  past the whole signup form. Hidden on desktop where
                  the side rail covers the same role. */}
              <Link
                href="/tradesman/register-tradesmen"
                onClick={handleTradeRailClick}
                className="md:hidden flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 transition-colors p-3 mb-5"
                data-testid="signup-trade-banner-mobile"
              >
                <span
                  aria-hidden
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-base shrink-0"
                  style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                >
                  🔧
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-700">
                    New tradesperson?
                  </div>
                  <div className="font-extrabold text-[14px] text-slate-900 leading-tight">
                    Register your business
                  </div>
                </div>
                <span className="text-emerald-600 text-xl shrink-0" aria-hidden>→</span>
              </Link>

              <div className="mb-5 md:mb-6">
                <h1
                  className="text-[24px] md:text-[28px] font-extrabold tracking-[-0.01em] text-slate-900 leading-[1.1]"
                  id="register-title"
                  data-testid="register-title"
                >
                  Find your tradesperson
                </h1>
                <p className="mt-1.5 text-[13.5px] text-slate-500 leading-snug">
                  Free for homeowners. Takes a minute.
                </p>
              </div>

              <SignupForm />
            </div>
          </div>

          {/* Right rail (desktop only): trade banner + brand photo. */}
          <div className="hidden md:block md:w-72 md:shrink-0 md:mt-20 space-y-4">
            <Link
              href="/tradesman/register-tradesmen"
              onClick={handleTradeRailClick}
              className="block rounded-2xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 transition-colors p-5"
              data-testid="signup-trade-banner"
            >
              <div className="flex flex-col items-start gap-4 text-left">
                <span
                  aria-hidden
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl shrink-0"
                  style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                >
                  🔧
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">
                    New tradesperson?
                  </div>
                  <div className="font-extrabold text-[17px] text-slate-900 leading-snug">
                    Register your business
                  </div>
                  <p className="mt-2 text-[13px] text-slate-600 leading-relaxed">
                    Win local work without paying per lead. No commission.
                  </p>
                  <span className="inline-flex mt-3 items-center gap-1 text-emerald-700 font-bold text-sm">
                    Get started <span aria-hidden>→</span>
                  </span>
                </div>
              </div>
            </Link>

            {/* Brand mood photo. Easy to swap for an MPU ad slot later. */}
            <div
              className="rounded-2xl overflow-hidden shadow-sm aspect-[4/5] bg-cover bg-center"
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
