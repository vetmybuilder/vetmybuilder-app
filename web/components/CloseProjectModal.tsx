import React, { useEffect, useState } from "react";
import { useApi } from "@/utils/api";

type RecommendationLite = {
  id: number;
  name: string;
  company?: string | null;
  fromCommunity?: 0 | 1 | boolean; // <-- add this so we can pass it to the server
};

type ClosePayload = {
  didGoAhead: boolean;
  reasons: string[];
  otherReason?: string;
  selectedRecommendationId?: number;
  winnerFromCommunity?: boolean | 0 | 1 | "0" | "1" | "true" | "false"; // <-- NEW
};

type Props = {
  projectId: number;
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: ClosePayload) => Promise<void> | void;
  projectName?: string;
};

/**
 * CloseProjectModal
 * - If "did go ahead" is checked:
 *   - show dropdown of recommendations
 *   - allow up to 20 images to be uploaded
 * - If unchecked:
 *   - show checklist of reasons (budget, no_show, quote_too_high, tradesman_unavailable, other)
 */
export default function CloseProjectModal({
  projectId,
  open,
  onClose,
  onSubmit,
  projectName,
}: Props) {
  const api = useApi();

  const [didGoAhead, setDidGoAhead] = useState(true);
  const [reasons, setReasons] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [busy, setBusy] = useState(false);

  const [recs, setRecs] = useState<RecommendationLite[]>([]);
  const [selectedRecId, setSelectedRecId] = useState<number | "">("");
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
      setSelectedRecId("");
      setFiles([]);
    }
  }, [open]);

  // Load recommendations for dropdown when open & going ahead
  useEffect(() => {
    if (!open || !didGoAhead) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(
          `/api/projects/${projectId}/recommendations?page=1&pageSize=50`
        );
        const items = Array.isArray(data?.items) ? data.items : [];
        if (!cancelled) {
          setRecs(
            items.map((r: any) => ({
              id: r.id,
              name: r.name,
              company: r.company ?? null,
              fromCommunity:
                r?.fromCommunity === 1 ||
                r?.fromCommunity === "1" ||
                r?.fromCommunity === true,
            }))
          );
        }
      } catch {
        if (!cancelled) setRecs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, didGoAhead, projectId, api]);

  function toggleReason(value: string) {
    setReasons((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
    );
  }

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    const capped = list.slice(0, MAX_FILES);
    setFiles(capped);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      // find the selected winner to get fromCommunity
      const winner =
        didGoAhead && selectedRecId !== ""
          ? recs.find((r) => r.id === Number(selectedRecId))
          : undefined;

      await onSubmit({
        didGoAhead,
        reasons: didGoAhead ? [] : reasons,
        otherReason: didGoAhead
          ? undefined
          : reasons.includes("other")
          ? otherText.trim()
          : undefined,
        selectedRecommendationId:
          didGoAhead && selectedRecId !== ""
            ? Number(selectedRecId)
            : undefined,
        // IMPORTANT: include winnerFromCommunity so server doesn't need a DB column
        winnerFromCommunity: didGoAhead
          ? !!(
              winner &&
              (winner.fromCommunity === 1 || winner.fromCommunity === true)
            )
          : false,
      });

      // Upload photos if any and work went ahead
      if (didGoAhead && files.length > 0) {
        const fd = new FormData();
        for (const f of files) fd.append("photos", f);
        try {
          await api.post(`/api/projects/${projectId}/close/photos`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch {
          // non-blocking error
        }
      }

      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

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
        className="relative z-10 w-[92vw] max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="close-project-title"
            className="text-lg font-semibold"
            data-testid="close-project-title"
          >
            Close project{projectName ? `: ${projectName}` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-500 hover:text-slate-900"
            data-testid="close-project-x"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              id="did-go-ahead"
              type="checkbox"
              checked={didGoAhead}
              onChange={(e) => setDidGoAhead(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
              data-testid="input-did-go-ahead"
            />
            <label htmlFor="did-go-ahead" className="select-none">
              Did the work go ahead?
            </label>
          </div>

          {!didGoAhead && (
            <fieldset
              className="rounded-xl border border-slate-200 p-3"
              data-testid="fieldset-reasons"
            >
              <legend className="px-1 text-sm font-medium text-slate-600">
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
                      className="block text-sm text-slate-600"
                    >
                      Please specify
                    </label>
                    <textarea
                      id="reason-other-text"
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2"
                      rows={3}
                      value={otherText}
                      onChange={(e) => setOtherText(e.target.value)}
                      data-testid="input-reason-other-text"
                    />
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                You can update this later if needed.
              </p>
            </fieldset>
          )}

          {didGoAhead && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="who-did-work"
                  className="block text-sm font-medium text-slate-700"
                >
                  Who did the work?
                </label>
                <select
                  id="who-did-work"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2"
                  value={selectedRecId}
                  onChange={(e) =>
                    setSelectedRecId(
                      e.target.value ? Number(e.target.value) : ""
                    )
                  }
                  data-testid="select-who-did-work"
                >
                  <option value="">Select a tradesperson…</option>
                  {recs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.company ? `${r.company} (${r.name})` : r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  From your recommendations for this project.
                </p>
              </div>

              <div>
                <label
                  htmlFor="closure-photos"
                  className="block text-sm font-medium text-slate-700"
                >
                  Upload photos of the completed work (up to {MAX_FILES})
                </label>
                <input
                  id="closure-photos"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onFilesChange}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2"
                  data-testid="input-closure-photos"
                />
                {files.length > 0 && (
                  <p
                    className="mt-1 text-xs text-slate-600"
                    data-testid="closure-photos-count"
                  >
                    {files.length} selected{" "}
                    {files.length === MAX_FILES ? "(max reached)" : ""}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            data-testid="btn-cancel-close"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-danger"
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
