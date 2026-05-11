// web/components/vendor-register/SupportingDocsField.tsx
//
// App-style "supporting documents" list. Each declared doc is rendered
// as a card with a coloured type-icon, a freeform label (provider /
// policy number / cert name) and an upload tile for the proof PDF or
// image. Empty state is a single tappable dashed tile - same shape as
// the "+ Add another" card we render below the list once there's at
// least one item, so the visual rhythm stays consistent.
//
// We require an uploaded file per row so admin has evidence to verify.
// Expiry isn't asked for - admin can read it off the doc and trades
// often don't know it without checking the cert anyway.

import { useState } from "react";
import Select from "@/components/forms/Select";
import { useApi } from "@/utils/api";

export type SupportingDocType =
  | "public_liability"
  | "employer_liability"
  | "trade_certification"
  | "industry_membership"
  | "other";

export type SupportingDoc = {
  type: SupportingDocType;
  label: string; // freeform - e.g. "Hiscox Public Liability £2m"
  customType?: string; // populated only when type === "other"
  // Storage identifier returned by /api/tradesmen/upload-docs. The
  // client never holds a direct public URL anymore - admin + the owner
  // view files via the authed /api/tradesmen/.../docs/:idx redirect.
  fileKey?: string;
  // Legacy field kept readable in case older rows still carry it; we
  // never write it from the new upload path.
  fileUrl?: string;
  fileName?: string; // original filename for display
};

const TYPE_OPTIONS: Array<{ value: SupportingDocType; label: string }> = [
  { value: "public_liability", label: "Public liability insurance" },
  { value: "employer_liability", label: "Employer liability insurance" },
  { value: "trade_certification", label: "Trade certification" },
  { value: "industry_membership", label: "Industry membership" },
  { value: "other", label: "Other..." },
];

const PLACEHOLDERS: Record<SupportingDocType, string> = {
  public_liability: "Provider + cover (e.g. Hiscox £2m)",
  employer_liability: "Provider + cover (e.g. Aviva £10m)",
  trade_certification: "Body + cert (e.g. City & Guilds Plumbing L3)",
  industry_membership: "Body + reg no. (e.g. Gas Safe 123456)",
  other: "Describe the document",
};

// Visual icon + tone per type so cards are scannable at a glance.
const TYPE_VISUAL: Record<
  SupportingDocType,
  { emoji: string; bg: string; ring: string }
> = {
  public_liability: { emoji: "🛡️", bg: "bg-emerald-100", ring: "ring-emerald-200" },
  employer_liability: { emoji: "👥", bg: "bg-sky-100", ring: "ring-sky-200" },
  trade_certification: { emoji: "🎓", bg: "bg-amber-100", ring: "ring-amber-200" },
  industry_membership: { emoji: "🏛️", bg: "bg-violet-100", ring: "ring-violet-200" },
  other: { emoji: "📄", bg: "bg-zinc-100", ring: "ring-zinc-200" },
};

type Props = {
  docs: SupportingDoc[];
  onChange: (docs: SupportingDoc[]) => void;
  /** Reserved for future tighter renders; currently unused. */
  compact?: boolean;
};

