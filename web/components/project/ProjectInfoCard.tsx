// web/components/project/ProjectInfoCard.tsx
import Link from "next/link";
import * as React from "react";

type Status = "pending" | "live" | "completed" | "archived";

export default function ProjectInfoCard({
  id,
  name,
  type,
  location,
  propertyType,
  bedrooms,
  createdAt,
  // keep status in props for future use, but we won't render it here
  status = "pending",
}: {
  id: number;
  name: string;
  type: string;
  location: string;
  propertyType: string;
  bedrooms: number;
  createdAt: string;
  status?: Status;
}) {
  const created = React.useMemo(
    () => new Date(createdAt).toLocaleDateString("en-GB"), // DD/MM/YYYY
    [createdAt]
  );

  return (
    <article
      className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5"
      data-testid={`project-info-card-${id}`}
    >
      <h3 className="text-[21px] sm:text-[22px] leading-tight font-semibold text-slate-900 tracking-tight">
        <Link
          href={`/projects/${id}`}
          className="hover:underline block overflow-hidden text-ellipsis whitespace-nowrap"
          data-testid={`project-card-link-${id}`}
          aria-label={`Open project ${name}`}
          title={name}
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
          <dd className="truncate">
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

        {/* FIXED LABEL */}
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
          <dd className="truncate">
            <span className="text-slate-600">Property:</span>{" "}
            <span className="font-medium text-slate-900">{propertyType}</span>
          </dd>
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
          <dd> Beds {bedrooms}</dd>
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
          <dd>Created {created}</dd>
        </div>
      </dl>
      {/* Status pill intentionally not shown on the right card */}
    </article>
  );
}
