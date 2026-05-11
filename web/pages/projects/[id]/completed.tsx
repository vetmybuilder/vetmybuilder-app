// web/pages/projects/[id]/completed.tsx
//
// Editorial / magazine-style completed-project view. Replaces the previous
// single-card gallery with a two-column desktop layout (sticky winner panel
// on the left, masonry photo grid on the right) and a stacked mobile layout.
// Picks the v3 design picked in May 2026; mock lives at /mocks/completed-v3.

import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { Award, Calendar, ChevronLeft, Flag, MapPin } from "lucide-react";
import LightboxGallery, {
  type GalleryImage,
} from "@/components/LightboxGallery";
import ReportModal from "@/components/ReportModal";
import SiteHeader from "@/components/SiteHeader";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";

type Photo = {
  id: number;
  filePath: string;
  fileUrl?: string;
};

type ProjectMeta = {
  id: number;
  name: string;
  location: string;
  completedAt: string | null;
};

type Winner = {
  companyName: string;
  tradesmanUid: string | null;
  profilePictureUrl: string | null;
  trades: string[];
  isVerified: boolean;
  publicId: string | null;
};

function joinUrl(base: string, path: string) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").startsWith("/")
    ? String(path || "")
    : `/${path || ""}`;
  return `${b}${p}`;
}

