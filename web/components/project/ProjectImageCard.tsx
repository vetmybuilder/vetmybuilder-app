import * as React from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { getJobCategoryImage } from "@/utils/jobCategoryImage";

type Status = "pending" | "live" | "completed" | "archived";

export default function ProjectImageCard({
  id,
  status = "pending",
  imageUrl,
  type,
  name,
}: {
  id: number;
  status?: Status;
  imageUrl?: string | null;
  type?: string | null;
  name: string;
}) {
  const resolvedImage = imageUrl || getJobCategoryImage(type);
  return (
    <article
      className="rounded-3xl bg-white border border-slate-200 shadow-sm p-4"
      data-testid={`project-image-card-${id}`}
      aria-label={`${name} preview`}
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolvedImage}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />

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