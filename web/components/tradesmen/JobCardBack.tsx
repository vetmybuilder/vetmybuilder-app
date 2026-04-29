// web/components/tradesmen/JobCardBack.tsx
//
// Back face of a tradesman swipe-deck card. Revealed when the tradesman
// taps the Eye button - the card flips on the Y axis to show full
// details: full description, structured field pills (property, posted,
// homeowner, plus parsed timeframe / budget / materials), and trade
// chips. Pure presentational - no data fetching, no navigation.

import type { JobCardData } from "./JobCard";
import { parseDescriptionPills } from "@/utils/projectDescription";

/** Returns a human-readable relative time string like "2h ago", "yesterday", "3 days ago". */
function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

/** Combines bedrooms + propertyType into a single label, e.g. "3-bed semi". */
function propertyLabel(bedrooms?: number | null, propertyType?: string | null): string | null {
  if (bedrooms !== null && bedrooms !== undefined && propertyType) {
    return `${bedrooms}-bed ${propertyType}`;
  }
  if (bedrooms !== null && bedrooms !== undefined) {
    return `${bedrooms} bed`;
  }
  if (propertyType) {
    return propertyType;
  }
  return null;
}

export default function JobCardBack({ data }: { data: JobCardData }) {
  const matchedSet = new Set(data.matchedTrades);
  const propLabel = propertyLabel(data.bedrooms, data.propertyType);
  const descPills = parseDescriptionPills(data.description);

  // Single ordered list of structured fields. AI budget is intentionally
  // omitted - the homeowner's own budget answer (parsed from description)
  // is the source of truth here.
  const meta: Array<{ label: string; value: string }> = [];
  if (propLabel) meta.push({ label: "Property", value: propLabel });
  meta.push({ label: "Posted", value: relativeTime(data.postedAt) });
  if (data.ownerFirstName) {
    meta.push({ label: "Homeowner", value: data.ownerFirstName });
  }
  for (const p of descPills) meta.push(p);

  // Free-text fallback: only render the description paragraph when the
  // structured parse yielded nothing. Modern projects already surface the
  // same info via the pill row.
  const showFreeText = descPills.length === 0 && !!data.description;

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-stone-50 flex flex-col h-full"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)" }}
    >
      {/* Emerald gradient hero */}
      <div
        className="px-3.5 pt-3.5 pb-3 text-white"
        style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
      >
        {/* Type chip */}
        <span
          className="inline-block px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-[0.04em] text-white"
          style={{ background: "rgba(255,255,255,0.22)" }}
        >
          {data.type}
        </span>

        {/* Title */}
        <div className="mt-1.5 text-[19px] font-extrabold leading-[1.2] text-white">
          {data.title}
        </div>

        {/* Location */}
        <div
          className="mt-1.5 flex items-center gap-1.5 text-[13px]"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          <span>📍</span>
          <span>{data.location}</span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3.5 pt-3.5">
        {/* AI-generated job summary - the homeowner-facing classifier
            already writes a plain-English sentence describing the job;
            surfacing it here gives the tradesman a one-glance read of
            what's actually needed. */}
        {data.aiSummary && (
          <div
            className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 mb-3.5"
            data-testid="job-card-ai-summary"
          >
            <Eyebrow>✨ Job summary</Eyebrow>
            <p className="text-[12.5px] text-gray-800 leading-[1.5]">
              {data.aiSummary}
            </p>
            {data.aiKeyConcerns && data.aiKeyConcerns.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {data.aiKeyConcerns.map((c, i) => (
                  <span
                    key={`${c}-${i}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-800 text-[10.5px] font-bold"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Free-text description fallback for legacy projects */}
        {showFreeText && (
          <>
            <Eyebrow>Full description</Eyebrow>
            <p className="text-[12.5px] text-gray-700 leading-[1.5] mb-3.5">
              {data.description}
            </p>
          </>
        )}

        {/* Job details pill row */}
        {meta.length > 0 && (
          <>
            <Eyebrow>Job details</Eyebrow>
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {meta.map((m, i) => (
                <span
                  key={`${m.label}-${i}`}
                  className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700 text-[11px] font-bold"
                >
                  <span className="text-gray-400 mr-1 font-semibold">
                    {m.label}:
                  </span>
                  {m.value}
                </span>
              ))}
            </div>
          </>
        )}

        {/* Trades needed */}
        <Eyebrow>Trades needed</Eyebrow>
        <div className="flex flex-wrap gap-1.5 pb-3.5">
          {data.trades.map((trade) =>
            matchedSet.has(trade) ? (
              <span
                key={trade}
                className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10.5px] font-bold"
              >
                {trade} ✓
              </span>
            ) : (
              <span
                key={trade}
                className="inline-block px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-[10.5px] font-bold"
              >
                {trade}
              </span>
            )
          )}
        </div>

      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-emerald-600 mb-1">
      {children}
    </div>
  );
}
