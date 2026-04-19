import Head from "next/head";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Recommendation } from "@/types/vmb";
import NotFound from "@/pages/404";
import { GoogleRatingChip } from "@/components/GoogleRatingChip";

const PAGE_SIZE = 10;

export default function VettedBusinessesPage() {
  const api = useApi();
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();

  const [items, setItems] = useState<Recommendation[]>([]);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id || authLoading || !user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // Fetch project name
        const projRes = await api.get(`/api/projects/${id}`);
        if (!cancelled) {
          setProjectName(projRes.data?.project?.name || "");
        }

        // Fetch all recommendations and filter to pipeline only
        const res = await api.get(`/api/projects/${id}/recommendations`, {
          params: { limit: 100 },
        });
        if (!cancelled) {
          const all = res.data?.items || [];
          setItems(all.filter((r: Recommendation) => r.source === "pipeline"));
        }
      } catch (err: any) {
        if (!cancelled && err?.response?.status === 404) {
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [api, id, authLoading, user]);

  // Lazy load: observe sentinel element at bottom of visible items
  useEffect(() => {
    if (!sentinelRef.current || visibleCount >= items.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, items.length));
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleCount, items.length]);

  if (notFound) return <NotFound />;

  return (
    <AuthedOnly>
      <Head>
        <title>Vetted Local Businesses — VetMyBuilder</title>
      </Head>

      <div className="overflow-x-hidden -mt-14 min-h-screen">
        <div className="relative min-h-screen overflow-hidden">
          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-16">

            <button
              type="button"
              onClick={() => router.back()}
              className="hidden sm:inline-flex items-center gap-2 mb-4 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              &larr; Back
            </button>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-sm font-bold">
                  &#10003;
                </span>
                <h1 className="text-xl font-extrabold text-emerald-900">
                  Vetted Local Businesses
                </h1>
              </div>
              <p className="text-sm text-emerald-600 mb-1">
                Pre-vetted via Google Reviews &amp; Companies House
              </p>
              {projectName && (
                <p className="text-xs text-emerald-500 mb-6">
                  For: {projectName}
                </p>
              )}

              {loading ? (
                <p className="text-sm text-emerald-700">Loading...</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-zinc-500">No vetted businesses found for this project.</p>
              ) : (
                <div className="space-y-3">
                  {items.slice(0, visibleCount).map((rec) => (
                    <VettedCardFull key={rec.id} rec={rec} projectId={Number(id)} />
                  ))}
                  {visibleCount < items.length && (
                    <div ref={sentinelRef} className="py-4 text-center text-sm text-emerald-600">
                      Loading more...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthedOnly>
  );
}

function VettedCardFull({ rec, projectId }: { rec: Recommendation; projectId: number }) {
  const hasProfile = !!(rec.tradesmanPublicId || rec.linked_tradesman_uid);

  // Extract Google rating from comment: "...with 4.80 stars from 187 Google reviews"
  const ratingMatch = rec.comment?.match(/(\d+\.\d+)\s*stars?\s*from\s*(\d+)\s*Google/i);
  const googleRating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
  const googleReviewCount = ratingMatch ? parseInt(ratingMatch[2], 10) : null;

  return (
    <div
      className={`rounded-xl border bg-white p-4 sm:p-5 transition-all ${
        hasProfile
          ? "border-emerald-200 hover:border-emerald-400 hover:shadow-md"
          : "border-emerald-100"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="font-bold text-base text-zinc-900">{rec.company}</div>

          {googleRating != null && (
            <div className="mt-1">
              <GoogleRatingChip rating={googleRating} count={googleReviewCount} />
            </div>
          )}

          {rec.comment && (
            <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
              {rec.comment}
            </p>
          )}

          {(rec.phone || rec.companyEmail) && (
            <div className="mt-2 text-sm text-zinc-500 space-y-1">
              {rec.phone && (
                <div>
                  <span className="text-zinc-400 text-xs">Phone: </span>
                  <a href={`tel:${rec.phone}`} className="text-blue-600 hover:text-blue-500">
                    {rec.phone}
                  </a>
                </div>
              )}
              {rec.companyEmail && (
                <div>
                  <span className="text-zinc-400 text-xs">Email: </span>
                  <a href={`mailto:${rec.companyEmail}`} className="text-blue-600 hover:text-blue-500">
                    {rec.companyEmail}
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              Vetted local business
            </span>
          </div>

          {hasProfile ? (
            <Link
              href={`/tradesman/${rec.tradesmanPublicId || rec.linked_tradesman_uid}?projectId=${projectId}`}
              className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
            >
              View full profile on VetMyBuilder &rarr;
            </Link>
          ) : (
            <p className="mt-3 text-xs text-zinc-400 italic">
              Not yet on VetMyBuilder — contact directly
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