function computeSrc(p: Photo) {
  if (p.fileUrl && /^https?:\/\//i.test(p.fileUrl)) return p.fileUrl;
  const base = (process.env.NEXT_PUBLIC_API_BASE || "").trim();
  if (base) return joinUrl(base, p.filePath || "");
  return p.filePath || "";
}

function formatCompletedMonth(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

function initialFrom(name?: string | null): string {
  const s = String(name || "").trim();
  return s ? s.charAt(0).toUpperCase() : "?";
}

export default function CompletedGalleryPage() {
  return (
    <AuthedOnly>
      <Inner />
    </AuthedOnly>
  );
}

function Inner() {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const projectId = useMemo(() => {
    const raw = router.query.id;
    const n = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(n) ? n : null;
  }, [router.query.id]);

  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [hiredOffPlatform, setHiredOffPlatform] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!router.isReady || authLoading || !user || !projectId) return;

    let alive = true;
    setLoading(true);
    setErr(null);
    setProject(null);
    setWinner(null);
    setHiredOffPlatform(false);
    setPhotos([]);

    (async () => {
      try {
        const [projectRes, closureRes, photosRes] = await Promise.all([
          api.get(`/api/projects/${projectId}`),
          api.get(`/api/projects/${projectId}/closure`).catch(() => null),
          api.get(`/api/projects/${projectId}/close/photos`).catch(() => null),
        ]);

        if (!alive) return;

        const p = projectRes?.data?.project;
        if (!p) {
          setErr("Project not found.");
          return;
        }
        setProject({
          id: p.id,
          name: p.name || "Untitled project",
          location: p.location || "",
          completedAt: p.completedAt || null,
        });

        const closure = closureRes?.data || null;
        if (closure?.winner) {
          const w = closure.winner;
          let trades: string[] = [];
          let isVerified = false;
          let publicId: string | null = null;

          // Try to enrich with trade types + verified badge from the tradesman
          // profile - only possible when we have a uid (recommendation-only
          // winners may lack one).
          if (w.tradesmanUid) {
            try {
              const tRes = await api.get(`/api/tradesmen/${w.tradesmanUid}`);
              const t = tRes?.data?.item || {};
              const rawTrades = t.tradeTypes || "";
              trades = String(rawTrades)
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean);
              isVerified = !!t?.badges?.companiesHouseVerified;
              publicId = t.publicId || null;
            } catch {
              // non-blocking enrichment
            }
          }

          setWinner({
            companyName: w.company || w.name || "Tradesperson",
            tradesmanUid: w.tradesmanUid || null,
            profilePictureUrl: w.profilePictureUrl || null,
            trades,
            isVerified,
            publicId,
          });
        } else if (closure && closure.didGoAhead === 1) {
          // "Someone else" - off-platform hire
          setHiredOffPlatform(true);
        }

        const photoList: Photo[] = Array.isArray(photosRes?.data?.photos)
          ? photosRes.data.photos
          : [];
        setPhotos(photoList);
      } catch (e: any) {
        if (!alive) return;
        const msg =
          e?.response?.data?.error ||
          e?.message ||
          (e?.response?.status === 401
            ? "Missing bearer token"
            : "Failed to load project.");
        setErr(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, router.isReady, authLoading, user, projectId]);

  const galleryImages: GalleryImage[] = useMemo(() => {
    return (photos || []).map((p, i) => {
      const src = computeSrc(p);
      return {
        id: i,
        thumbUrl: src,
        fullUrl: src,
        alt: `Completed project photo ${i + 1}`,
      };
    });
  }, [photos]);

  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/projects");
    }
  };

  const completedLabel = formatCompletedMonth(project?.completedAt ?? null);

  return (
    <div
      className="min-h-screen bg-white md:bg-[#fef6e9] relative overflow-hidden"
      data-testid="completed-gallery-page"
    >
      {/* Desktop SiteHeader. Hidden on mobile so the page owns its full
          viewport - mirrors how /account renders an app-like top bar on
          phones while keeping the homeowner header on desktop. */}
      <div className="hidden md:block">
        <SiteHeader />
      </div>

      {/* VMB wordmark + monogram scatter overlay for the desktop cream
          surface. Self-hides on mobile (the mobile flavour is app-style
          white, not cream). */}
      <BrandWatermarkScatter />

      {/* Mobile top bar - small round back chevron + bold title left-aligned.
          Same pattern as /account on mobile. */}
      <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center text-gray-600 shrink-0"
          data-testid="btn-back-to-projects"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="flex-1 text-[15px] font-extrabold text-gray-900">
          Completed project
        </span>
      </div>

      <main className="relative z-10 mx-auto max-w-7xl px-0 md:px-6 lg:px-8 pt-0 md:pt-6 pb-16">
        {authLoading && (
          <p className="text-sm text-slate-400 px-5 pt-4" data-testid="gallery-auth">
            Authorising…
          </p>
        )}

        {!authLoading && loading && (
          <p className="text-sm text-slate-400 px-5 pt-4" data-testid="gallery-loading">
            Loading…
          </p>
        )}

        {!authLoading && !loading && err && (
          <div
            className="mx-5 md:mx-0 mt-4 md:mt-0 md:bg-white md:rounded-3xl md:shadow-xl md:shadow-zinc-200/60 md:p-6 text-sm text-red-500"
            role="alert"
            data-testid="gallery-error"
          >
            {err}
          </div>
        )}

        {!authLoading && !loading && !err && project && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,1.4fr] gap-0 md:gap-6 lg:gap-10">
            {/* LEFT - editorial column. On mobile it sits directly on the
                cream background (no card chrome). On desktop the winner
                panel + off-platform note still use white cards. */}
            <aside className="lg:sticky lg:top-6 lg:self-start space-y-4 md:space-y-5 px-5 md:px-0 pt-4 md:pt-0">
              {/* Desktop-only eyebrow; on mobile the top bar already
                  announces "Completed project" so we skip it. */}
              <div className="hidden md:flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-extrabold tracking-wider uppercase text-emerald-800">
                  <Award className="w-3 h-3" />
                  Completed project
                </span>
              </div>

              <h1
                className="text-[26px] sm:text-[32px] lg:text-[44px] font-black tracking-tight text-slate-900 leading-[1.04]"
                style={{ fontFamily: "'Sora', sans-serif" }}
                data-testid="completed-gallery-title"
              >
                {project.name}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-[12.5px] font-bold text-slate-500">
                {project.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {project.location}
                  </span>
                )}
                {completedLabel && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {completedLabel}
                  </span>
                )}
              </div>

              {/* Winner panel */}
              {winner && <WinnerPanel winner={winner} />}

              {hiredOffPlatform && !winner && (
                <section
                  className="md:bg-white md:rounded-3xl md:shadow-xl md:shadow-zinc-200/60 md:p-5"
                  data-testid="winner-offplatform"
                >
                  <p
                    className="text-[10.5px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    Who did the work
                  </p>
                  <p className="text-[14px] font-bold text-slate-700">
                    Hired off-platform
                  </p>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    This job was completed by a tradesperson outside
                    VetMyBuilder.
                  </p>
                </section>
              )}
            </aside>

            {/* RIGHT - photo grid. Consistent 20px mobile gutter so the
                images don't touch the device edges; on desktop wraps in a
                white card to contain the magazine masonry. */}
            <section className="mt-5 md:mt-0 px-5 md:px-0">
              <div
                className="md:bg-white md:rounded-3xl md:shadow-xl md:shadow-zinc-200/60 md:p-5"
                data-testid="completed-gallery-card"
              >
                <div className="flex items-end justify-between mb-3 md:px-1">
                  <p
                    className="text-[10.5px] font-black uppercase tracking-[0.18em] text-slate-400"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                    data-testid="completed-gallery-card-title"
                  >
                    The finished work
                  </p>
                  <p
                    className="text-[11px] font-semibold text-slate-400"
                    data-testid="completed-gallery-count"
                  >
                    {galleryImages.length} photo
                    {galleryImages.length === 1 ? "" : "s"}
                  </p>
                </div>

                {galleryImages.length > 0 ? (
                  <div data-testid="completed-gallery-grid">
                    <MagazineMasonry images={galleryImages} />
                  </div>
                ) : (
                  <p
                    className="md:px-1 py-8 text-sm text-slate-400"
                    data-testid="completed-gallery-empty"
                  >
                    No photos have been uploaded yet.
                  </p>
                )}

                {galleryImages.length > 0 && (
                  <p className="mt-3 md:px-1 text-[11px] text-slate-400">
                    Tap any photo to enlarge.
                  </p>
                )}
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => setShowReport(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-rose-500 transition-colors py-2"
                  data-testid="btn-report-photos"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Report these photos
                </button>
              </div>
            </section>
          </div>
        )}

        {showReport && projectId && (
          <ReportModal
            targetType="photo"
            targetId={`project-${projectId}-completed`}
            onClose={() => setShowReport(false)}
          />
        )}
      </main>
    </div>
  );
}

