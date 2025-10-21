import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

// If you already have a Lightbox component, keep this import.
// Otherwise this page will still show a simple grid list of images.
let LightboxGallery: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  LightboxGallery = require("@/components/LightboxGallery").default;
} catch {
  LightboxGallery = null;
}

type Photo = {
  id: number;
  filePath: string;
  mime?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
};

export default function CompletedGallery() {
  const api = useApi();
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
    if (!router.isReady || !projectId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const { data } = await api.get(
          `/api/projects/${projectId}/close/photos`
        );
        if (!alive) return;
        setPhotos(Array.isArray(data?.photos) ? data.photos : []);
      } catch (e: any) {
        if (!alive) return;
        setErr(
          e?.response?.data?.error || e?.message || "Failed to load photos"
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, router.isReady, projectId]);

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
              href={`/projects/${projectId}`}
              className="btn"
              data-testid="btn-back-project"
            >
              Back to project
            </Link>
          )}
        </div>

        {loading && <p className="text-slate-500">Loading…</p>}
        {!loading && err && (
          <p className="text-red-600" data-testid="gallery-error">
            {err}
          </p>
        )}

        {!loading && !err && photos.length === 0 && (
          <p className="text-slate-500" data-testid="gallery-empty">
            No photos uploaded yet.
          </p>
        )}

        {!loading && !err && photos.length > 0 && (
          <>
            {LightboxGallery ? (
              <LightboxGallery
                data-testid="gallery-lightbox"
                images={photos.map((p) => ({
                  src: `/uploads/${p.filePath}`,
                  alt: `Photo ${p.id}`,
                }))}
              />
            ) : (
              <ul
                className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                data-testid="gallery-grid"
              >
                {photos.map((p) => (
                  <li key={p.id} className="rounded-lg overflow-hidden border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/uploads/${p.filePath}`}
                      alt={`Photo ${p.id}`}
                      className="block w-full h-40 object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </AuthedOnly>
  );
}
