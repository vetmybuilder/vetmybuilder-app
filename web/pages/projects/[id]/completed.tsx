import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Photo = {
  id: number;
  filePath: string; // e.g. "/uploads/abc.jpg"
  fileUrl?: string; // e.g. "http://localhost:8787/uploads/abc.jpg"
  mime?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
};

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function computeSrc(p: Photo) {
  // Prefer absolute URL provided by server
  if (p.fileUrl && /^https?:\/\//i.test(p.fileUrl)) return p.fileUrl;
  const base = (process.env.NEXT_PUBLIC_API_BASE || "").trim();
  if (base) return joinUrl(base, p.filePath || "");
  // last resort: relative (works only if your Next rewrites are active)
  return p.filePath || "";
}

export default function CompletedGallery() {
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
  const [openIdx, setOpenIdx] = useState<number | null>(null);

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

  return (
    <AuthedOnly>
      <div
        className="mx-auto max-w-5xl p-4"
        data-testid="completed-gallery-page"
      >
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Completed project photos</h1>
          {projectId != null && (
            <Link
              href={'/projects/'}
              className="btn"
              data-testid="btn-back-project"
            >
              Back to project
            </Link>
          )}
        </div>

        {authLoading && <p className="text-slate-500">Authorising…</p>}
        {!authLoading && loading && <p className="text-slate-500">Loading…</p>}
        {!authLoading && !loading && err && (
          <p className="text-red-600" data-testid="gallery-error">
            {err}
          </p>
        )}

        {!authLoading && !loading && !err && photos.length === 0 && (
          <p className="text-slate-500" data-testid="gallery-empty">
            No photos uploaded yet.
          </p>
        )}

        {!authLoading && !loading && !err && photos.length > 0 && (
          <>
            <ul
              className="grid grid-cols-2 sm:grid-cols-3 gap-3"
              data-testid="gallery-grid"
            >
              {photos.map((p, i) => {
                const src = computeSrc(p);
                return (
                  <li
                    key={p.id}
                    className="rounded-lg overflow-hidden border"
                    data-testid={`gallery-item-${p.id}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Photo ${p.id}`}
                      className="block w-full h-48 object-cover bg-slate-100 cursor-zoom-in"
                      loading="lazy"
                      crossOrigin="anonymous"
                      onClick={() => setOpenIdx(i)}
                      onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement;
                        el.style.opacity = "0.35";
                        el.alt = `Failed to load ${src}`;
                      }}
                    />
                  </li>
                );
              })}
            </ul>

            {/* Minimal lightbox using plain <img>, no next/image */}
            {openIdx != null && photos[openIdx] && (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                onClick={() => setOpenIdx(null)}
                data-testid="lightbox"
              >
                <button
                  className="absolute top-4 right-4 btn"
                  onClick={() => setOpenIdx(null)}
                  aria-label="Close"
                >
                  Close
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={computeSrc(photos[openIdx])}
                  alt={`Photo ${photos[openIdx].id}`}
                  className="max-h-[90vh] max-w-[90vw] object-contain"
                />
              </div>
            )}
          </>
        )}
      </div>
    </AuthedOnly>
  );
}
