import * as React from "react";
import StatusBadge from "@/components/StatusBadge";

type Status = "pending" | "live" | "completed" | "archived";

export default function ProjectImageCard({
  id,
  status = "pending",
  imageUrl,
  name,
}: {
  id: number;
  status?: Status;
  imageUrl?: string | null;
  name: string;
}) {
  return (
    <article
      className="rounded-3xl bg-white border border-slate-200 shadow-sm p-4"
      data-testid={`project-image-card-${id}`}
      aria-label={`${name} preview`}
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full grid place-items-center text-slate-300">
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <rect x="3" y="3" width="18" height="14" rx="2" />
              <path d="m3 14 4-4 4 4 3-3 5 5" />
            </svg>
          </div>
        )}

        {/* Top-right circular LIVE badge (keep) */}
        {status === "live" && (
          <div className="absolute top-3 right-3">
            <span className="grid place-items-center h-10 w-10 rounded-full bg-emerald-600 text-white text-[11px] font-semibold shadow-md">
              LIVE
            </span>
          </div>
        )}

        {/* Bottom-left status pill — use reusable badge for non-live only */}
        {status !== "live" && (
          <div className="absolute bottom-3 left-3">
            <StatusBadge value={status} size="sm" />
          </div>
        )}
      </div>
    </article>
  );
}