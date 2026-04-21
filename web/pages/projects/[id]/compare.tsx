import Head from "next/head";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import { useEffect, useState } from "react";
import {
  computeAggregateScore,
  normalizedCompanyKey,
} from "@/utils/vmb";

/* ===== Types ===== */
type Recommendation = {
  id: number;
  name: string | null;
  email: string | null;
  company: string;
  comment: string | null;
  likes?: number;
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
  score?: number;
  source?: string | null;
  linked_tradesman_uid?: string | null;
  tradesmanPublicId?: string | null;
  createdAt: string;
};

type Verification = {
  recommendationId: number;
  status: string;
  companyNumber?: string | null;
  companyName?: string | null;
  score?: number | null;
  googleRating?: number | null;
  googleReviewsCount?: number | null;
  googlePlaceId?: string | null;
};

type ProjectLite = { id: number; name: string; ownerUserId: string };

type Grouped = {
  key: string;
  company: string;
  companyNumber?: string | null;
  items: Recommendation[];
  aggLikes: number;
  aggScore?: number;
  verification?: Verification | null;
  recCount: number;
};

/* ===== Helpers ===== */
function groupByCompany(
  items: Recommendation[],
  verMap: Record<number, Verification>
): Grouped[] {
  const map = new Map<string, { company: string; companyNumber: string | null; items: Recommendation[] }>();
  for (const it of items) {
    const v = verMap[it.id];
    const chNumber = (v?.companyNumber || "").trim() || null;
    const candidateName = (v?.companyName || it.company || "").trim();
    const nameKey = normalizedCompanyKey(candidateName);
    const key = chNumber ? `#${chNumber}` : `n:${nameKey}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { company: candidateName, companyNumber: chNumber, items: [] };
      map.set(key, bucket);
    }
    bucket.items.push(it);
  }

  const groups: Grouped[] = [];
  for (const [key, b] of map.entries()) {
    const scores = b.items.map((i) => (typeof i.score === "number" ? i.score : null));
    const top = [...b.items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
    const aggScore = b.items.length >= 2 ? computeAggregateScore(scores, b.items.length) : top?.score;
    const aggLikes = b.items.reduce((s, it) => s + (it.likes ?? 0), 0);
    // Pick the best verification across all recs in the group (prefer one with Google data)
    let bestVer: Verification | null = null;
    for (const it of b.items) {
      const v = verMap[it.id];
      if (!v) continue;
      if (!bestVer || (v.googleRating && !bestVer.googleRating) || (v.status === "verified" && bestVer.status !== "verified")) {
        bestVer = v;
      }
    }
    groups.push({ key, company: b.company, companyNumber: b.companyNumber, items: b.items, aggLikes, aggScore, verification: bestVer, recCount: b.items.length });
  }
  return groups.sort((a, b) => (b.aggScore ?? -1) - (a.aggScore ?? -1));
}

function scoreColor(score: number | undefined): string {
  if (typeof score !== "number" || Number.isNaN(score)) return "bg-slate-400";
  if (score >= 55) return "bg-emerald-500";
  if (score >= 30) return "bg-amber-500";
  return "bg-red-500";
}

function verStatusLabel(status?: string) {
  if (status === "verified") return { text: "Verified", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (status === "ambiguous") return { text: "Partial match", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (status === "no_match") return { text: "Not found", cls: "bg-red-50 text-red-700 border-red-200" };
  return { text: "Pending", cls: "bg-zinc-50 text-zinc-500 border-zinc-200" };
}

/* ===== Page ===== */
export default function ComparePage() {
  return (
    <AuthedOnly>
      <CompareInner />
    </AuthedOnly>
  );
}

function CompareInner() {
  const api = useApi();
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();

  const [project, setProject] = useState<ProjectLite | null>(null);
  const [groups, setGroups] = useState<Grouped[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;
    (async () => {
      try {
        const [projRes, recsRes] = await Promise.all([
          api.get(`/api/projects/${id}`),
          api.get(`/api/projects/${id}/recommendations?limit=100`),
        ]);
        if (!alive) return;

        const p = projRes.data?.project;
        if (!p) { setNotFound(true); setLoading(false); return; }
        setProject({ id: p.id, name: p.name, ownerUserId: p.ownerUserId });

        const items: Recommendation[] = recsRes.data?.items || [];
        const verMap: Record<number, Verification> = {};
        await Promise.all(
          items.map(async (it) => {
            try {
              const { data } = await api.get(`/api/recommendations/${it.id}/verification`);
              if (data?.verification) verMap[it.id] = data.verification;
            } catch {}
          })
        );

        const g = groupByCompany(items, verMap);
        setGroups(g);
        const mobile = typeof window !== "undefined" && window.innerWidth < 1024;
        const limit = mobile ? 2 : 4;
        setSelected(g.slice(0, Math.min(limit, g.length)).map((x) => x.key));
      } catch { setNotFound(true); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [api, id, router.isReady, authLoading, user]);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const maxCompare = isMobile ? 2 : 4;

  function toggle(key: string) {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= maxCompare) return prev;
      return [...prev, key];
    });
  }

  const comparing = groups.filter((g) => selected.includes(g.key));
  const bestKey = comparing.length > 0
    ? comparing.reduce((best, g) => ((g.aggScore ?? -1) > (best.aggScore ?? -1) ? g : best)).key
    : null;

  if (loading) {
    return <div className="py-20 text-center text-zinc-500">Loading...</div>;
  }

  if (notFound) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-black text-zinc-900 mb-2">Project not found</h1>
        <p className="text-zinc-500 mb-6">This project may have been deleted or you don't have access.</p>
        <Link href="/projects" className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white hover:bg-red-600 transition-colors">
          Back to my jobs
        </Link>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Compare Tradespeople - VetMyBuilder</title>
      </Head>

      <div className="relative min-h-screen overflow-x-hidden -mt-14">
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-16">

          <Link
            href={`/projects/${id}/shortlist`}
            className="hidden sm:inline-flex items-center gap-2 mb-4 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            &#8592; Back to shortlist
          </Link>

          <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-5 sm:px-8 sm:py-6 border-b border-zinc-100">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900">Compare Tradespeople</h1>
              {project && <p className="mt-1 text-sm text-zinc-500">{project.name}</p>}
            </div>

            {/* Sidebar + Table layout */}
            <div className="flex flex-col lg:flex-row min-h-[400px]">

              {/* Sidebar checklist */}
              <div className="w-full lg:w-64 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-100 bg-zinc-50/50 p-4 overflow-y-auto">
                <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                  Select to compare
                </h2>
                <div className="flex flex-col gap-1.5">
                  {groups.map((g) => {
                    const isOn = selected.includes(g.key);
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => toggle(g.key)}
                        className={`w-full flex items-center gap-3 p-2.5 lg:p-3 rounded-xl text-left transition-colors ${
                          isOn
                            ? "bg-red-50 border border-red-200"
                            : "hover:bg-zinc-100 border border-transparent"
                        }`}
                      >
                        {/* Checkbox */}
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                          isOn ? "bg-red-500 border-red-500" : "border-zinc-300"
                        }`}>
                          {isOn && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-zinc-900 truncate">{g.company}</div>
                          <div className="text-xs text-zinc-500 hidden lg:block">
                            Score: {typeof g.aggScore === "number" ? Math.round(g.aggScore) : "-"} - {g.recCount} rec{g.recCount !== 1 ? "s" : ""}
                          </div>
                        </div>

                        {/* Score circle */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${scoreColor(g.aggScore)}`}>
                          {typeof g.aggScore === "number" ? Math.round(g.aggScore) : "-"}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-zinc-400 mt-4">
                  {selected.length} of {groups.length} selected (max {maxCompare})
                </p>
              </div>

              {/* Comparison - cards on mobile, table on desktop */}
              <div className="flex-1 overflow-x-auto">
                {comparing.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-zinc-400 text-sm p-8">
                    Select tradespeople from the list to compare
                  </div>
                ) : (
                  <>
                  {/* Mobile: horizontal scroll table (Which? style) */}
                  <div className="lg:hidden">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="w-20 p-3 text-left text-[11px] font-semibold text-zinc-400 bg-zinc-50 border-b border-zinc-200 sticky left-0 z-10" />
                          {comparing.map((g) => (
                            <th key={g.key} className={`p-3 text-center border-b border-zinc-200 ${g.key === bestKey ? "bg-amber-50/50" : "bg-white"}`}>
                              {g.key === bestKey && (
                                <span className="inline-block bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full mb-1">Best match</span>
                              )}
                              <div className="font-bold text-xs text-zinc-900">{g.company}</div>
                              <button type="button" onClick={() => toggle(g.key)} className="text-zinc-400 hover:text-red-500 text-[10px] mt-1">&#10005; remove</button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <MobileRow label="Score" bestKey={bestKey} comparing={comparing} even={false}>
                          {(g) => (
                            <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-white font-bold text-xs ${scoreColor(g.aggScore)}`}>
                              {typeof g.aggScore === "number" ? Math.round(g.aggScore) : "-"}
                            </span>
                          )}
                        </MobileRow>
                        <MobileRow label="Google" bestKey={bestKey} comparing={comparing} even={true}>
                          {(g) => {
                            const v = g.verification;
                            if (!v?.googleRating) return <span className="text-xs text-zinc-400">-</span>;
                            return <span><span className="font-bold text-sm">{v.googleRating.toFixed(1)}</span><span className="text-amber-400 ml-0.5">&#9733;</span><span className="text-xs text-zinc-500 ml-1">({v.googleReviewsCount ?? 0})</span></span>;
                          }}
                        </MobileRow>
                        <MobileRow label="Votes" bestKey={bestKey} comparing={comparing} even={false}>
                          {(g) => <span className="font-bold text-zinc-900">{g.aggLikes}</span>}
                        </MobileRow>
                        <MobileRow label="Recs" bestKey={bestKey} comparing={comparing} even={true}>
                          {(g) => <span className="font-bold text-zinc-900">{g.recCount}</span>}
                        </MobileRow>
                        <MobileRow label="Check" bestKey={bestKey} comparing={comparing} even={false}>
                          {(g) => {
                            const l = verStatusLabel(g.verification?.status);
                            return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${l.cls}`}>{l.text}</span>;
                          }}
                        </MobileRow>
                        <tr>
                          <td className="p-3 bg-zinc-50 border-t border-zinc-200 sticky left-0 z-10" />
                          {comparing.map((g) => {
                            const item = g.items.find((i) => i.tradesmanPublicId || i.linked_tradesman_uid);
                            const pid = item?.tradesmanPublicId || item?.linked_tradesman_uid;
                            return (
                              <td key={g.key} className={`p-3 text-center border-t border-zinc-200 ${g.key === bestKey ? "bg-amber-50/30" : ""}`}>
                                {pid ? <Link href={`/tradesman/${pid}?projectId=${id}`} className="text-xs font-bold text-red-600">View profile</Link> : <span className="text-xs text-zinc-400">-</span>}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Desktop: table */}
                  <table className="w-full border-collapse hidden lg:table">
                    <thead>
                      <tr>
                        <th className="w-36 p-4 text-left text-sm font-semibold text-zinc-500 bg-zinc-50 border-b-2 border-zinc-200 sticky left-0 z-10" />
                        {comparing.map((g) => (
                          <th key={g.key} className={`p-5 text-center border-b-2 border-zinc-200 ${g.key === bestKey ? "bg-amber-50/50" : ""}`}>
                            {g.key === bestKey && (
                              <span className="inline-block bg-red-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full mb-2">Best match</span>
                            )}
                            <div className="font-bold text-zinc-900 text-sm">{g.company}</div>
                            {g.recCount > 1 && (
                              <div className="text-xs text-zinc-400">{g.recCount} recommendations</div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Match Score */}
                      <Row label="Match Score" bestKey={bestKey} comparing={comparing}>
                        {(g) => (
                          <div className="flex flex-col items-center gap-1">
                            <span className={`inline-flex items-center justify-center w-11 h-11 rounded-full text-white font-bold shadow ${scoreColor(g.aggScore)}`}>
                              {typeof g.aggScore === "number" ? Math.round(g.aggScore) : "-"}
                            </span>
                            <div className="w-16 h-1.5 rounded-full bg-zinc-200 mt-1">
                              <div className={`h-full rounded-full ${scoreColor(g.aggScore)}`} style={{ width: `${Math.min(100, g.aggScore ?? 0)}%` }} />
                            </div>
                          </div>
                        )}
                      </Row>

                      {/* Google Rating */}
                      <Row label="Google Rating" bestKey={bestKey} comparing={comparing}>
                        {(g) => {
                          const v = g.verification;
                          if (!v?.googleRating) return <span className="text-sm text-zinc-400">No data</span>;
                          return (
                            <div className="flex flex-col items-center">
                              <div className="text-lg font-bold text-zinc-900">{v.googleRating.toFixed(1)}</div>
                              <div className="flex gap-0.5">
                                {[...Array(5)].map((_, i) => (
                                  <svg key={i} className={`h-3.5 w-3.5 ${i < Math.round(v.googleRating!) ? "text-amber-400 fill-current" : "text-zinc-200 fill-current"}`} viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                ))}
                              </div>
                              <div className="text-xs text-zinc-500 mt-0.5">{v.googleReviewsCount ?? 0} reviews</div>
                            </div>
                          );
                        }}
                      </Row>

                      {/* Community Votes */}
                      <Row label="Community Votes" bestKey={bestKey} comparing={comparing}>
                        {(g) => (
                          <div className="text-center">
                            <div className="text-xl font-bold text-zinc-900">{g.aggLikes}</div>
                            <div className="text-xs text-zinc-500">vote{g.aggLikes !== 1 ? "s" : ""}</div>
                          </div>
                        )}
                      </Row>

                      {/* Recommendations */}
                      <Row label="Recommendations" bestKey={bestKey} comparing={comparing}>
                        {(g) => (
                          <div className="text-center">
                            <div className="text-xl font-bold text-zinc-900">{g.recCount}</div>
                            <div className="text-xs text-zinc-500">on this job</div>
                          </div>
                        )}
                      </Row>

                      {/* Business Check */}
                      <Row label="Business Check" bestKey={bestKey} comparing={comparing}>
                        {(g) => {
                          const label = verStatusLabel(g.verification?.status);
                          return (
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${label.cls}`}>
                              {label.text}
                            </span>
                          );
                        }}
                      </Row>

                      {/* Recommended by */}
                      <Row label="Recommended by" bestKey={bestKey} comparing={comparing}>
                        {(g) => {
                          const tags: string[] = [];
                          if (g.items.some((i) => i.fromFriend === 1)) tags.push("Friend");
                          if (g.items.some((i) => i.fromCommunity === 1)) tags.push("Community");
                          if (g.items.some((i) => i.source === "pipeline")) tags.push("Registered tradesperson");
                          if (tags.length === 0) tags.push("Community");
                          return (
                            <div className="flex flex-wrap gap-1 justify-center">
                              {tags.map((t) => (
                                <span key={t} className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600">{t}</span>
                              ))}
                            </div>
                          );
                        }}
                      </Row>

                      {/* Actions */}
                      <tr>
                        <td className="p-4 bg-zinc-50 border-t border-zinc-200 sticky left-0 z-10" />
                        {comparing.map((g) => {
                          const profileItem = g.items.find((i) => i.tradesmanPublicId || i.linked_tradesman_uid);
                          const profileId = profileItem?.tradesmanPublicId || profileItem?.linked_tradesman_uid;
                          return (
                            <td key={g.key} className={`p-4 text-center border-t border-zinc-200 ${g.key === bestKey ? "bg-amber-50/50" : ""}`}>
                              {profileId ? (
                                <Link
                                  href={`/tradesman/${profileId}?projectId=${id}`}
                                  className="inline-flex items-center justify-center rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-600 transition-colors"
                                >
                                  View profile
                                </Link>
                              ) : (
                                <span className="text-sm text-zinc-400">No profile</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ===== Reusable row ===== */
function Row({
  label,
  bestKey,
  comparing,
  children,
}: {
  label: string;
  bestKey: string | null;
  comparing: Grouped[];
  children: (g: Grouped) => React.ReactNode;
}) {
  return (
    <tr>
      <td className="p-4 text-sm font-semibold text-zinc-500 bg-zinc-50 border-b border-zinc-100 sticky left-0 z-10">
        {label}
      </td>
      {comparing.map((g) => (
        <td key={g.key} className={`p-4 text-center border-b border-zinc-100 ${g.key === bestKey ? "bg-amber-50/50" : ""}`}>
          {children(g)}
        </td>
      ))}
    </tr>
  );
}

function MobileRow({
  label,
  bestKey,
  comparing,
  children,
  even,
}: {
  label: string;
  bestKey: string | null;
  comparing: Grouped[];
  children: (g: Grouped) => React.ReactNode;
  even?: boolean;
}) {
  const rowBg = even ? "bg-zinc-50/60" : "";
  return (
    <tr>
      <td className={`p-3 text-[11px] font-semibold text-zinc-400 uppercase border-b border-zinc-100 sticky left-0 z-10 ${even ? "bg-zinc-100" : "bg-zinc-50"}`}>
        {label}
      </td>
      {comparing.map((g) => (
        <td key={g.key} className={`p-3 text-center border-b border-zinc-100 ${g.key === bestKey ? "bg-amber-50/30" : rowBg}`}>
          {children(g)}
        </td>
      ))}
    </tr>
  );
}
