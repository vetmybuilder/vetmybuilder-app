// web/components/tradesmen/JobCard.tsx
//
// Front face of a tradesman swipe-deck card. Shows core job details, a
// pill row of property + structured description fields (timeframe /
// budget / materials), the description text, hero image, and trade
// chips. Pure presentational - no data fetching, no navigation.

import { getJobCategoryImage } from "@/utils/jobCategoryImage";
import { parseDescriptionPills } from "@/utils/projectDescription";

export interface JobCardData {
  projectId: number;
  title: string;
  type: string;
  location: string;
  distanceMiles?: number;
  budget?: string | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  description: string;
  trades: string[];
  matchedTrades: string[];
  ownerFirstName?: string | null;
  postedAt: string;
  aiScore?: number | null;
  priceBandEstimate?: string | null;
  answersJson?: Record<string, any> | null;
  /** Plain-English summary written by the AI classifier - used on the
   *  back face of the swipe card to give the tradesman a quick read on
   *  what the homeowner needs. Null when the classifier hasn't run yet
   *  or the project is too sparse to summarise. */
  aiSummary?: string | null;
  /** Short bullet list of homeowner concerns extracted by the classifier
   *  (e.g. "quality of finish", "minimise disruption"). */
  aiKeyConcerns?: string[];
}

export default function JobCard({ data }: { data: JobCardData }) {
  const matchedSet = new Set(data.matchedTrades);

  const locationText =
    data.distanceMiles !== undefined
      ? `${data.location} · ${data.distanceMiles.toFixed(1)} mi away`
      : data.location;

  const heroImage = getJobCategoryImage(data.type);

  // Build the meta pill row. Property + bedrooms first (factual context),
  // then the structured fields the homeowner provided in the create-flow
  // (timeframe / budget / materials, parsed from the description).
  const meta: Array<{ label: string; value: string }> = [];
  if (data.propertyType) {
    const propText = [
      data.propertyType,
      data.bedrooms !== null && data.bedrooms !== undefined
        ? `${data.bedrooms} bed`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    meta.push({ label: "Property", value: propText });
  }
  for (const p of parseDescriptionPills(data.description)) {
    meta.push(p);
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-white flex flex-col h-full"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)" }}
    >
      {/* Hero */}
      <div className="px-3.5 pt-3.5">
        {/* Type chip + AI badge row */}
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-extrabold uppercase tracking-[0.04em]">
            {data.type}
          </span>
          {data.aiScore !== null && data.aiScore !== undefined && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-[11px] font-extrabold">
              ✨ {data.aiScore}% match
            </span>
          )}
        </div>

        {/* Title */}
        <div className="mt-2.5 text-[19px] font-extrabold text-gray-900 leading-[1.2]">
          {data.title}
        </div>

        {/* Location */}
        <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-gray-500">
          <span>📍</span>
          <span>{locationText}</span>
        </div>
      </div>

      {/* Meta pills (property + parsed description fields) */}
      {meta.length > 0 && (
        <div className="px-3.5 mt-2.5 flex flex-wrap gap-1.5">
          {meta.map((m, i) => (
            <span
              key={`${m.label}-${i}`}
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-bold"
            >
              <span className="text-gray-400 mr-1 font-semibold">
                {m.label}:
              </span>
              {m.value}
            </span>
          ))}
        </div>
      )}

      {/* Free-text description fallback - only when the structured parse
          yielded no pills (legacy descriptions). Modern projects render as
          pills above and don't need the duplicate paragraph. */}
      {parseDescriptionPills(data.description).length === 0 &&
        data.description && (
          <div className="px-3.5 pt-3 text-[12.5px] text-gray-700 leading-[1.5] line-clamp-3">
            {data.description}
          </div>
        )}

      {/* Category hero image fills the open space */}
      <div
        className="mx-3.5 mt-3 flex-1 min-h-[120px] rounded-xl bg-gray-100 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
        role="img"
        aria-label={`${data.type} category`}
      />

      {/* Trade chips */}
      <div className="flex flex-wrap gap-1.5 px-3.5 pt-2.5 pb-3">
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
  );
}
