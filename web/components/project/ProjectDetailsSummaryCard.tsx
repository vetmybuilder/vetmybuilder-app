import * as React from "react";
import StatusBadge from "@/components/StatusBadge";
import {
  Wrench, MapPin, Home, BedDouble, CalendarDays,
  Clock, PoundSterling, Package, KeyRound,
} from "lucide-react";

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
    value = value.replace(/^[-–•]\s*/, "");
    if (!label || !value) continue;
    sections.push({ label, value });
  }

  return sections;
}

const SECTION_ICONS: Record<string, React.ElementType> = {
  timeframe: Clock,
  budget: PoundSterling,
  materials: Package,
  access: KeyRound,
};

type Props = {
  project: ProjectDetailsProject;
  headerAction?: React.ReactNode;
  ctaBlock?: React.ReactNode;
};

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
    <section className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-white via-stone-50/50 to-zinc-50 px-5 py-5 shadow-md">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-zinc-900">Project details</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Summary of this homeowner&apos;s job.</p>
        </div>
        {headerAction && <div>{headerAction}</div>}
      </div>

      {/* Icon pills row */}
      <div className="mb-5 flex flex-wrap gap-2" data-testid="project-badges-inline">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          <Wrench className="h-3 w-3" />{project.type}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
          <MapPin className="h-3 w-3" />{project.location}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 capitalize">
          <Home className="h-3 w-3" />{propType}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <BedDouble className="h-3 w-3" />{bedrooms} bed
        </span>
        <span><StatusBadge value={status as any} /></span>
      </div>

      {/* Spec grid */}
      <dl className="grid grid-cols-2 gap-4 text-sm">
        {[
          { icon: Wrench,       label: "Type",     value: project.type || "—" },
          { icon: MapPin,       label: "Location",  value: project.location || "—" },
          { icon: Home,         label: "Property",  value: propType, className: "capitalize" },
          { icon: BedDouble,    label: "Bedrooms",  value: String(bedrooms) },
          { icon: CalendarDays, label: "Created",   value: createdLabel },
        ].map(({ icon: Icon, label, value, className }) => (
          <div key={label} className="flex items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</dt>
              <dd className={`mt-0.5 font-semibold text-zinc-800 ${className ?? ""}`}>{value}</dd>
            </div>
          </div>
        ))}
        <div className="flex items-start gap-2">
          <span className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Status</dt>
            <dd className="mt-0.5"><StatusBadge value={status as any} /></dd>
          </div>
        </div>
      </dl>

      {/* Description block */}
      {descriptionSections.length > 0 && (
        <div className="mt-5 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-4">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Description</h4>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {descriptionSections.map((sec) => {
              const Icon = SECTION_ICONS[sec.label.toLowerCase()] ?? null;
              return (
                <div key={sec.label} className="flex items-start gap-2">
                  {Icon && <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />}
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{sec.label}</dt>
                    <dd className="mt-0.5 text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">{sec.value}</dd>
                  </div>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {descriptionSections.length === 0 && descriptionRaw !== "No description provided." && (
        <div className="mt-5 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-4">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-400">Description</h4>
          <p className="text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">{descriptionRaw}</p>
        </div>
      )}

      {ctaBlock && <div className="mt-4">{ctaBlock}</div>}
    </section>
  );
}
