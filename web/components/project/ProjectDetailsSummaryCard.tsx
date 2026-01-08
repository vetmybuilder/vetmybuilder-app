import * as React from "react";
import StatusBadge from "@/components/StatusBadge";

export type ProjectStatus =
  | "pending"
  | "live"
  | "archived"
  | "completed"
  | string;

export type ProjectDetailsProject = {
  id: number;
  type: string;
  location: string;
  propertyType?: string | null;
  bedrooms?: number | null;
  status?: ProjectStatus | null;
  description?: string | null;
  createdAt?: string | null;
};

export type DescriptionSection = { label: string; value: string };

/**
 * Parse a free-text description into labelled sections.
 * Looks for patterns like "Timeframe: … Budget: … Access: …"
 * and returns [{ label, value }, …].
 * Falls back gracefully if there are no "Label:" pairs.
 */
export function parseDescriptionSections(desc: string): DescriptionSection[] {
  const clean = (desc || "").trim();
  if (!clean || clean === "No description provided.") return [];

  const sections: DescriptionSection[] = [];
  const re =
    /([A-Za-z][A-Za-z0-9 /&()-]*):\s*([\s\S]*?)(?=(?:[A-Za-z][A-Za-z0-9 /&()-]*:\s)|$)/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(clean)) !== null) {
    const label = match[1]?.trim();
    let value = (match[2] || "").trim();
    // Strip leading dash/bullet if present
    value = value.replace(/^[-–•]\s*/, "");
    if (!label || !value) continue;
    sections.push({ label, value });
  }

  return sections;
}

type Props = {
  project: ProjectDetailsProject;
  /** Optional button / action in the top-right (e.g. "Express interest") */
  headerAction?: React.ReactNode;
  /** Optional extra block under the description (e.g. neighbour CTA) */
  ctaBlock?: React.ReactNode;
};

/**
 * Shared “Project details” card used in:
 * - Tradesman project accordion rows
 * - Neighbour project view
 */
export default function ProjectDetailsSummaryCard({
  project,
  headerAction,
  ctaBlock,
}: Props) {
  const propType = project.propertyType || "—";
  const bedrooms =
    typeof project.bedrooms === "number" ? project.bedrooms : "—";

  const status: ProjectStatus = project.status || "live";

  const descriptionRaw =
    project.description && String(project.description).trim().length > 0
      ? String(project.description)
      : "No description provided.";

  const descriptionSections = parseDescriptionSections(descriptionRaw);

  const createdLabel = project.createdAt
    ? new Date(project.createdAt).toLocaleString()
    : "—";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Project details
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Summary of this homeowner&apos;s job.
          </p>
        </div>

        {headerAction && <div>{headerAction}</div>}
      </div>

      {/* Badges row */}
      <div
        className="mb-3 flex flex-wrap gap-2 text-xs"
        data-testid="project-badges-inline"
      >
        <span className="badge blue">{project.type}</span>
        <span className="badge gray">{project.location}</span>
        <span className="badge orange capitalize">{propType}</span>
        <span className="badge green">
          {bedrooms} bed{bedrooms === 1 ? "" : ""}
        </span>
        <span>
          <StatusBadge value={status as any} />
        </span>
      </div>

      {/* Spec grid */}
      <dl className="grid grid-cols-1 gap-y-3 gap-x-10 sm:grid-cols-2 text-sm">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Type
          </dt>
          <dd className="mt-0.5 font-medium">{project.type || "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Location
          </dt>
          <dd className="mt-0.5 font-medium">{project.location || "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Property
          </dt>
          <dd className="mt-0.5 font-medium capitalize">{propType}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Bedrooms
          </dt>
          <dd className="mt-0.5 font-medium">{bedrooms}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Status
          </dt>
          <dd className="mt-0.5 font-medium">
            <StatusBadge value={status as any} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Created
          </dt>
          <dd className="mt-0.5 font-medium">{createdLabel}</dd>
        </div>
      </dl>

      {/* Description block */}
      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
        <h4 className="mb-1 text-sm font-semibold text-slate-900">
          Description
        </h4>

        {descriptionSections.length <= 1 ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {descriptionRaw}
          </p>
        ) : (
          <dl className="mt-2 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {descriptionSections.map((sec) => (
              <div key={sec.label}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {sec.label}
                </dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {sec.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {ctaBlock && <div className="mt-4">{ctaBlock}</div>}
    </section>
  );
}
