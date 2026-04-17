// web/pages/projects/[id]/completed.tsx
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import LightboxGallery, {
  type GalleryImage,
} from "@/components/LightboxGallery";
import ReportModal from "@/components/ReportModal";

type Photo = {
  id: number;
  filePath: string; // e.g. "/uploads/abc.jpg" or "/api/uploads/abc.jpg"
  fileUrl?: string; // e.g. "http://localhost:8787/api/uploads/abc.jpg"
  mime?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
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

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!router.isReady || authLoading || !user || !projectId) return;

    let alive = true;
    setLoading(true);
    setErr(null);
    setPhotos([]);

    (async () => {
      try {
        const { data } = await api.get(
          `/api/projects/${projectId}/close/photos`
        );
        if (!alive) return;

        const list: Photo[] = Array.isArray(data?.photos) ? data.photos : [];
        setPhotos(list);
      } catch (e: any) {
        if (!alive) return;
        const msg =
          e?.response?.data?.error ||
          e?.message ||
          (e?.response?.status === 401
            ? "Missing bearer token"
            : "Failed to load photos");
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

  const onBackToProjects = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/projects");
    }
  };

  return (
    <>
      <div className="relative min-h-screen overflow-x-hidden -mt-14" data-testid="completed-gallery-page">
        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-16 space-y-6">
          {/* Back */}
          <button
            type="button"
            onClick={onBackToProjects}
            className="hidden sm:inline-flex items-center gap-2 mb-3 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            data-testid="btn-back-to-projects"
          >
            ← Back to Jobs
          </button>

          {/* Header card */}
          <header className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 px-7 py-6">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900" data-testid="completed-gallery-title">
              Completed project photos
            </h1>
            <p className="mt-1 text-sm text-zinc-500" data-testid="completed-gallery-subtitle">
              See the finished work from this project.
            </p>
          </header>

          {/* States */}
          {authLoading && (
            <p className="text-sm text-zinc-400" data-testid="gallery-auth">Authorising…</p>
          )}

          {!authLoading && loading && (
            <p className="text-sm text-zinc-400" data-testid="gallery-loading">Loading…</p>
          )}

          {!authLoading && !loading && err && (
            <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 text-sm text-red-500" role="alert" data-testid="gallery-error">
              {err}
            </div>
          )}

          {!authLoading && !loading && !err && (
            <section
              className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 sm:p-8"
              data-testid="completed-gallery-card"
              aria-label="Project photos"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-black text-zinc-900" data-testid="completed-gallery-card-title">
                  Project photos
                </h2>
                <span className="text-sm text-zinc-400" data-testid="completed-gallery-count">
                  {galleryImages.length} photo{galleryImages.length === 1 ? "" : "s"}
                </span>
              </div>

              {galleryImages.length > 0 ? (
                <div data-testid="completed-gallery-grid">
                  <LightboxGallery images={galleryImages} cols={4} rounded="rounded-xl" />
                </div>
              ) : (
                <p className="text-sm text-zinc-400" data-testid="completed-gallery-empty">
                  No photos have been uploaded yet.
                </p>
              )}

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowReport(true)}
                  className="flex items-center gap-1 text-[10px] text-zinc-300 hover:text-red-500 transition-colors"
                  data-testid="btn-report-photos"
                >
                  <svg className="h-3 w-3 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
                  </svg>
                  Report
                </button>
              </div>
            </section>
          )}

          {showReport && projectId && (
            <ReportModal
              targetType="photo"
              targetId={`project-${projectId}-completed`}
              onClose={() => setShowReport(false)}
            />
          )}
        </div>
      </div>
    </>
  );
}
