import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/router";

type Props = {
  id: number;
  type: string;
  location: string;

  tradesmanLabel: string; // "—" if unknown
  tradesmanPublicId?: string | null; // <-- NEW

  onOpenBuilder: () => void; // existing behaviour (builders/<recId>)
  hasGallery: boolean;
};

export default function CompletedProjectInfoCard({
  id,
  type,
  location,
  tradesmanLabel,
  tradesmanPublicId,
  onOpenBuilder,
  hasGallery,
}: Props) {
  const router = useRouter();

  const hasTradesman = !!(tradesmanLabel && tradesmanLabel !== "—");

  const onClickTradesman = () => {
    // Prefer the actual tradesman profile route if we have a UID
    if (tradesmanPublicId) {
      router.push(`/tradesman/${encodeURIComponent(tradesmanPublicId)}`);
      return;
    }

    // Fallback to existing behaviour (rec-based builder page)
    onOpenBuilder();
  };

  return (
    <div
      className="card px-4 py-3 rounded-2xl shadow-sm border border-slate-200"
      data-testid={`completed-info-${id}`}
    >
      {/* Prominent tradesman line */}
      <div className="mb-2">
        <div className="text-slate-500 text-[13px] leading-5">Tradesman</div>

        {hasTradesman ? (
          <button
            type="button"
            onClick={onClickTradesman}
            className="text-[15px] font-semibold text-red-500 underline underline-offset-2 decoration-red-300 hover:text-red-600 break-words"
            data-testid={`link-${id}-tradesman`}
            title={
              tradesmanPublicId
                ? `Open tradesman profile for ${tradesmanLabel}`
                : `Open builder profile for ${tradesmanLabel}`
            }
          >
            {tradesmanLabel}
          </button>
        ) : (
          <span className="text-slate-400 text-[15px]">—</span>
        )}
      </div>

      {/* Meta grid */}
      <div
        className="
          grid 
          grid-cols-[auto,minmax(0,1fr)] 
          gap-y-2 gap-x-3 
          text-[14px] leading-6 mt-2
        "
      >
        <div className="text-slate-500">Type</div>
        <div
          className="text-slate-900 font-medium break-words min-w-0"
          data-testid={`cell-${id}-type`}
        >
          {type}
        </div>

        <div className="text-slate-500">Location</div>
        <div
          className="text-slate-900 font-medium break-words min-w-0"
          data-testid={`cell-${id}-location`}
        >
          {location}
        </div>

        {/* Gallery row */}
        <div className="text-slate-500">Gallery</div>
        <div className="min-w-0">
          {hasGallery ? (
            <Link
              href={`/projects/${id}/completed`}
              className="link"
              data-testid={`btn-${id}-view-gallery`}
            >
              View gallery
            </Link>
          ) : (
            <span
              className="text-slate-400"
              data-testid={`cell-${id}-no-gallery`}
            >
              No photos
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
