// web/components/project/TradesmanProfileModal.tsx
//
// Centred 2-column modal showing a tradesperson's profile, opened from
// the homeowner's chat header on /projects/[id]. Indigo chrome (homeowner
// POV); emerald reserved for trade credibility markers (Verified pill,
// trade chips). Reuses /api/tradesmen/:id and the existing PhotoLightbox.
//
// Gallery loads first 4 photos eagerly, then lazy-loads 4 more each time
// the user scrolls the in-modal sentinel into view. Clicking any photo
// opens the lightbox with full navigation across the entire gallery.

import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/utils/api";
import PhotoLightbox from "@/components/PhotoLightbox";

type TradesmanDetail = {
  builderId: string;
  companyName: string | null;
  displayName: string | null;
  badges: { companiesHouseVerified: boolean; insuranceValid: boolean };
  avatarUrl: string | null;
  gallery: string[];
  stats: { completed: number; photos: number; reviews: number; stars: number };
  location?: { outward?: string | null };
  serviceAreas?: string[] | null;
  tradeTypes?: string | null;
  createdAt?: string | null;
  warrantyMonths?: number;
  googleRating?: number | null;
  googleReviewsCount?: number | null;
};

const INITIAL_PHOTOS = 4;
const PAGE_SIZE = 4;

