// web/components/tradesmen/JobDetailsSheet.tsx
//
// Bottom sheet shown when a tradesman taps a row on /tradesman/jobs/list.
// It's the single surface that lets them decide how to engage with a
// specific job:
//   - Subscribe (recommended primary CTA) -> opens SwipePayGate
//     ("Reply to homeowner") in the parent page
//   - Pitch this homeowner now (secondary, one-off) -> unlock-contact
//     checkout, then route to /chat/:matchId where the paid unlock has
//     created a matched thread.
//
// Subscribers don't see the dual CTA - they get a "you're already
// subscribed, swipe right" panel instead. This means the sheet doubles
// as the post-subscription engagement nudge as well.
//
// Pure presentational + a small fetch on open (`/api/projects/:id`) to
// get the live unlock price for this project. All actions are bubbled
// to the parent via props.

import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";
import { parseDescriptionPills } from "@/utils/projectDescription";

export interface JobSheetSubject {
  projectId: number;
  title: string;
}

export default function JobDetailsSheet({
  subject,
  open,
  isSubscribed,
  onClose,
  onSubscribe,
  onPitch,
  onSwipe,
}: {
  subject: JobSheetSubject | null;
  open: boolean;
  /** When true the sheet shows the subscriber-info panel instead of the
   *  dual CTA. The list page passes this in from the same
   *  /api/subscriptions/me check the subscribed-builder hint uses. */
  isSubscribed: boolean;
  onClose: () => void;
  onSubscribe: () => void;
  onPitch: (projectId: number) => Promise<void> | void;
  onSwipe: (projectId: number) => void;
}) {
  const api = useApi();

  const [details, setDetails] = useState<{
    description: string;
    pills: { label: string; value: string }[];
    aiSummary: string | null;
    unlockPricePence: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [pitchBusy, setPitchBusy] = useState(false);

  useEffect(() => {
    if (!open || !subject) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // The /unlock-preview endpoint was retired with the inbox.
        // Read the project + unlock price directly from /api/projects/:id.
        const { data } = await api.get(`/api/projects/${subject.projectId}`);
        const preview = {
          project: data?.project,
          unlockPrice: data?.unlockPrice ?? 0,
        };
        if (cancelled) return;

        // Project view shapes vary; tolerate either flat or { project: {...} }
        const proj = preview?.project ?? preview ?? {};
        const description = proj.description || "";
        const pills = parseDescriptionPills(description);
        const aiSummary =
          proj.aiSummary ||
          proj.classification?.summary ||
          null;

        setDetails({
          description,
          pills,
          aiSummary,
          unlockPricePence: Number(preview?.unlockPrice || 0),
        });
      } catch {
        if (!cancelled) setDetails(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, subject, api]);

  if (!open || !subject) return null;

  // Homeowner name is intentionally never surfaced pre-match. The API
  // doesn't send it on /api/projects/:id and the deck/list endpoints
  // null it out, so we hardcode the generic label here.
  const homeownerName = "the homeowner";
  const unlockPriceLabel =
    details?.unlockPricePence && details.unlockPricePence > 0
      ? `£${(details.unlockPricePence / 100).toFixed(2)}`
      : "£4.99";

  async function handlePitch() {
    if (!subject || pitchBusy) return;
    setPitchBusy(true);
    try {
      await onPitch(subject.projectId);
    } finally {
      setPitchBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      data-testid="job-details-sheet"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-3 pb-6 max-h-[90vh] overflow-y-auto shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
      >
        {/* Grabber */}
        <div className="w-9 h-1 rounded-full bg-gray-300 mx-auto mb-3" />

        <div className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-gray-400">
          Job details
        </div>
        <h2 className="mt-1 text-[18px] font-extrabold leading-tight text-gray-900">
          {subject.title}
        </h2>

        {loading ? (
          <div className="mt-6 text-center text-[13px] text-gray-400">
            Loading…
          </div>
        ) : (
          <>
            {(details?.pills?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {details!.pills.map((p, i) => (
                  <span
                    key={`${p.label}-${i}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-bold"
                  >
                    <span className="text-gray-400 mr-1 font-semibold">
                      {p.label}:
                    </span>
                    {p.value}
                  </span>
                ))}
              </div>
            )}

            {details?.aiSummary && (
              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-emerald-700 mb-1">
                  ✨ Job summary
                </div>
                <p className="text-[12.5px] text-gray-800 leading-[1.5]">
                  {details.aiSummary}
                </p>
              </div>
            )}

            {details?.description && (details.pills?.length ?? 0) === 0 && (
              <p className="mt-3 text-[12.5px] text-gray-700 leading-[1.5] whitespace-pre-line">
                {details.description}
              </p>
            )}

            {/* Engagement panel - subscribers vs non-subscribers */}
            <div className="mt-5">
              {isSubscribed ? (
                <SubscriberPanel
                  homeownerName={homeownerName}
                  onSwipe={() => {
                    onSwipe(subject.projectId);
                    onClose();
                  }}
                />
              ) : (
                <NonSubscriberPanel
                  homeownerName={homeownerName}
                  unlockPriceLabel={unlockPriceLabel}
                  pitchBusy={pitchBusy}
                  onSubscribe={onSubscribe}
                  onPitch={handlePitch}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SubscriberPanel({
  homeownerName,
  onSwipe,
}: {
  homeownerName: string;
  onSwipe: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{
        background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
        borderColor: "#a7f3d0",
      }}
    >
      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-3 text-xl">
        🤝
      </div>
      <h3 className="text-[15px] font-extrabold text-emerald-700">
        You're already subscribed
      </h3>
      <p className="mt-1 text-[12.5px] text-gray-700 leading-snug">
        Swipe right on this job - you'll chat free with {homeownerName} as soon
        as they pick you back. No extra payment needed.
      </p>
      <button
        type="button"
        onClick={onSwipe}
        className="w-full mt-4 py-3 rounded-xl bg-emerald-600 text-white font-extrabold text-[14px]"
      >
        Open in swipe deck →
      </button>
    </div>
  );
}

function NonSubscriberPanel({
  homeownerName,
  unlockPriceLabel,
  pitchBusy,
  onSubscribe,
  onPitch,
}: {
  homeownerName: string;
  unlockPriceLabel: string;
  pitchBusy: boolean;
  onSubscribe: () => void;
  onPitch: () => void;
}) {
  return (
    <>
      <div className="text-center text-[10px] font-extrabold uppercase tracking-[0.08em] text-gray-400 mb-3">
        Want to talk to {homeownerName}?
      </div>

      {/* Recommended: subscription */}
      <div className="relative rounded-xl border-2 border-indigo-600 p-4 mb-3">
        <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[9.5px] font-extrabold uppercase tracking-wider">
          Recommended
        </span>
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">
          Best for regular work
        </div>
        <div className="text-[20px] font-extrabold leading-none">
          £3.99
          <span className="text-[12px] font-semibold text-gray-500"> / week</span>
        </div>
        <ul className="mt-2 space-y-0.5 text-[11.5px] text-gray-700">
          <li>✓ Unlimited swipes &amp; matches</li>
          <li>✓ Free chat on every match</li>
        </ul>
        <button
          type="button"
          onClick={onSubscribe}
          className="w-full mt-3 py-2.5 rounded-xl bg-indigo-600 text-white font-extrabold text-[13px]"
        >
          Subscribe — Week / £3.99
        </button>
      </div>

      {/* One-off pitch */}
      <div className="rounded-xl border border-gray-200 p-4">
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">
          One-off
        </div>
        <div className="text-[20px] font-extrabold leading-none">
          {unlockPriceLabel}
          <span className="text-[12px] font-semibold text-gray-500"> · this job</span>
        </div>
        <ul className="mt-2 space-y-0.5 text-[11.5px] text-gray-700">
          <li>✓ Send {homeownerName} a pitch right now</li>
          <li>✓ Skip the swipe-and-wait</li>
        </ul>
        <button
          type="button"
          onClick={onPitch}
          disabled={pitchBusy}
          className="w-full mt-3 py-2.5 rounded-xl bg-white border-2 border-indigo-100 text-indigo-700 font-extrabold text-[13px] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pitchBusy
            ? "Unlocking…"
            : `Pitch ${homeownerName} — ${unlockPriceLabel}`}
        </button>
      </div>
    </>
  );
}
