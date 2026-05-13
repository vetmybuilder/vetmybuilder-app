// web/pages/projects/[id]/close.tsx
//
// Mobile full-screen close-project flow. Reached from the kebab on
// /projects/[id] -> "Mark project as completed". Desktop is unchanged: users
// are redirected back to the project page where the existing CloseProjectModal
// remains the close affordance.

import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Camera, Check, ChevronRight, Sparkles, X } from "lucide-react";

import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import CloseTradespersonPicker, {
  type PickedTradesperson,
} from "@/components/project/CloseTradespersonPicker";
import {
  StarRatingList,
  StarRow,
  EMPTY_RATINGS,
  type RatingsState,
} from "@/components/ratings/StarRatingList";

type Reason = {
  value: "budget" | "quote_too_high" | "no_show" | "tradesman_unavailable" | "other";
  label: string;
};

const REASONS: Reason[] = [
  { value: "budget", label: "Budget" },
  { value: "quote_too_high", label: "Quote too high" },
  { value: "no_show", label: "Tradesperson didn't show" },
  { value: "tradesman_unavailable", label: "Tradesperson unavailable" },
];

const MAX_PHOTOS = 20;
const MAX_PHOTO_MB = 10;

export default function CloseProjectPage() {
  return (
    <AuthedOnly>
      <CloseGate />
    </AuthedOnly>
  );
}

function CloseGate() {
  const router = useRouter();

  // Desktop fallback - redirect back to the project page where the existing
  // modal handles closing. We only want to expose the new mobile UI on small
  // viewports, matching the rest of the mobile redesign.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    if (mq.matches && router.isReady) {
      const id = router.query.id;
      if (id) router.replace(`/projects/${id}`);
    }
  }, [router]);

  return (
    <>
      <Head>
        <title>Close project - VetMyBuilder</title>
      </Head>
      <div className="md:hidden min-h-screen bg-white">
        <CloseInner />
      </div>
    </>
  );
}

