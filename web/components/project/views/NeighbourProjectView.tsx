// web/components/project/views/NeighbourProjectView.tsx
import * as React from "react";
import Link from "next/link";
import ProjectDetailsSummaryCard from "@/components/project/ProjectDetailsSummaryCard";
import { useAuth } from "@/utils/auth";

type VM = ReturnType<typeof import("./useProjectView").useProjectView>;

export default function NeighbourProjectView({ vm }: { vm: VM }) {
  const { project } = vm;
  const { user } = useAuth(); // 👈 NEW — detect guest vs logged-in

  if (!project) return null;

  const summaryProject = {
    id: project.id,
    type: project.type,
    location: project.location,
    propertyType: project.propertyType,
    bedrooms: project.bedrooms,
    status: project.status,
    createdAt: project.createdAt,
    description: project.description || "No description provided.",
  };

  return (
    <>
      {/* Back to Jobs — ONLY SHOW IF LOGGED IN */}
      {user && (
        <div className="mb-3">
          <Link
            href={{ pathname: "/projects", query: { tab: "mine" } }}
            className="inline-flex items-center gap-2 mb-3 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            data-testid="link-back-to-projects-neighbour"
          >
            <span aria-hidden>←</span>
            <span>Back to Jobs</span>
          </Link>
        </div>
      )}

      {/* Outer translucent card so the global Layout builder image
          doesn't bleed through the project details when a guest /
          neighbour is viewing. Mirrors the legal-page treatment. */}
      <div className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-4 sm:p-6">
        {/* Shared project details card */}
        <section>
          <ProjectDetailsSummaryCard
            project={summaryProject}
            ctaBlock={
              <>
                <h3 className="text-sm font-semibold text-slate-900">
                  Recommend a tradesperson
                </h3>
                <p className="mt-1 text-sm text-slate-600 max-w-xl">
                  If you know a great tradesperson for this kind of work, you
                  can share their details with the homeowner. Your
                  recommendation helps them find trusted people faster.
                </p>

                <div className="mt-3">
                  <Link
                    href={`/projects/${project.id}/recommend`}
                    className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-600"
                    data-testid="btn-neighbour-recommend"
                  >
                    Recommend a tradesperson
                  </Link>
                </div>
              </>
            }
          />
        </section>
      </div>
    </>
  );
}