function WinnerPanel({ winner }: { winner: Winner }) {
  const profileHref = winner.publicId
    ? `/tradesman/${winner.publicId}`
    : winner.tradesmanUid
    ? `/tradesman/${winner.tradesmanUid}`
    : null;

  return (
    <section
      className="md:bg-white md:rounded-3xl md:shadow-xl md:shadow-zinc-200/60 md:p-5"
      data-testid="completed-winner-panel"
    >
      <p
        className="text-[10.5px] font-black uppercase tracking-[0.18em] text-slate-400 mb-3"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        Who did the work
      </p>
      <div className="flex items-center gap-3">
        {winner.profilePictureUrl ? (
          <img
            src={winner.profilePictureUrl}
            alt=""
            className="w-12 h-12 rounded-full object-cover shrink-0"
          />
        ) : (
          <span className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white font-black text-[18px] flex items-center justify-center shrink-0">
            {initialFrom(winner.companyName)}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className="text-[15px] font-black text-slate-900 truncate"
              data-testid="completed-winner-name"
            >
              {winner.companyName}
            </p>
            {winner.isVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-extrabold tracking-wide text-emerald-700">
                <svg
                  viewBox="0 0 24 24"
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Verified
              </span>
            )}
          </div>
          {winner.trades.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {winner.trades.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-indigo-700"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {profileHref && (
        <div className="mt-4">
          <a
            href={profileHref}
            className="inline-flex items-center justify-center w-full rounded-2xl bg-indigo-600 text-white text-[12.5px] font-extrabold py-2.5 shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-colors"
            data-testid="completed-winner-view-profile"
          >
            View profile
          </a>
        </div>
      )}
    </section>
  );
}

/**
 * Photo grid that gives the first two photos a hero-pair treatment, then
 * runs the remainder as a 4-up tail row. Both layers use the live
 * LightboxGallery so click-to-enlarge behaviour is consistent.
 */
function MagazineMasonry({ images }: { images: GalleryImage[] }) {
  const heroPair = images.slice(0, 2);
  const tail = images.slice(2);

  return (
    <div className="space-y-3">
      <LightboxGallery images={heroPair} cols={3} rounded="rounded-2xl" />
      {tail.length > 0 && (
        <LightboxGallery images={tail} cols={4} rounded="rounded-2xl" />
      )}
    </div>
  );
}
