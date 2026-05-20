// web/pages/tradesman/unlock/sent.tsx
//
// Confirmation page after a tradesperson pays the per-project unlock fee.
// Mobile keeps the existing app-shell chrome; desktop renders the V2
// layout (cream + watermark + SiteHeader) with a left rail pinning the
// project the boost is on plus a 14-day countdown bar.
//
// Under the boost-slot model, payment creates a 'pending' swipe_interest
// row - the homeowner still has to right-swipe to form the match. This
// page explains what happens next and routes the trade back to the deck.

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import TradesmanOnly from "@/components/TradesmanOnly";
import SiteHeader from "@/components/SiteHeader";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import BrandWordmark from "@/components/BrandWordmark";
import { useApi } from "@/utils/api";
import { trackUnlockActivated } from "@/utils/analytics";
import { useMobileMenu } from "@/utils/mobileMenu";

const BOOST_DAYS = 14;

type ProjectContext = {
  title: string;
  type: string | null;
  outward: string | null;
  budget: string | null;
};

export default function UnlockSentPage() {
  const router = useRouter();
  const api = useApi();
  const { openMenu } = useMobileMenu();
  const [project, setProject] = useState<ProjectContext | null>(null);

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

  // Pull the project context from /api/projects/:id when the gate
  // navigated here with `?projectId=`. Used by the desktop left rail
  // to remind the trade WHICH job the boost is on. The page works
  // without it (rail just shows a generic "Boost active" panel).
  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.projectId;
    const v = Array.isArray(raw) ? raw[0] : raw;
    const projectId = Number(v);
    if (!Number.isFinite(projectId) || projectId <= 0) return;
    trackUnlockActivated(projectId, 0);

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${projectId}`);
        if (cancelled) return;
        const proj = data?.project ?? data ?? {};
        setProject({
          title: String(proj.name || proj.title || "Your pitched job"),
          type: proj.type || null,
          // /api/projects/:id already runs formatPostcode so this is outward only.
          outward: proj.location || null,
          budget:
            data?.classification?.price_band_estimate ||
            proj.priceBandEstimate ||
            null,
        });
      } catch {
        if (!cancelled) setProject(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.projectId, api]);

  const ends = new Date();
  ends.setDate(ends.getDate() + BOOST_DAYS);
  const endsLabel = ends.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <TradesmanOnly>
      <Head>
        <title>Interest sent - VetMyBuilder</title>
      </Head>

      {/* MOBILE - existing app-shell, unchanged. */}
      <main
        className="md:hidden fixed inset-0 bg-white overflow-y-auto text-gray-900"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
        data-testid="tradesman-unlock-sent"
      >
        <div style={{ height: "env(safe-area-inset-top)" }} />

        <div className="px-5 pt-3 pb-3 flex items-center justify-between">
          <Link
            href="/tradesman/jobs"
            aria-label="Back to jobs"
            className="inline-flex items-center"
          >
            <BrandWordmark tone="emerald" bg="light" />
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

        <section className="px-6 pt-5 pb-4 text-center">
          <div className="text-[34px] leading-none mb-2.5" aria-hidden>
            🎯
          </div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] leading-[1.15] text-gray-900">
            Interest sent
          </h1>
          <p className="mt-2.5 mx-4 text-[14px] text-gray-500 leading-[1.5]">
            Your card just landed at the top of the homeowner&rsquo;s shortlist
            with a{" "}
            <span className="font-bold text-emerald-700">Wants this job</span>{" "}
            badge. They&rsquo;ll see your profile and your message.
          </p>
        </section>

        <div className="px-5 space-y-2.5 mb-6">
          <MobileStep
            num={1}
            title="They review your card"
            body="The homeowner sees your card next time they open the shortlist."
            done
          />
          <MobileStep
            num={2}
            title="You get a notification on a match"
            body="If they swipe right, the chat opens for both of you and you'll see it under Matches."
            done
          />
          <MobileStep
            num={3}
            title={`Boost lasts ${BOOST_DAYS} days`}
            body="If no match, slot expires. No action needed from you."
          />
        </div>

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

      {/* DESKTOP - V2 layout: cream + watermark + SiteHeader, two-column
          with project context rail (with countdown) + main confirmation
          card. */}
      <div
        className="hidden md:block min-h-screen bg-[#fef6e9] relative overflow-hidden"
        data-testid="tradesman-unlock-sent"
      >
        <SiteHeader />
        <BrandWatermarkScatter />

        <div className="mx-auto max-w-5xl px-6 pb-12 relative z-10">
          <div className="text-center pt-8 pb-6">
            <div
              className="w-16 h-16 mx-auto rounded-full flex items-center justify-center text-white text-[30px] font-black"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
              aria-hidden
            >
              ✓
            </div>
            <h1
              className="mt-4 text-[28px] font-black tracking-tight text-slate-900 leading-tight"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              You&rsquo;re in front of{" "}
              <span
                className="text-emerald-600"
                style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
              >
                this homeowner
              </span>
            </h1>
            <p className="mt-2 text-[14px] text-slate-500 max-w-md mx-auto">
              Your card just landed at the top of their shortlist with a{" "}
              <span className="font-extrabold text-emerald-700">Wants this job</span>{" "}
              badge.
            </p>
          </div>

          <div className="grid md:grid-cols-[320px_1fr] gap-6 items-start">
            <DesktopProjectRail project={project} endsLabel={endsLabel} />

            <main className="bg-white border border-amber-100 rounded-3xl shadow-sm p-6">
              <h2
                className="text-[18px] font-black text-slate-900 mb-1"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                What happens next
              </h2>
              <p className="text-[12.5px] text-slate-500 mb-5">
                We&rsquo;ll let you know the moment the homeowner picks you back.
              </p>

              <ol className="space-y-3">
                <DesktopStep
                  num={1}
                  title="They review your card"
                  body="The homeowner sees your card next time they open the shortlist."
                  done
                />
                <DesktopStep
                  num={2}
                  title="You get a notification on a match"
                  body="If they swipe right, the chat opens for both of you and lands under Matches."
                  done
                />
                <DesktopStep
                  num={3}
                  title="If no match, slot expires"
                  body={`No action needed from you - boost ends ${endsLabel}.`}
                />
              </ol>

              <div className="mt-7 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => router.push("/tradesman/matches")}
                  className="px-4 py-3 rounded-2xl text-[13.5px] font-extrabold text-slate-700 bg-white border-2 border-slate-200 hover:border-emerald-300 transition-colors"
                  data-testid="cta-view-matches-desktop"
                >
                  View my matches
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/tradesman/jobs")}
                  className="px-4 py-3 rounded-2xl text-[13.5px] font-extrabold text-white shadow-md shadow-emerald-200 hover:brightness-105 active:brightness-95 transition-all"
                  style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                  data-testid="cta-browse-more-jobs-desktop"
                >
                  Browse more jobs →
                </button>
              </div>
            </main>
          </div>
        </div>
      </div>
    </TradesmanOnly>
  );
}

/* Desktop project rail with countdown. Falls back to a generic
   "Boost active" panel when projectId wasn't passed in the URL or the
   project lookup failed. */
function DesktopProjectRail({
  project,
  endsLabel,
}: {
  project: ProjectContext | null;
  endsLabel: string;
}) {
  const title = project?.title ?? "Your pitched job";

  return (
    <aside className="bg-white border border-amber-100 rounded-3xl overflow-hidden shadow-sm sticky top-6">
      <div
        className="px-5 py-4 text-white"
        style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
      >
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/80 mb-1">
          Boost active on
        </div>
        <h2
          className="text-[16px] font-black leading-tight"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          {title}
        </h2>
      </div>
      <div className="p-5 space-y-3">
        {project?.type && (
          <Row icon="🔧" label="Trade" value={project.type} />
        )}
        {project?.outward && (
          <Row icon="📍" label="Area" value={project.outward} />
        )}
        {project?.budget && (
          <Row icon="💷" label="Budget" value={project.budget} />
        )}

        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
              Boost ends
            </div>
            <span className="text-[12px] font-black text-emerald-700">
              {endsLabel}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600"
              style={{ width: "100%" }}
            />
          </div>
          <div className="mt-1.5 text-[10.5px] text-slate-500">
            Active for {BOOST_DAYS} days from today
          </div>
        </div>
      </div>
    </aside>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 text-[13px]">
      <span className="text-slate-400 shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </div>
        <div className="font-extrabold text-slate-800 truncate">{value}</div>
      </div>
    </div>
  );
}

function MobileStep({
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

function DesktopStep({
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
    <li className="flex items-start gap-3 rounded-2xl bg-stone-50 border border-stone-200 p-3.5">
      <div
        className={`w-7 h-7 shrink-0 rounded-full text-white flex items-center justify-center font-extrabold text-[12px] ${
          done ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        {done ? "✓" : num}
      </div>
      <div>
        <div className="text-[14px] font-extrabold text-slate-900 leading-tight">
          {title}
        </div>
        <div className="text-[12.5px] text-slate-600 leading-relaxed mt-0.5">
          {body}
        </div>
      </div>
    </li>
  );
}