export default function SupportingDocsField({ docs, onChange }: Props) {
  const api = useApi();
  // Per-row upload state. Keyed by row index so multiple uploads can be
  // in-flight at once (rare, but cheap to track).
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadErrIndex, setUploadErrIndex] = useState<{
    index: number;
    msg: string;
  } | null>(null);

  function update(index: number, patch: Partial<SupportingDoc>) {
    onChange(docs.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function add() {
    onChange([...docs, { type: "public_liability", label: "" }]);
  }

  function remove(index: number) {
    onChange(docs.filter((_, i) => i !== index));
  }

  async function handleFile(index: number, file: File) {
    setUploadErrIndex(null);
    setUploadingIndex(index);
    try {
      const fd = new FormData();
      fd.append("docs", file);
      const res: any = await api.post("/api/tradesmen/upload-docs", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const entry = res?.data?.files?.[0];
      if (!entry?.key) throw new Error("Upload returned no key");
      update(index, {
        fileKey: entry.key,
        fileName: entry.fileName || file.name,
      });
    } catch (e: any) {
      setUploadErrIndex({
        index,
        msg: e?.response?.data?.error || e?.message || "Upload failed",
      });
    } finally {
      setUploadingIndex(null);
    }
  }

  return (
    <div data-testid="supporting-docs">
      {docs.length === 0 ? (
        <button
          type="button"
          onClick={add}
          className="block w-full rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 px-5 py-6 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
          data-testid="doc-add"
        >
          <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white text-xl font-bold">
            +
          </div>
          <div className="text-[14px] font-extrabold text-emerald-800">
            Add a document
          </div>
          <div className="mt-0.5 text-[12px] text-emerald-700/80">
            Insurance, certifications or memberships
          </div>
        </button>
      ) : (
        <ul className="space-y-3">
          {docs.map((d, i) => {
            const placeholder = PLACEHOLDERS[d.type] || PLACEHOLDERS.other;
            const visual = TYPE_VISUAL[d.type];
            return (
              <li
                key={i}
                className="rounded-2xl bg-white overflow-hidden"
                data-testid={`doc-row-${i}`}
              >
                {/* Header: icon + type picker + remove */}
                <div className="flex items-center gap-3 px-3 pt-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${visual.bg} ${visual.ring} text-lg shrink-0`}
                    aria-hidden
                  >
                    {visual.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Select
                      ariaLabel="Document type"
                      value={d.type}
                      onChange={(next) =>
                        update(i, {
                          type: next as SupportingDocType,
                          customType:
                            next === "other" ? d.customType || "" : undefined,
                        })
                      }
                      options={TYPE_OPTIONS}
                      testIdBase={`doc-type-${i}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:text-red-500 hover:bg-zinc-100"
                    aria-label="Remove document"
                    data-testid={`doc-remove-${i}`}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                      aria-hidden
                    >
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 10-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>

                {/* Body fields */}
                <div className="px-3 pt-3 space-y-2.5">
                  {d.type === "other" && (
                    <input
                      type="text"
                      value={d.customType || ""}
                      onChange={(e) =>
                        update(i, { customType: e.target.value })
                      }
                      placeholder="What is this? (e.g. PASMA ticket)"
                      className="w-full text-[14px] rounded-xl border border-zinc-200 px-3 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      data-testid={`doc-custom-type-${i}`}
                    />
                  )}

                  <input
                    type="text"
                    value={d.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder={placeholder}
                    className="w-full text-[14px] rounded-xl border border-zinc-200 px-3 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    data-testid={`doc-label-${i}`}
                  />
                </div>

                {/* Upload tile */}
                <div className="px-3 pt-3 pb-3">
                  {d.fileKey || d.fileUrl ? (
                    <div
                      className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5"
                      data-testid={`doc-attached-${i}`}
                    >
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shrink-0">
                        <svg
                          aria-hidden
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-3.5 w-3.5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 11.59l6.79-6.3a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-bold text-emerald-800 leading-tight">
                          Proof attached
                        </div>
                        <div
                          className="text-[12px] text-emerald-700/80 truncate"
                          title={d.fileName}
                        >
                          {d.fileName || "proof"}
                        </div>
                      </div>
                      <label
                        className="ml-auto text-[12.5px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer px-2 py-1 rounded-md hover:bg-emerald-100"
                        data-testid={`doc-replace-${i}`}
                      >
                        Replace
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFile(i, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label
                      className="block w-full rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-center hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors cursor-pointer"
                      data-testid={`doc-upload-${i}`}
                    >
                      <div className="mx-auto mb-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-zinc-200">
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden
                          className="h-4 w-4 text-emerald-700"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 3a.75.75 0 01.75.75v8.69l2.97-2.97a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 10.53a.75.75 0 011.06-1.06l2.97 2.97V3.75A.75.75 0 0110 3z"
                            clipRule="evenodd"
                          />
                          <path d="M3.5 14.5A.75.75 0 014.25 15h11.5a.75.75 0 010 1.5H4.25a.75.75 0 01-.75-.5z" />
                        </svg>
                      </div>
                      <div className="text-[13px] font-bold text-zinc-700">
                        {uploadingIndex === i
                          ? "Uploading..."
                          : "Tap to upload proof"}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-zinc-500">
                        PDF or image
                      </div>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        disabled={uploadingIndex === i}
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFile(i, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  {uploadErrIndex?.index === i && (
                    <p
                      className="mt-2 text-[12px] text-red-600 font-medium"
                      role="alert"
                      data-testid={`doc-upload-err-${i}`}
                    >
                      {uploadErrIndex.msg}
                    </p>
                  )}
                </div>
              </li>
            );
          })}

          {/* Add another - same dashed-tile shape as the empty state for
              visual rhythm. */}
          <li>
            <button
              type="button"
              onClick={add}
              className="block w-full rounded-2xl border-2 border-dashed border-emerald-300 bg-white px-4 py-3.5 text-center hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
              data-testid="doc-add"
            >
              <span className="inline-flex items-center gap-2 text-[13.5px] font-extrabold text-emerald-700">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white text-[15px] leading-none">
                  +
                </span>
                Add another document
              </span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