function CloseInner() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { id } = router.query;
  const projectId = useMemo(() => Number(Array.isArray(id) ? id[0] : id), [id]);

  const [projectName, setProjectName] = useState<string>("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [didGoAhead, setDidGoAhead] = useState<boolean>(true);
  const [reasons, setReasons] = useState<Set<Reason["value"]>>(new Set());
  const [otherText, setOtherText] = useState("");
  const [winner, setWinner] = useState<PickedTradesperson | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // CR3 additions ─────────────────────────────────────────────
  // UI-only in this bite; server doesn't read these yet.
  const [satisfied, setSatisfied] = useState<"yes" | "no" | null>(null);
  const [ratings, setRatings] = useState<RatingsState>(EMPTY_RATINGS);
  const [overallRating, setOverallRating] = useState(0);
  // Default ON: boosting is the high-value action for both sides, so
  // the homeowner opts out rather than in.
  const [boostConsent, setBoostConsent] = useState(true);

  // Wipe the satisfaction sub-state when the homeowner changes who did
  // the work or toggles "didn't go ahead". Mirrors the desktop modal.
  useEffect(() => {
    setSatisfied(null);
    setRatings(EMPTY_RATINGS);
    setOverallRating(0);
    setBoostConsent(true);
  }, [winner, didGoAhead]);

  // Whether the satisfaction branch is meaningful for the current winner.
  // Off-platform hires have no profile to rate or boost.
  const askSatisfaction = !!winner && winner.kind !== "someone-else";

  // Load project for the headline
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !Number.isFinite(projectId))
      return;
    let alive = true;
    setLoading(true);
    setLoadErr(null);

    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${projectId}`);
        if (!alive) return;
        const p = data?.project;
        if (!p) {
          setLoadErr("Project not found.");
          return;
        }
        setProjectName(p.name || "this project");
      } catch (e: any) {
        if (!alive) return;
        setLoadErr(
          e?.response?.data?.error ||
            e?.message ||
            "Failed to load project.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, projectId, router.isReady, authLoading, user]);

  function toggleReason(v: Reason["value"]) {
    setReasons((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function toggleOther() {
    setReasons((prev) => {
      const next = new Set(prev);
      if (next.has("other")) {
        next.delete("other");
      } else {
        next.add("other");
      }
      return next;
    });
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    const incoming = Array.from(list);
    const merged = [...files];
    for (const f of incoming) {
      if (merged.length >= MAX_PHOTOS) break;
      if (f.size > MAX_PHOTO_MB * 1024 * 1024) continue;
      merged.push(f);
    }
    setFiles(merged);
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (didGoAhead) return true;
    return reasons.size > 0;
  }, [busy, didGoAhead, reasons]);

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setSubmitErr(null);
    try {
      const payload: Record<string, any> = {
        didGoAhead,
        reasons: didGoAhead ? [] : Array.from(reasons),
        otherReason:
          !didGoAhead && reasons.has("other") ? otherText.trim() || undefined : undefined,
      };

      if (didGoAhead && winner) {
        if (winner.kind === "rec") {
          payload.selectedRecommendationId = winner.id;
          payload.winnerRecommendationId = winner.id;
          payload.winnerRecId = winner.id;
          payload.winnerFromCommunity = !!winner.fromCommunity;
        } else if (winner.kind === "share" || winner.kind === "match") {
          payload.winnerTradesmanUid = winner.uid;
          payload.winner_tradesman_uid = winner.uid;
        } else if (winner.kind === "someone-else") {
          // Off-platform hire - server still marks the project completed.
          payload.winnerOther = true;
        }
      }

      // CR3: include satisfaction + boost only when the question was
      // actually asked (real tradesperson selected and homeowner
      // answered). Off-platform + "didn't go ahead" submit without it.
      if (askSatisfaction && satisfied !== null) {
        payload.satisfied = satisfied;
        if (satisfied === "yes") {
          payload.overallRating = overallRating;
          payload.boostConsent = boostConsent;
        } else {
          payload.ratings = ratings;
          payload.boostConsent = false;
        }
      }

      const { data } = await api.post(
        `/api/projects/${projectId}/close`,
        payload,
      );
      const newStatus =
        data?.project?.status === "completed" ? "completed" : "archived";

      // Best-effort photo upload AFTER the close succeeds.
      if (didGoAhead && files.length > 0) {
        const fd = new FormData();
        for (const f of files) fd.append("photos", f);
        try {
          await api.post(
            `/api/projects/${projectId}/close/photos`,
            fd,
            { headers: { "Content-Type": "multipart/form-data" } },
          );
        } catch {
          // photos are non-blocking - project is already closed.
        }
      }

      const params = new URLSearchParams({
        closed: newStatus,
        name: projectName,
      });
      router.replace(`/projects?${params.toString()}`);
    } catch (e: any) {
      setSubmitErr(
        e?.response?.data?.error ||
          e?.message ||
          "Failed to close project.",
      );
      setBusy(false);
    }
  }

  if (loading || authLoading) {
    return (
      <div className="px-6 py-10 text-sm text-gray-500" data-testid="close-loading">
        Loading…
      </div>
    );
  }
  if (loadErr) {
    return (
      <div className="px-6 py-10" data-testid="close-error">
        <p className="text-red-600 text-sm">{loadErr}</p>
      </div>
    );
  }

  const photoUrls = files.map((f) => URL.createObjectURL(f));

  return (
    <div
      className="min-h-screen flex flex-col bg-white"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="close-project-page"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
          data-testid="close-cancel"
        >
          <X className="w-4 h-4 text-gray-900" />
        </button>
        <div className="text-[12px] font-extrabold tracking-[0.06em] uppercase text-gray-500">
          Close project
        </div>
        <div className="w-9" aria-hidden="true" />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-2">
        <div className="px-6 pt-1 pb-4">
          <h1 className="text-[24px] font-extrabold tracking-tight text-gray-900 leading-tight">
            Close: {projectName}
          </h1>
          <p className="mt-1.5 text-[13px] text-gray-500 leading-snug">
            Tell us how this project ended.
          </p>
        </div>

        {/* Did the work go ahead? */}
        <div className="px-6">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
            Did the work go ahead?
          </div>
          <div
            className="grid grid-cols-2 bg-gray-100 rounded-2xl p-1"
            role="tablist"
            aria-label="Did the work go ahead?"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!didGoAhead}
              onClick={() => setDidGoAhead(false)}
              data-testid="close-segment-no"
              className={`py-2.5 rounded-[14px] text-[13px] font-extrabold tracking-tight ${
                !didGoAhead
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              No
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={didGoAhead}
              onClick={() => setDidGoAhead(true)}
              data-testid="close-segment-yes"
              className={`py-2.5 rounded-[14px] text-[13px] font-extrabold tracking-tight ${
                didGoAhead
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              Yes
            </button>
          </div>
        </div>

        {/* YES branch */}
        {didGoAhead && (
          <>
            <div className="px-6 pt-5">
              <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
                Who did the work?
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                data-testid="close-open-picker"
                className={`w-full px-3.5 py-3.5 rounded-2xl flex items-center justify-between text-left ${
                  winner
                    ? "bg-indigo-50"
                    : "bg-gray-100"
                }`}
              >
                {winner ? (
                  <span className="flex-1 min-w-0 text-[14px] font-extrabold text-indigo-900 truncate">
                    {winner.kind === "someone-else"
                      ? "Someone else"
                      : winner.label}
                  </span>
                ) : (
                  <span className="text-[14px] font-medium text-gray-400">
                    Pick a tradesperson…
                  </span>
                )}
                <ChevronRight
                  className={`w-4 h-4 ${
                    winner ? "text-indigo-700" : "text-gray-400"
                  }`}
                />
              </button>
              <p className="mt-2 text-[11.5px] text-gray-500 leading-snug">
                Pick from your recommendations or any tradesperson who shared
                their profile.
              </p>
            </div>

            {/* CR3: Were you satisfied? */}
            {askSatisfaction && (
              <div className="px-6 pt-5" data-testid="close-satisfaction">
                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
                  Were you satisfied with the work?
                </div>
                <div
                  role="radiogroup"
                  aria-label="Were you satisfied with the work?"
                  className="grid grid-cols-2 gap-2"
                >
                  <MobileChoice
                    active={satisfied === "no"}
                    tone="rose"
                    label="No"
                    onClick={() => setSatisfied("no")}
                    testId="satisfied-no"
                  />
                  <MobileChoice
                    active={satisfied === "yes"}
                    tone="emerald"
                    label="Yes"
                    onClick={() => setSatisfied("yes")}
                    testId="satisfied-yes"
                  />
                </div>
              </div>
            )}

            {/* CR3 "No" branch: shared 5-category star ratings. */}
            {askSatisfaction && satisfied === "no" && (
              <div className="px-6 pt-5" data-testid="close-ratings">
                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
                  Rate the tradesperson
                </div>
                <StarRatingList
                  value={ratings}
                  onChange={setRatings}
                  testIdPrefix="close-rating-star"
                />
                <p className="mt-2 text-[11px] text-gray-500 leading-snug">
                  Stays private - only the tradesperson and our admin team
                  see this.
                </p>
              </div>
            )}

            {/* Overall rating: 1-5 stars above the photos in the Yes
                branch. Hidden in the No branch (which already collects
                the granular 5-row breakdown) and for off-platform
                hires (no profile to rate). */}
            {askSatisfaction && satisfied === "yes" && (
              <div className="px-6 pt-5" data-testid="close-overall-rating">
                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
                  Overall rating
                </div>
                <StarRow
                  label="Overall"
                  value={overallRating}
                  onChange={setOverallRating}
                  testIdPrefix="close-overall-star"
                />
              </div>
            )}

            {/* Photos: hidden in the "No" branch (the rating is the
                closure signal). Off-platform hires + "Yes" branch show
                photos as before. */}
            {(!askSatisfaction || satisfied === "yes") && (
            <div className="px-6 pt-5">
              <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
                Photos of the completed work
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                data-testid="close-add-photos"
                className="w-full min-h-[110px] rounded-2xl border-[1.5px] border-dashed border-indigo-200 bg-indigo-50/40 flex flex-col items-center justify-center gap-1.5 text-gray-500"
              >
                <Camera className="w-6 h-6 text-indigo-600" />
                <span className="text-[13px] font-extrabold text-indigo-700">
                  Tap to add photos
                </span>
                <span className="text-[10.5px] text-gray-400">
                  Up to {MAX_PHOTOS} · max {MAX_PHOTO_MB}MB each
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onPickFiles}
                data-testid="close-photo-input"
              />
              {photoUrls.length > 0 && (
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {photoUrls.map((src, i) => (
                    <div
                      key={i}
                      className="relative aspect-square rounded-xl bg-cover bg-center"
                      style={{ backgroundImage: `url(${src})` }}
                    >
                      <button
                        type="button"
                        aria-label={`Remove photo ${i + 1}`}
                        onClick={() => removeFile(i)}
                        className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* CR3 boost-and-consent: only in the satisfied=yes branch. */}
            {askSatisfaction && satisfied === "yes" && (
              <div className="px-6 pt-5">
                <label
                  className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 cursor-pointer"
                  data-testid="close-boost"
                >
                  <input
                    type="checkbox"
                    checked={boostConsent}
                    onChange={(e) => setBoostConsent(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded border-amber-300 text-indigo-600 focus:ring-indigo-500"
                    data-testid="close-boost-checkbox"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-[13.5px] font-extrabold text-slate-900">
                        Give them a boost
                      </span>
                    </span>
                    <span className="block mt-0.5 text-[12px] text-slate-600 leading-relaxed">
                      We&apos;ll mark them as a top tradesperson in your
                      area, and the photos you uploaded above may be shown
                      anonymously on their profile so future homeowners can
                      see their work. Your name and exact address are never
                      shown. Closing also archives this job - it won&apos;t
                      appear in your list again.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </>
        )}

        {/* NO branch */}
        {!didGoAhead && (
          <div className="px-6 pt-5">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
              Why didn't it go ahead?
            </div>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map((r) => {
                const on = reasons.has(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => toggleReason(r.value)}
                    data-testid={`close-reason-${r.value}`}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border-[1.5px] text-left text-[13px] font-extrabold tracking-tight ${
                      on
                        ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                        : "border-gray-200 bg-white text-gray-900"
                    }`}
                  >
                    <span
                      className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] shrink-0 flex items-center justify-center ${
                        on
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "border-gray-300"
                      }`}
                    >
                      {on && <Check className="w-3 h-3" />}
                    </span>
                    <span>{r.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={toggleOther}
                data-testid="close-reason-other"
                className={`col-span-2 flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border-[1.5px] text-left text-[13px] font-extrabold tracking-tight ${
                  reasons.has("other")
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-gray-200 bg-white text-gray-900"
                }`}
              >
                <span
                  className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] shrink-0 flex items-center justify-center ${
                    reasons.has("other")
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "border-gray-300"
                  }`}
                >
                  {reasons.has("other") && <Check className="w-3 h-3" />}
                </span>
                <span>Other</span>
              </button>
              {reasons.has("other") && (
                <textarea
                  className="col-span-2 mt-1 w-full rounded-2xl border-[1.5px] border-gray-200 px-3.5 py-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none transition-colors resize-none"
                  rows={3}
                  placeholder="Tell us a bit more (optional)"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  data-testid="close-other-text"
                />
              )}
            </div>
            <p className="mt-2 text-[11.5px] text-gray-500 leading-snug">
              You can update this later if needed.
            </p>
          </div>
        )}

        {submitErr && (
          <div
            role="alert"
            data-testid="close-error"
            className="mx-6 mt-5 rounded-xl bg-red-50 text-red-700 text-[12.5px] px-3 py-2 leading-snug"
          >
            {submitErr}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-5 pt-3 border-t border-gray-100 bg-white flex gap-2.5"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          disabled={busy}
          className="flex-1 py-3.5 rounded-2xl bg-white border-[1.5px] border-gray-200 text-gray-600 font-bold text-[14px] disabled:opacity-60"
          data-testid="close-cancel-footer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-busy={busy}
          data-testid="close-submit"
          className="flex-1 py-3.5 rounded-2xl text-white font-extrabold text-[14px] shadow-lg shadow-red-500/30 disabled:opacity-50 disabled:shadow-none"
          style={{
            background: canSubmit
              ? "linear-gradient(135deg, #f87171, #dc2626)"
              : "#dc2626",
          }}
        >
          {busy ? "Closing…" : "Close job"}
        </button>
      </div>

      <CloseTradespersonPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        projectId={projectId}
        value={winner}
        onPick={(p) => setWinner(p)}
      />
    </div>
  );
}

function MobileChoice({
  active,
  tone,
  label,
  onClick,
  testId,
}: {
  active: boolean;
  tone: "rose" | "emerald";
  label: string;
  onClick: () => void;
  testId: string;
}) {
  const activeCls =
    tone === "emerald"
      ? "bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-200"
      : "bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-200";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      data-testid={testId}
      onClick={onClick}
      className={`rounded-2xl border-[1.5px] py-3 text-[14px] font-extrabold transition-all ${
        active ? activeCls : "bg-white border-gray-200 text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}
