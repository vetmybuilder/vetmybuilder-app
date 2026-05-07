// web/components/tradesmen/JobCard.tsx
//
// Front face of a tradesman swipe-deck card. Tinder-style fullscreen:
// the category hero image fills the card; the bottom gradient surfaces
// only what the trade needs to make a swipe decision - title, location,
// type / AI score badges, and the LLM plain-English summary. The full
// project breakdown (property, materials, trade chips, etc.) lives on
// the back face, accessed via the info button.

import { getJobCategoryImage } from "@/utils/jobCategoryImage";

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
  const locationText =
    data.distanceMiles !== undefined
      ? `${data.location} · ${data.distanceMiles.toFixed(1)} mi away`
      : data.location;
  const heroImage = getJobCategoryImage(data.type);
  const summary = data.aiSummary?.trim() || null;

  return (
    <div
      className="relative md:rounded-[22px] overflow-hidden bg-cover bg-center h-full w-full md:shadow-md select-none"
      style={{
        backgroundImage: `url(${heroImage})`,
        WebkitTouchCallout: "none",
      }}
      role="img"
      aria-label={`${data.type} category`}
    >
      {/* Top-right badges — type pill + AI match score */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
        <span
          className="inline-block px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-[0.04em] text-emerald-800"
          style={{
            background: "rgba(255,255,255,0.92)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          }}
        >
          {data.type}
        </span>
        {data.aiScore !== null && data.aiScore !== undefined && (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold text-amber-900"
            style={{
              background: "rgba(254,243,199,0.95)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            ✨ {data.aiScore}% match
          </span>
        )}
      </div>

      {/* Bottom gradient + content. pb leaves room for the floating
          action bar so the buttons never sit on top of the title or chips. */}
      <div
        className="absolute inset-x-0 bottom-0 px-5 pt-28 pb-28 text-white"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 100%)",
        }}
      >
        <h2
          className="text-[23px] font-black tracking-tight leading-[1.15]"
          style={{
            fontFamily: "'Sora', sans-serif",
            textShadow: "0 1px 3px rgba(0,0,0,0.55)",
          }}
        >
          {data.title}
        </h2>

        <div className="mt-1.5 flex items-center gap-1 text-[12.5px] opacity-90">
          <span aria-hidden>📍</span>
          <span>{locationText}</span>
        </div>

        {summary && (
          <p className="mt-2.5 text-[13px] leading-snug opacity-95 line-clamp-3">
            {summary}
          </p>
        )}
      </div>
    </div>
  );
}