function formatMemberSince(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function splitCsv(v?: string | null): string[] {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function TradesmanProfileModal({
  open,
  onClose,
  builderUid,
}: {
  open: boolean;
  onClose: () => void;
  builderUid: string | null;
}) {
  const api = useApi();
  const [data, setData] = useState<TradesmanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_PHOTOS);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement | null>(null);

  // Fetch on open
  useEffect(() => {
    if (!open || !builderUid) return;
    let alive = true;
    setLoading(true);
    setErrorMsg(null);
    setVisibleCount(INITIAL_PHOTOS);
    (async () => {
      try {
        const res = await api.get<{ item: TradesmanDetail }>(
          `/api/tradesmen/${encodeURIComponent(builderUid)}`,
        );
        if (alive) setData(res.data?.item || null);
      } catch (e: any) {
        if (alive) setErrorMsg(e?.message || "Could not load profile");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, builderUid, api]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock background scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Lazy-load: when the sentinel scrolls into view inside the gallery
  // column, reveal another batch of photos.
  useEffect(() => {
    if (!open || !sentinelRef.current) return;
    const total = data?.gallery?.length || 0;
    if (visibleCount >= total) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, total));
        }
      },
      { root: galleryScrollRef.current || undefined, rootMargin: "120px" },
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [open, data?.gallery?.length, visibleCount]);

  const gallery = useMemo(() => data?.gallery || [], [data?.gallery]);
  const trades = useMemo(() => splitCsv(data?.tradeTypes), [data?.tradeTypes]);
  const areas = useMemo(
    () =>
      Array.isArray(data?.serviceAreas)
        ? data!.serviceAreas!
        : splitCsv(typeof data?.serviceAreas === "string" ? data?.serviceAreas : ""),
    [data?.serviceAreas],
  );
  const memberSince = formatMemberSince(data?.createdAt);
  const star =
    typeof data?.stats?.stars === "number"
      ? data.stats.stars
      : data?.googleRating;
  const reviewCount =
    typeof data?.stats?.reviews === "number" && data.stats.reviews > 0
      ? data.stats.reviews
      : data?.googleReviewsCount || 0;
  const verified = !!data?.badges?.companiesHouseVerified;
  const initial = (data?.companyName || data?.displayName || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{
          background: "rgba(15,23,42,0.55)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Tradesperson profile"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-[860px] max-h-[88vh] overflow-hidden flex flex-col"
        >
          {/* Hero band */}
          <div
            className="relative px-7 pt-7 pb-6 text-white"
            style={{
              backgroundImage:
                "linear-gradient(160deg, #312e81 0%, #4f46e5 60%, #a5b4fc 100%)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/25 backdrop-blur flex items-center justify-center text-white hover:bg-white/35 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="flex items-end gap-5">
              {data?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.avatarUrl}
                  alt=""
                  className="w-20 h-20 rounded-2xl object-cover shadow-xl border-4 border-white/40"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-white/95 flex items-center justify-center text-3xl font-black text-indigo-700 shadow-xl border-4 border-white/40">
                  {initial}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2
                  className="text-[26px] font-black tracking-tight truncate"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  {data?.companyName || data?.displayName || "Tradesperson"}
                </h2>
                <div className="mt-1 text-[13px] opacity-90">
                  {[data?.location?.outward || null, memberSince ? `Member since ${memberSince}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {verified && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11.5px] font-extrabold text-emerald-700 shadow">
                    <span className="text-[10px]">✓</span> Verified
                  </div>
                )}
              </div>
              {typeof star === "number" && star > 0 && (
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 justify-end text-white">
                    <span>★</span>
                    <span className="font-bold">{Number(star).toFixed(1)}</span>
                  </div>
                  {reviewCount > 0 && (
                    <div className="text-[11px] opacity-80">
                      {reviewCount} review{reviewCount === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Body */}
          {loading ? (
            <div className="px-7 py-10 text-center text-[13px] text-slate-500">
              Loading profile...
            </div>
          ) : errorMsg || !data ? (
            <div className="px-7 py-10 text-center text-[13px] text-slate-500">
              {errorMsg || "Could not load profile"}
            </div>
          ) : (
            <div className="grid md:grid-cols-[1.4fr_1fr] gap-0 flex-1 overflow-hidden">
              {/* Left: trades + areas + about */}
              <div className="px-7 py-6 md:border-r border-amber-100 overflow-y-auto">
                {trades.length > 0 && (
                  <>
                    <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-2">
                      Trades offered
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {trades.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11.5px] font-bold px-2.5 py-1"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {areas.length > 0 && (
                  <>
                    <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-2">
                      Service areas
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {areas.map((a) => (
                        <span
                          key={a}
                          className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11.5px] font-bold px-2.5 py-1"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-2">
                  About
                </div>
                <p className="text-[13.5px] text-slate-700 leading-relaxed">
                  {memberSince ? `On VetMyBuilder since ${memberSince}. ` : ""}
                  {data.stats.completed > 0
                    ? `${data.stats.completed} job${data.stats.completed === 1 ? "" : "s"} completed via the platform.`
                    : "New to the platform."}
                  {data.warrantyMonths
                    ? ` Offers a ${data.warrantyMonths}-month workmanship warranty.`
                    : ""}
                </p>
              </div>

              {/* Right: gallery (lazy) */}
              <div
                ref={galleryScrollRef}
                className="px-6 py-6 bg-indigo-50/40 overflow-y-auto"
              >
                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-3">
                  Recent work{" "}
                  {gallery.length > 0 && (
                    <span className="text-slate-400">({gallery.length})</span>
                  )}
                </div>
                {gallery.length === 0 ? (
                  <div className="text-[12.5px] text-slate-500 italic">
                    No photos uploaded yet.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {gallery.slice(0, visibleCount).map((src, i) => (
                        <button
                          key={`${src}-${i}`}
                          type="button"
                          onClick={() => setLightboxIdx(i)}
                          className="aspect-square rounded-xl overflow-hidden bg-slate-100 hover:opacity-95 transition-opacity"
                          aria-label={`Open photo ${i + 1}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                    {visibleCount < gallery.length && (
                      <div ref={sentinelRef} className="h-6" aria-hidden />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <PhotoLightbox
        open={lightboxIdx !== null}
        photos={gallery}
        initialIndex={lightboxIdx ?? 0}
        onClose={() => setLightboxIdx(null)}
      />
    </>
  );
}
