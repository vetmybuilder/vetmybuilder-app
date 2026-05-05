import React, { useEffect, useState } from "react";
import { useApi } from "@/utils/api";
import FileGridUploader from "@/components/fileUpload/FileGridUploader";

export type RecommendationLite = {
  id: number | string;
  name: string | null;
  company?: string | null;
  /** Normalised boolean flag: true if from community / neighbourhood */
  fromCommunity?: boolean;

  /** Where this winner candidate comes from */
  source?: "recommendation" | "share";
  /** Tradesman/user uid when source === "share" (or optionally for recs) */
  tradesmanUid?: string | null;
};

export type ClosePayload = {
  didGoAhead: boolean;
  reasons: string[];
  otherReason?: string;

  /** Legacy: winner chosen from a recommendation row */
  selectedRecommendationId?: number;

  /** NEW: winner chosen from a shared profile (no recommendation row) */
  winnerTradesmanUid?: string;

  /** Optional flag so server can treat community winners differently if needed */
  winnerFromCommunity?: boolean;
};

type Props = {
  projectId: number;
  open: boolean;
  onClose: () => void;

  /**
   * IMPORTANT:
   * Parent currently handles posting + any redirects.
   * We will send a payload that includes extra alias keys to avoid mapping bugs.
   */
  onSubmit: (payload: ClosePayload) => Promise<void> | void;

  projectName?: string;

  /**
   * Optional: pass in the project's recommendations from the parent
   * (e.g. vm.recs) so we don't have to refetch here.
   */
  recommendations?: RecommendationLite[];
};

