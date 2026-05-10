// web/components/project/ProjectMobileRecsStrip.tsx
//
// Mobile-only "From your community" strip on the homeowner project detail
// page. Surfaces off-platform recommendations the project has received
// (the desktop equivalent lives in the right rail of /projects/<id>).
//
// Caps the list at 3 rows; if there are more, a "Show N more" toggle
// expands the list in-place. Tapping a row routes to the per-rec detail
// page at /projects/<id>/recommendations/<recId>.

import { useRouter } from "next/router";
import { useState } from "react";

export type ProjectMobileRec = {
  recommendationId: number;
  company: string;
  recommenderName?: string | null;
  coverPhotoUrl?: string | null;
};

type Props = {
  projectId: string | number;
  recs: ProjectMobileRec[];
};

const COLLAPSED_COUNT = 3;

export default function ProjectMobileRecsStrip({ projectId, recs }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  if (!recs || recs.length === 0) return null;

  const visible = expanded ? recs : recs.slice(0, COLLAPSED_COUNT);
  const collapsible = recs.length > COLLAPSED_COUNT;
  const hiddenCount = recs.length - COLLAPSED_COUNT;

  return (
    <section
      className="px-4 pb-3"
      data-testid="project-mobile-recommendations"
    >
      <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-1">
        Recommendations
      </div>
      <h3
        className="text-[16px] font-black tracking-tight text-slate-900 leading-tight mb-2"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        From your{" "}
        <span
          className="text-indigo-600"
          style={{ fontFamily: "'Caveat', cursive", fontSize: "115%" }}
        >
          community
        </span>
      </h3>
      <div className="bg-white border border-amber-100 rounded-2xl divide-y divide-slate-100 shadow-sm">
        <ul>
          {visible.map((rc) => (
            <li key={rc.recommendationId}>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/builders/${rc.recommendationId}?projectId=${projectId}`,
                  )
                }
                className="w-full text-left flex items-center gap-3 px-4 py-3 active:bg-stone-50/60 transition-colors"
                data-testid={`project-mobile-rec-${rc.recommendationId}`}
              >
                {rc.coverPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rc.coverPhotoUrl}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span
                    className="w-10 h-10 rounded-full text-white flex items-center justify-center text-[13px] font-black shrink-0"
                    style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                    aria-hidden
                  >
                    {(rc.company || "?").charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-extrabold text-slate-900 truncate">
                    {rc.company}
                  </div>
                  {rc.recommenderName && (
                    <div className="text-[11px] text-slate-500 truncate">
                      by {rc.recommenderName}
                    </div>
                  )}
                </div>
                <span className="text-slate-400 text-[16px] shrink-0" aria-hidden>›</span>
              </button>
            </li>
          ))}
        </ul>
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            data-testid="project-mobile-recs-toggle"
            className="w-full px-4 py-3 text-[12.5px] font-extrabold text-indigo-600 hover:text-indigo-700 active:bg-stone-50/60 transition-colors"
          >
            {expanded ? "Show less" : `Show ${hiddenCount} more`}
          </button>
        )}
      </div>
    </section>
  );
}
