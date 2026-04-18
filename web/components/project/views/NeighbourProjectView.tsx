// web/components/project/views/NeighbourProjectView.tsx
import * as React from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { parseDescriptionSections } from "@/components/project/ProjectDetailsSummaryCard";
import { useAuth } from "@/utils/auth";
import {
  Wrench, MapPin, Home, BedDouble,
  Clock, PoundSterling, Package, KeyRound, UserPlus,
} from "lucide-react";

type VM = ReturnType<typeof import("./useProjectView").useProjectView>;

const SECTION_ICONS: Record<string, React.ElementType> = {
  timeframe: Clock,
  budget: PoundSterling,
  materials: Package,
  access: KeyRound,
};

export default function NeighbourProjectView({ vm }: { vm: VM }) {
  const { project } = vm;
  const { user } = useAuth();

  if (!project) return null;

  const propType = project.propertyType || "—";
  const bedrooms = typeof project.bedrooms === "number" ? project.bedrooms : "—";
  const status = project.status || "live";

  const descriptionRaw =
    project.description && String(project.description).trim().length > 0
      ? String(project.description)
      : "";

  const descriptionSections = parseDescriptionSections(descriptionRaw);

  const postedLabel = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <>
      {user && (
        <div className="mb-3">
          <Link
            href={{ pathname: "/projects", query: { tab: "mine" } }}
            className="hidden sm:inline-flex items-center gap-2 mb-3 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            data-testid="link-back-to-projects-neighbour"
          >
            <span aria-hidden>←</span>
            <span>Back to Jobs</span>
          </Link>
        </div>
      )}

      <div className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-4 sm:p-6 md:p-8">
        {/* Hero heading */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900">
            {project.type || "Project"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Posted by a homeowner in your area
          </p>
        </div>

        {/* Badges */}
        <div className="mb-6 flex flex-wrap gap-2" data-testid="project-badges-inline">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <Wrench className="h-3 w-3" />
            {project.type}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
            <MapPin className="h-3 w-3" />
            {project.location}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 capitalize">
            <Home className="h-3 w-3" />
            {propType}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <BedDouble className="h-3 w-3" />
            {bedrooms} bed
          </span>
          <StatusBadge value={status as any} />
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column: details (3/5) */}
          <div className="lg:col-span-3 space-y-5">
            {/* Spec grid */}
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-5">
              <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-400">
                Job details
              </h4>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                {descriptionSections.map((sec) => {
                  const Icon = SECTION_ICONS[sec.label.toLowerCase()] ?? null;
                  return (
                    <div key={sec.label} className="flex items-start gap-2">
                      {Icon && (
                        <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                      )}
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                          {sec.label}
                        </dt>
                        <dd className="mt-0.5 font-semibold text-zinc-800 whitespace-pre-wrap">
                          {sec.value}
                        </dd>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      Posted
                    </dt>
                    <dd className="mt-0.5 font-semibold text-zinc-800">
                      {postedLabel}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>

            {/* Description (free-text fallback when no structured sections) */}
            {descriptionSections.length === 0 && descriptionRaw && (
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-5">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">
                  Description
                </h4>
                <p className="text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">
                  {descriptionRaw}
                </p>
              </div>
            )}
          </div>

          {/* Right column: CTA card (2/5) */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-stone-50 p-6 lg:sticky lg:top-24">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500 mb-4">
                <UserPlus className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-black text-zinc-900">
                Know someone good?
              </h3>
              <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
                If you know a tradesperson who&apos;d be right for this job,
                recommend them. The more people who vouch for someone, the
                easier it is for the homeowner to hire with confidence.
              </p>
              <Link
                href={`/projects/${project.id}/recommend`}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/20 hover:bg-red-600 hover:shadow-xl transition-all"
                data-testid="btn-neighbour-recommend"
              >
                Recommend a tradesperson
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 12h14m-6-6l6 6-6 6"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