export default function CloseProjectModal({
  projectId,
  open,
  onClose,
  onSubmit,
  projectName,
  recommendations,
}: Props) {
  const api = useApi();

  const [didGoAhead, setDidGoAhead] = useState(true);
  const [reasons, setReasons] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [busy, setBusy] = useState(false);

  const [recs, setRecs] = useState<RecommendationLite[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  /**
   * Store as a string key because the <select> uses string values.
   *
   * We encode both the source *and* id/uid so the caller can distinguish:
   *   - "rec:123"     → recommendation id 123
   *   - "share:<uid>" → tradesman who shared their profile
   */
  const [selectedWinnerKey, setSelectedWinnerKey] = useState<string>("");

  const [files, setFiles] = useState<File[]>([]);
  // Tracks the photo-upload consent checkbox (Acceptable Use Policy).
  // Submit is blocked when files are present but consent is not given.
  const [photoConsent, setPhotoConsent] = useState(false);
  const MAX_FILES = 20;

  // Reset when closing
  useEffect(() => {
    if (!open) {
      setDidGoAhead(true);
      setReasons([]);
      setOtherText("");
      setBusy(false);
      setRecs([]);
      setRecsLoading(false);
      setSelectedWinnerKey("");
      setFiles([]);
      setPhotoConsent(false);
    }
  }, [open]);

  // Load recommendation + share candidates for dropdown when open & going ahead.
  useEffect(() => {
    if (!open || !didGoAhead) return;

    let cancelled = false;

    (async () => {
      setRecsLoading(true);

      try {
        const merged: RecommendationLite[] = [];

        // 1) Start with recommendations from parent, if provided
        if (Array.isArray(recommendations) && recommendations.length > 0) {
          for (const r of recommendations) {
            merged.push({
              ...r,
              source: r.source || "recommendation",
            });
          }
        } else {
          // 2) Fallback: fetch via ratings endpoint
          try {
            const { data } = await api.get("/api/recommendations/ratings", {
              params: {
                projectId,
                limit: 50,
                offset: 0,
              },
            });

            const items: any[] = Array.isArray(data?.items) ? data.items : [];

            // Deduplicate by chCompanyNumber first, then normalized company name.
            // Keep the highest-scored rec per company.
            const companyBest = new Map<string, any>();
            for (const r of items) {
              const companyKey = r.chCompanyNumber
                ? `ch:${r.chCompanyNumber}`
                : `name:${(r.chCompanyName || r.company || "").trim().toLowerCase()}`;
              const existing = companyBest.get(companyKey);
              if (!existing || (r.score ?? 0) > (existing.score ?? 0)) {
                companyBest.set(companyKey, r);
              }
            }

            for (const r of companyBest.values()) {
              // Use the CH-verified name if available, otherwise fall back to submitted name
              const displayName =
                (r.chCompanyName && (r.chStatus === "verified" || r.chStatus === "ambiguous"))
                  ? r.chCompanyName
                  : r.company ?? null;

              merged.push({
                id: r.id,
                name: displayName,
                company: displayName,
                fromCommunity:
                  r?.fromCommunity === 1 ||
                  r?.fromCommunity === true ||
                  String(r?.source || "").toLowerCase() === "community",
                source: "recommendation",
                tradesmanUid:
                  r.tradesmanUid ||
                  r.tradesman_uid ||
                  r.tradesman_user_id ||
                  null,
              });
            }
          } catch {
            // ignore - we'll still try to load shares below
          }
        }

        // 3) Also fetch tradesmen who have shared their profile to this project
        try {
          const { data: shareData } = await api.get("/api/tradesmen/shares", {
            params: {
              projectId,
              limit: 50,
            },
          });

          const shares: any[] = Array.isArray(shareData?.shares)
            ? shareData.shares
            : [];

          for (const s of shares) {
            const uid =
              s.tradesmanUid || s.tradesman_uid || s.tradesman_user_id || null;
            if (!uid) continue;

            const company =
              s.companyName || s.company_name || s.tradesmanCompany || null;
            const name = s.tradesmanName || s.tradesman_name || company || null;

            merged.push({
              id: `share:${uid}`, // local id for this list; uid stored separately
              name,
              company,
              fromCommunity: false,
              source: "share",
              tradesmanUid: String(uid),
            });
          }
        } catch {
          // shares are optional, so ignore failures here
        }

        if (cancelled) return;

        // Optional: de-dupe by tradesmanUid so they don't appear twice
        const seenByKey = new Map<string, RecommendationLite>();

        for (const r of merged) {
          const key =
            (r.tradesmanUid && `uid:${r.tradesmanUid}`) ||
            `rec:${String(r.id)}`;
          if (!seenByKey.has(key)) {
            seenByKey.set(key, r);
          }
        }

        setRecs(Array.from(seenByKey.values()));
      } finally {
        if (!cancelled) setRecsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, didGoAhead, projectId, api, recommendations]);

  function toggleReason(value: string) {
    setReasons((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    try {
      const selected = selectedWinnerKey;

      let winnerRecommendationId: number | undefined;
      let winnerTradesmanUid: string | undefined;
      let winnerFromCommunity = false;

      if (didGoAhead && selected) {
        // split once only: "rec:<id>" or "share:<uid>"
        const idx = selected.indexOf(":");
        const kind = idx >= 0 ? selected.slice(0, idx) : selected;
        const raw = idx >= 0 ? selected.slice(idx + 1) : "";

        if (kind === "rec") {
          const id = Number(raw);
          if (Number.isFinite(id)) {
            winnerRecommendationId = id;

            // keep community flag behaviour for rec-based winners
            const winnerRec = recs.find(
              (r) =>
                (r.source === "recommendation" || !r.source) &&
                Number(r.id) === id
            );
            winnerFromCommunity = !!winnerRec?.fromCommunity;
          }
        } else if (kind === "share") {
          winnerTradesmanUid = raw || undefined;
          winnerFromCommunity = false;
        }
      }

      // Send a payload with alias keys too, so parent/server mapping can't drop it.
      const payload: ClosePayload & Record<string, any> = {
        didGoAhead,
        reasons: didGoAhead ? [] : reasons,
        otherReason: didGoAhead
          ? undefined
          : reasons.includes("other")
          ? otherText.trim()
          : undefined,

        // canonical keys (what we *want*)
        selectedRecommendationId: winnerRecommendationId,
        winnerTradesmanUid,
        winnerFromCommunity: didGoAhead ? winnerFromCommunity : false,

        // aliases (to survive parent mapping / older server versions)
        winnerRecommendationId: winnerRecommendationId,
        winnerRecId: winnerRecommendationId,
        winner_recommendation_id: winnerRecommendationId,

        winner_tradesman_uid: winnerTradesmanUid,
        _winnerTradesmanUid: winnerTradesmanUid,
      };

      await onSubmit(payload);

      // Upload photos AFTER successful close
      if (didGoAhead && files.length > 0) {
        const fd = new FormData();
        for (const f of files) fd.append("photos", f);
        try {
          await api.post(`/api/projects/${projectId}/close/photos`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch {
          // non-blocking - project is already closed
        }
      }

      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const hasOptions = recs.length > 0;
  const selectPlaceholder = recsLoading
    ? "Loading tradespeople…"
    : hasOptions
    ? "Select a tradesperson…"
    : "No recommendations yet";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-project-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="close-project-modal"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-[92vw] max-w-lg rounded-3xl bg-white border border-amber-100 shadow-2xl shadow-indigo-200/30 overflow-hidden animate-modal-in flex flex-col max-h-[92vh]"
      >
        {/* Header bar - X + eyebrow */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            aria-label="Close"
            data-testid="close-project-x"
          >
            <svg
              className="w-4 h-4 text-slate-700"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
            Close project
          </div>
          <div className="w-8" aria-hidden />
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <div>
            <h2
              id="close-project-title"
              data-testid="close-project-title"
              className="text-[20px] font-black tracking-tight text-slate-900 leading-snug"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Close{projectName ? `: ${projectName}` : ""}
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Tell us how this project ended.
            </p>
          </div>

          {/* Did it go ahead? - segmented Yes / No.
              Hidden checkbox preserves the input-did-go-ahead testid. */}
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-2">
              Did the work go ahead?
            </div>
            <input
              id="did-go-ahead"
              type="checkbox"
              checked={didGoAhead}
              onChange={(e) => setDidGoAhead(e.target.checked)}
              className="sr-only"
              data-testid="input-did-go-ahead"
            />
            <div
              role="radiogroup"
              aria-label="Did the work go ahead?"
              className="inline-flex w-full rounded-2xl bg-slate-100 p-1"
            >
              <SegmentBtn
                active={!didGoAhead}
                onClick={() => setDidGoAhead(false)}
                label="No"
                testId="close-segment-no"
              />
              <SegmentBtn
                active={didGoAhead}
                onClick={() => setDidGoAhead(true)}
                label="Yes"
                testId="close-segment-yes"
              />
            </div>
          </div>

          {/* Reasons if it did NOT go ahead */}
          {!didGoAhead && (
            <fieldset data-testid="fieldset-reasons">
              <legend className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-2">
                Why didn't it go ahead?
              </legend>

              <div className="space-y-1.5">
                <ReasonRow
                  label="Budget"
                  checked={reasons.includes("budget")}
                  onToggle={() => toggleReason("budget")}
                  testId="reason-budget"
                />
                <ReasonRow
                  label="Quote too high"
                  checked={reasons.includes("quote_too_high")}
                  onToggle={() => toggleReason("quote_too_high")}
                  testId="reason-quote-too-high"
                />
                <ReasonRow
                  label="Tradesperson didn't show"
                  checked={reasons.includes("no_show")}
                  onToggle={() => toggleReason("no_show")}
                  testId="reason-no-show"
                />
                <ReasonRow
                  label="Tradesperson unavailable"
                  checked={reasons.includes("tradesman_unavailable")}
                  onToggle={() => toggleReason("tradesman_unavailable")}
                  testId="reason-tradesman-unavailable"
                />
                <ReasonRow
                  label="Other"
                  checked={reasons.includes("other")}
                  onToggle={() => toggleReason("other")}
                  testId="reason-other"
                />
              </div>

              {reasons.includes("other") && (
                <div className="mt-3">
                  <label
                    htmlFor="reason-other-text"
                    className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-1.5"
                  >
                    Tell us a bit more
                  </label>
                  <textarea
                    id="reason-other-text"
                    rows={3}
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    data-testid="input-reason-other-text"
                    placeholder="Optional - one or two sentences in your own words."
                    className="w-full bg-slate-50 border-[1.5px] border-slate-200 focus:border-indigo-500 rounded-2xl px-3.5 py-3 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors resize-none"
                  />
                </div>
              )}
            </fieldset>
          )}

          {/* Who did the work + photos if it DID go ahead */}
          {didGoAhead && (
            <>
              <div>
                <label
                  htmlFor="who-did-work"
                  className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-2"
                >
                  Who did the work?
                </label>
                <select
                  id="who-did-work"
                  value={selectedWinnerKey}
                  onChange={(e) => setSelectedWinnerKey(e.target.value)}
                  data-testid="select-who-did-work"
                  className="w-full bg-slate-50 border-[1.5px] border-slate-200 focus:border-indigo-500 rounded-2xl px-3.5 py-3 text-[14px] text-slate-900 focus:outline-none transition-colors appearance-none cursor-pointer"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 1rem center",
                    paddingRight: "2.5rem",
                  }}
                >
                  <option value="">{selectPlaceholder}</option>
                  {recs.map((r) => {
                    const value =
                      r.source === "share"
                        ? `share:${r.tradesmanUid ?? ""}`
                        : `rec:${String(r.id)}`;

                    const label =
                      (r.company && r.company.trim()) ||
                      (r.name && r.name.trim()) ||
                      "Unknown tradesperson";

                    return (
                      <option key={value} value={value}>
                        {label}
                        {r.source === "share" ? " (shared profile)" : ""}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1.5 text-[11.5px] text-slate-500 leading-snug">
                  Pick from your recommendations or any tradesperson who shared
                  their profile for this project.
                </p>
              </div>

              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-2">
                  Photos of the completed work
                </div>
                <FileGridUploader
                  files={files}
                  onChange={setFiles}
                  maxFiles={MAX_FILES}
                  maxSizeMB={10}
                  onConsentChange={setPhotoConsent}
                />
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 shrink-0">
          <button
            type="button"
            className="px-5 py-2.5 rounded-full border border-slate-200 text-slate-700 font-bold text-[13px] hover:bg-slate-50 transition-colors disabled:opacity-60"
            onClick={onClose}
            disabled={busy}
            data-testid="btn-cancel-close"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (files.length > 0 && !photoConsent)}
            aria-busy={busy}
            data-testid="btn-confirm-close"
            title={
              files.length > 0 && !photoConsent
                ? "Please confirm the photo upload consent before continuing."
                : undefined
            }
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[13.5px] font-extrabold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: busy
                ? "linear-gradient(135deg, #94a3b8, #64748b)"
                : "linear-gradient(135deg, #6366f1, #4f46e5)",
              boxShadow: busy ? undefined : "0 8px 22px rgba(99,102,241,0.30)",
            }}
          >
            {busy && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="opacity-25"
                />
                <path
                  d="M4 12a8 8 0 018-8"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="opacity-75"
                />
              </svg>
            )}
            {busy ? "Closing job…" : "Close job"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SegmentBtn({
  active,
  onClick,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      role="radio"
      aria-checked={active}
      className={`flex-1 py-2 text-[14px] font-extrabold rounded-xl transition-colors ${
        active
          ? "bg-white text-slate-900 shadow"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

function ReasonRow({
  label,
  checked,
  onToggle,
  testId,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <label
      className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
        checked
          ? "bg-indigo-50 border border-indigo-200"
          : "border border-transparent hover:bg-slate-50"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="accent-indigo-600"
        data-testid={testId}
      />
      <span
        className={`text-[13px] ${
          checked ? "text-indigo-900 font-bold" : "text-slate-700"
        }`}
      >
        {label}
      </span>
    </label>
  );
}
