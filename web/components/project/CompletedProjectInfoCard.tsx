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
    <article
      className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5"
      data-testid={`completed-info-${id}`}
    >
      {/* Tradesman name as title */}
      {hasTradesman ? (
        <h3 className="text-[21px] sm:text-[22px] leading-tight font-semibold text-slate-900 tracking-tight">
          <button
            type="button"
            onClick={onClickTradesman}
            className="hover:underline text-left overflow-hidden text-ellipsis whitespace-nowrap block w-full"
            data-testid={`link-${id}-tradesman`}
            title={tradesmanLabel}
          >
            {tradesmanLabel}
          </button>
        </h3>
      ) : (
        <h3 className="text-[21px] leading-tight font-semibold text-slate-400 tracking-tight">
          No tradesman assigned
        </h3>
      )}

      <dl className="mt-3 space-y-2 text-[15px] text-slate-700">
        <div className="flex items-start gap-2">
          <svg className="mt-0.5 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M4 10h16M6 6h12M4 14h16M6 18h12" />
          </svg>
          <dd className="truncate">
            <span className="text-slate-600">Type:</span>{" "}
            <span className="font-medium text-slate-900">{type}</span>
          </dd>
        </div>

        <div className="flex items-start gap-2">
          <svg className="mt-0.5 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
            <circle cx="12" cy="11" r="2.5" />
          </svg>
          <dd className="truncate">{location}</dd>
        </div>

        <div className="flex items-start gap-2">
          <svg className="mt-0.5 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="14" rx="2" />
            <path d="m3 14 4-4 4 4 3-3 5 5" />
          </svg>
          <dd>
            {hasGallery ? (
              <Link
                href={`/projects/${id}/completed`}
                className="font-medium text-red-500 hover:underline"
                data-testid={`btn-${id}-view-gallery`}
              >
                View photos
              </Link>
            ) : (
              <span className="text-slate-400">No photos</span>
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}
