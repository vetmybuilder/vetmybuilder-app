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
            // ignore – we’ll still try to load shares below
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

      // Send a payload with alias keys too, so parent/server mapping can’t drop it.
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
          // non-blocking – project is already closed
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
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-[92vw] max-w-2xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl shadow-zinc-200/80"
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <h2
            id="close-project-title"
            className="text-xl font-black tracking-tight text-zinc-900"
            data-testid="close-project-title"
          >
            Close project{projectName ? `: ${projectName}` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-zinc-400 hover:text-zinc-900 text-xl leading-none transition-colors"
            data-testid="close-project-x"
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          {/* Did it go ahead? */}
          <div className="flex items-center gap-3">
            <input
              id="did-go-ahead"
              type="checkbox"
              checked={didGoAhead}
              onChange={(e) => setDidGoAhead(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
              data-testid="input-did-go-ahead"
            />
            <label
              htmlFor="did-go-ahead"
              className="select-none text-sm sm:text-base"
            >
              Did the work go ahead?
            </label>
          </div>

          {/* Reasons if it did NOT go ahead */}
          {!didGoAhead && (
            <fieldset
              className="rounded-2xl border-2 border-zinc-200 p-3 sm:p-4"
              data-testid="fieldset-reasons"
            >
              <legend className="px-1 text-sm font-bold text-zinc-700">
                Why didn't it go ahead?
              </legend>

              <div
                className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
                aria-label="Reasons list"
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={reasons.includes("budget")}
                    onChange={() => toggleReason("budget")}
                    data-testid="reason-budget"
                  />
                  <span>Budget</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={reasons.includes("no_show")}
                    onChange={() => toggleReason("no_show")}
                    data-testid="reason-no-show"
                  />
                  <span>Tradesperson didn't show up</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={reasons.includes("quote_too_high")}
                    onChange={() => toggleReason("quote_too_high")}
                    data-testid="reason-quote-too-high"
                  />
                  <span>Quote too high</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={reasons.includes("tradesman_unavailable")}
                    onChange={() => toggleReason("tradesman_unavailable")}
                    data-testid="reason-tradesman-unavailable"
                  />
                  <span>Tradesperson unavailable</span>
                </label>

                <label className="col-span-full flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={reasons.includes("other")}
                    onChange={() => toggleReason("other")}
                    data-testid="reason-other"
                  />
                  <span>Other</span>
                </label>

                {reasons.includes("other") && (
                  <div className="col-span-full">
                    <label
                      htmlFor="reason-other-text"
                      className="block text-sm font-bold text-zinc-700"
                    >
                      Please specify
                    </label>
                    <textarea
                      id="reason-other-text"
                      className="mt-1 w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors resize-none"
                      rows={3}
                      value={otherText}
                      onChange={(e) => setOtherText(e.target.value)}
                      data-testid="input-reason-other-text"
                    />
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                You can update this later if needed.
              </p>
            </fieldset>
          )}

          {/* Who did the work + photos if it DID go ahead */}
          {didGoAhead && (
            <div className="space-y-5">
              {/* Who did the work */}
              <div>
                <label
                  htmlFor="who-did-work"
                  className="block text-sm font-bold text-zinc-900"
                >
                  Who did the work?
                </label>
                <p className="mt-1 text-xs text-zinc-400 max-w-prose">
                  Once you have recommendations or shared profiles for this
                  project, you can select who carried out the work here.
                  <br />
                  From your recommendations or tradesmen who shared their
                  profile for this project.
                </p>

                <select
                  id="who-did-work"
                  className="mt-2 w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-sm text-zinc-900 focus:border-red-400 focus:outline-none transition-colors bg-white"
                  value={selectedWinnerKey}
                  onChange={(e) => setSelectedWinnerKey(e.target.value)}
                  data-testid="select-who-did-work"
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
              </div>

              {/* Photos uploader */}
              <div>
                <p className="block text-sm font-bold text-zinc-900">
                  Upload photos of the completed work (up to {MAX_FILES})
                </p>
                <FileGridUploader
                  files={files}
                  onChange={setFiles}
                  maxFiles={MAX_FILES}
                  maxSizeMB={10}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border-2 border-zinc-200 bg-white px-6 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition-all"
            onClick={onClose}
            data-testid="btn-cancel-close"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            disabled={busy}
            aria-busy={busy}
            data-testid="btn-confirm-close"
          >
            {busy ? "Saving…" : "Close project"}
          </button>
        </div>
      </form>
    </div>
  );
}
