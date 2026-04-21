import Link from "next/link";
import type { Recommendation } from "@/types/vmb";
import { GoogleRatingChip } from "@/components/GoogleRatingChip";

type Props = {
  items: Recommendation[];
  projectId: number;
  maxVisible?: number;
};

export default function VettedBusinessesStrip({
  items,
  projectId,
  maxVisible = 2,
}: Props) {
  if (items.length === 0) return null;

  const visible = items.slice(0, maxVisible);
  const totalCount = items.length;

  return (
    <section
      aria-label="Vetted local businesses"
      className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5 mb-4"
      data-testid="vetted-businesses-strip"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold">
          &#10003;
        </span>
        <h2 className="text-sm sm:text-base font-extrabold text-emerald-900">
          Vetted Local Businesses
        </h2>
      </div>
      <p className="text-xs text-emerald-600 mb-3">
        Pre-vetted and verified
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        {visible.map((r) => (
          <VettedCard key={r.id} rec={r} projectId={projectId} />
        ))}
      </div>

      <div className="mt-3 text-right">
        <Link
          href={`/projects/${projectId}/vetted`}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
          data-testid="vetted-view-all"
        >
          View all ({totalCount}) &rarr;
        </Link>
      </div>
    </section>
  );
}

function VettedCard({
  rec,
  projectId,
}: {
  rec: Recommendation;
  projectId: number;
}) {
  const hasProfile = !!(rec.tradesmanPublicId || rec.linked_tradesman_uid);

  // Extract Google rating from comment: "...with 4.80 stars from 187 Google reviews"
  const ratingMatch = rec.comment?.match(/(\d+\.\d+)\s*stars?\s*from\s*(\d+)\s*Google/i);
  const googleRating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
  const googleReviewCount = ratingMatch ? parseInt(ratingMatch[2], 10) : null;

  return (
    <div
      className={`flex-1 rounded-xl border bg-white p-3.5 transition-all ${
        hasProfile
          ? "border-emerald-200 hover:border-emerald-400 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
          : "border-emerald-100"
      }`}
      data-testid={`vetted-card-${rec.id}`}
    >
      <div className="font-bold text-sm text-zinc-900">{rec.company}</div>

      {googleRating != null && (
        <div className="mt-1">
          <GoogleRatingChip rating={googleRating} count={googleReviewCount} />
        </div>
      )}

      {(rec.phone || rec.companyEmail) && (
        <div className="mt-1.5 text-xs text-zinc-500 space-y-0.5">
          {rec.phone && (
            <div>
              <a
                href={`tel:${rec.phone}`}
                className="text-blue-600 hover:text-blue-500"
                onClick={(e) => e.stopPropagation()}
              >
                {rec.phone}
              </a>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1 mt-2">
        <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          Vetted local business
        </span>
      </div>

      {hasProfile ? (
        <Link
          href={`/tradesman/${rec.tradesmanPublicId || rec.linked_tradesman_uid}?projectId=${projectId}`}
          className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
          data-testid={`vetted-profile-link-${rec.id}`}
        >
          View full profile on VetMyBuilder &rarr;
        </Link>
      ) : (
        <p
          className="mt-2 text-[11px] text-zinc-400 italic"
          data-testid={`vetted-no-profile-${rec.id}`}
        >
          Not yet on VetMyBuilder - contact directly
        </p>
      )}
    </div>
  );
}
