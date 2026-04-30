// web/pages/tradesman/unlock/sent.tsx
//
// Confirmation page after a tradesperson pays the per-project unlock fee.
// Bare layout (no SiteHeader); follows the visual contract of the most
// recent tradesman pages (e.g. /tradesman/matches): full-bleed white,
// BrandWordmark left + hamburger right, emoji hero, rounded-2xl buttons.
//
// Under the boost-slot model, payment creates a 'pending' swipe_interest
// row - the homeowner still has to right-swipe to form the match. This
// page explains what happens next and routes the trade back to the deck.

import { useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import TradesmanOnly from "@/components/TradesmanOnly";
import BrandWordmark from "@/components/BrandWordmark";
import { useMobileMenu } from "@/utils/mobileMenu";

export default function UnlockSentPage() {
  const router = useRouter();
  const { openMenu } = useMobileMenu();

  // Wipe any stashed returnTo so a session restart from this page lands
  // the trade back on the swipe deck, not on this confirmation screen.
  useEffect(() => {
    try {
      sessionStorage.removeItem("vmb:returnTo");
      sessionStorage.removeItem("vmb:lastNonAuth");
      sessionStorage.setItem("vmb:returnTo", "/tradesman/jobs");
      sessionStorage.setItem("vmb:lastNonAuth", "/tradesman/jobs");
    } catch {
      /* noop */
    }
  }, []);

  return (
    <TradesmanOnly>
      <Head>
        <title>Interest sent - VetMyBuilder</title>
      </Head>

      <main
        className="fixed inset-0 bg-white overflow-y-auto text-gray-900"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
        data-testid="tradesman-unlock-sent"
      >
        <div style={{ height: "env(safe-area-inset-top)" }} />

        {/* Top bar - same pattern as /tradesman/matches */}
        <div className="px-5 pt-3 pb-3 flex items-center justify-between">
          <Link
            href="/tradesman/jobs"
            aria-label="Back to jobs"
            className="inline-flex items-center"
          >
            <BrandWordmark tone="emerald" />
          </Link>
          <button
            type="button"
            aria-label="Open menu"
            onClick={openMenu}
            className="w-[38px] h-[38px] rounded-full bg-gray-100 flex items-center justify-center text-gray-700"
          >
            <span aria-hidden className="text-[18px] leading-none">
              ≡
            </span>
          </button>
        </div>

        {/* Hero - emoji + headline + lead */}
        <section className="px-6 pt-5 pb-4 text-center">
          <div className="text-[34px] leading-none mb-2.5" aria-hidden>
            🎯
          </div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] leading-[1.15] text-gray-900">
            Interest sent
          </h1>
          <p className="mt-2.5 mx-4 text-[14px] text-gray-500 leading-[1.5]">
            Your card just landed at the top of the homeowner's shortlist
            with a{" "}
            <span className="font-bold text-emerald-700">Wants this job</span>{" "}
            badge. They'll see your profile and your message.
          </p>
        </section>

        {/* What happens next */}
        <div className="px-5 space-y-2.5 mb-6">
          <Step
            num={1}
            title="They review your card"
            body="The homeowner sees your card next time they open the shortlist."
            done
          />
          <Step
            num={2}
            title="You get a notification on a match"
            body="If they swipe right, the chat opens for both of you and you'll see it under Matches."
            done
          />
          <Step
            num={3}
            title="Boost lasts 14 days"
            body="If they don't respond by then, the slot expires. No action needed from you."
          />
        </div>

        {/* Actions */}
        <div className="px-5 pb-10 space-y-2.5">
          <button
            type="button"
            onClick={() => router.push("/tradesman/jobs")}
            className="w-full bg-emerald-600 hover:bg-emerald-700 transition-colors text-white text-[15px] font-extrabold rounded-2xl"
            style={{ padding: "14px 0" }}
            data-testid="cta-browse-more-jobs"
          >
            Browse more jobs
          </button>
          <button
            type="button"
            onClick={() => router.push("/tradesman/matches")}
            className="w-full bg-white border border-gray-200 hover:border-gray-400 transition-colors text-gray-900 text-[14.5px] font-extrabold rounded-2xl"
            style={{ padding: "13px 0" }}
            data-testid="cta-view-matches"
          >
            View my matches
          </button>
        </div>
      </main>
    </TradesmanOnly>
  );
}

function Step({
  num,
  title,
  body,
  done,
}: {
  num: number;
  title: string;
  body: string;
  done?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white border border-gray-200 p-3.5">
      <div
        className={`w-7 h-7 shrink-0 rounded-full text-white flex items-center justify-center font-extrabold text-[12px] ${
          done ? "bg-emerald-500" : "bg-gray-300"
        }`}
      >
        {num}
      </div>
      <div>
        <div className="text-[14px] font-extrabold text-gray-900 leading-tight">
          {title}
        </div>
        <div className="text-[12.5px] text-gray-600 leading-relaxed mt-0.5">
          {body}
        </div>
      </div>
    </div>
  );
}
