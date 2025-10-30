// web/components/project/ProjectCard.tsx
import Link from "next/link";
import * as React from "react";

type Status = "pending" | "live" | "completed" | "archived";

type Props = {
  id: number;
  name: string;
  type: string;
  location: string;
  propertyType: string;
  bedrooms: number;
  createdAt: string;
  status?: Status;
  imageUrl?: string | null;
  testId?: string;
};

function StatusPill({ status = "pending" }: { status?: Status }) {
  const map: Record<Status, string> = {
    live: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    completed: "bg-sky-100 text-sky-700",
    archived: "bg-slate-100 text-slate-600",
  };
  const label =
    status === "live"
      ? "Live"
      : status === "completed"
      ? "Completed"
      : status === "archived"
      ? "Archived"
      : "Pending";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium",
        "shadow-sm",
        map[status],
      ].join(" ")}
      data-testid="status-pill"
    >
      {label}
    </span>
  );
}

export default function ProjectCard({
  id,
  name,
  type,
  location,
  propertyType,
  bedrooms,
  createdAt,
  status = "pending",
  imageUrl = null,
  testId,
}: Props) {
  return (
    <article
      className="rounded-3xl bg-white ring-1 ring-blue-100 shadow-sm hover:shadow-md transition"
      data-testid={testId || `project-card-${id}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 p-5">
        {/* LEFT: image thumb */}
        <div className="relative">
          <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100">
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
          </div>

          {/* circular LIVE chip (only when live) */}
          {status === "live" && (
            <div className="absolute -top-2 -right-2 sm:top-0 sm:right-0">
              <span className="grid place-items-center h-10 w-10 rounded-full bg-emerald-600 text-white text-[11px] font-semibold shadow-md">
                LIVE
              </span>
            </div>
          )}
        </div>

        {/* RIGHT: details */}
        <div className="pt-4 sm:pt-0 sm:pl-6 flex flex-col">
          <h3 className="text-[22px] leading-tight font-semibold text-slate-900 tracking-tight">
            <Link
              href={`/projects/${id}`}
              className="hover:underline"
              data-testid={`project-card-link-${id}`}
              aria-label={`Open project ${name}`}
            >
              {name}
            </Link>
          </h3>

          <dl className="mt-3 space-y-2 text-[15px] text-slate-700">
            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M4 10h16M6 6h12M4 14h16M6 18h12" />
              </svg>
              <dd>
                <span className="text-slate-600">Type:</span>{" "}
                <span className="font-medium text-slate-900">{type}</span>
              </dd>
            </div>

            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
                <circle cx="12" cy="11" r="2.5" />
              </svg>
              <dd className="truncate">{location}</dd>
            </div>

            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="m3 11 9-7 9 7" />
                <path d="M5 10v10h14V10" />
              </svg>
              <dd className="truncate">Location, {propertyType}</dd>
            </div>

            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M3 10h18v7H3z" />
                <path d="M7 10V7h5a3 3 0 0 1 3 3" />
              </svg>
              <dd>Beds {bedrooms}</dd>
            </div>

            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
              <dd>
                Created {new Date(createdAt).toLocaleString()}
              </dd>
            </div>
          </dl>

          {/* SINGLE status pill (bottom-right only) */}
          <div className="mt-5 flex justify-end">
            <StatusPill status={status} />
          </div>
        </div>
      </div>
    </article>
  );
}
