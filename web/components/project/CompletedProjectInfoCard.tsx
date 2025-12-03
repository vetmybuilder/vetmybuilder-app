import * as React from "react";
import Link from "next/link";

type Props = {
  id: number;
  type: string;
  location: string;
  tradesmanLabel: string; // "—" if unknown
  onOpenBuilder: () => void;
  hasGallery: boolean;
};

export default function CompletedProjectInfoCard({
  id,
  type,
  location,
  tradesmanLabel,
  onOpenBuilder,
  hasGallery,
}: Props) {
  const hasTradesman = !!(tradesmanLabel && tradesmanLabel !== "—");

  return (
    <div
      className="card px-4 py-3 rounded-2xl shadow-sm border border-slate-200"
      data-testid={`completed-info-${id}`}
    >
      {/* Prominent tradesman line (under the card title area) */}
      <div className="mb-2">
        <div className="text-slate-500 text-[13px] leading-5">Tradesman</div>
        {hasTradesman ? (
          <button
            type="button"
            onClick={onOpenBuilder}
            className="text-[15px] font-semibold text-indigo-700 underline underline-offset-2 decoration-indigo-400 hover:text-indigo-800 break-words"
            data-testid={`link-${id}-tradesman`}
            title={`Open builder profile for ${tradesmanLabel}`}
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
