// web/pages/projects/[id]/completed.tsx
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import LightboxGallery, {
  type GalleryImage,
} from "@/components/LightboxGallery";

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
    // Don’t use router.back(): it can return to the completed tab without query state,
    // which means the completed list doesn’t re-fetch correctly and cards show missing winner labels.
    // Instead, navigate explicitly to the completed tab (preserve sort/order/page if present).
    const q = router.query || {};

    const sort =
      typeof q.sort === "string" && q.sort.trim() ? q.sort.trim() : "createdAt";
    const order =
      typeof q.order === "string" && q.order.trim() ? q.order.trim() : "desc";
    const page =
      typeof q.page === "string" && q.page.trim() ? q.page.trim() : "1";
    const pageSize =
      typeof q.pageSize === "string" && q.pageSize.trim()
        ? q.pageSize.trim()
        : "12";

    router.push({
      pathname: "/projects",
      query: {
        tab: "completed",
        sort,
        order,
        page,
        pageSize,
      },
    });
  };

  return (
    <>
      <style>{`body { background: #fafaf9 !important; }`}</style>
      <div className="relative min-h-screen overflow-x-hidden bg-stone-50 -mt-14" data-testid="completed-gallery-page">
        {/* Background bands */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-24 pb-16 space-y-6">
          {/* Back */}
          <button
            type="button"
            onClick={onBackToProjects}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
            data-testid="btn-back-to-projects"
          >
            ← Back to projects
          </button>

          {/* Header card */}
          <header className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 px-7 py-6">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900" data-testid="completed-gallery-title">
              Completed project photos
            </h1>
            <p className="mt-1 text-sm text-zinc-500" data-testid="completed-gallery-subtitle">
              Photos uploaded when the project was marked as completed.
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
            </section>
          )}
        </div>
      </div>
    </>
  );
}
