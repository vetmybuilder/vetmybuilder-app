// web/pages/builders/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import AuthedOnly from "@/components/AuthedOnly";
import Link from "next/link";

type Photo = { id: string; url: string; thumb?: string; alt?: string };
type Builder = {
  id: number;
  company: string;
  comment: string | null;
  createdAt: string;
  // recommender
  name: string | null;
  email: string | null;
  phone?: string | null;
  isAnonymous: 0 | 1;
  // aggregates
  likes?: number;
  myLike?: 0 | 1;
  // gallery
  photos?: any;
  photoUrls?: string[];
  // badges
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
  // back to project
  project?: { id: number; name: string };
};

function Badge({
  children,
  color = "indigo",
}: {
  children: React.ReactNode;
  color?: "green" | "red" | "indigo" | "orange";
}) {
  const shades: Record<string, string> = {
    green: "bg-green-500/15 text-green-700 ring-1 ring-green-200",
    red: "bg-rose-500/15 text-rose-700 ring-1 ring-rose-200",
    indigo: "bg-indigo-500/15 text-indigo-700 ring-1 ring-indigo-200",
    orange: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${shades[color]}`}
    >
      {children}
    </span>
  );
}

const LikeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M12.1 21.35c-.32 0-.63-.1-.9-.3l-1.2-.9C5.2 16.54 2 13.76 2 10.28 2 7.5 4.2 5.3 7 5.3c1.45 0 2.86.63 3.8 1.7.94-1.07 2.35-1.7 3.8-1.7 2.8 0 5 2.2 5 4.98 0 3.48-3.2 6.26-7 9.88l-1.2.9c-.27.2-.58.3-.9.3z" />
  </svg>
);

/** Accept a variety of server shapes for photos and produce a normalized list */
function normalizePhotos(payload: Builder | null): Photo[] {
  if (!payload) return [];
  const src = payload.photos ?? payload.photoUrls ?? [];
  if (Array.isArray(src) && src.every((s) => typeof s === "string")) {
    return (src as string[]).map((url, i) => ({
      id: String(i + 1),
      url,
      thumb: url,
    }));
  }
  if (Array.isArray(src)) {
    return src
      .map((p: any, i: number) => {
        const url = p?.url || p?.href || p?.src;
        if (!url) return null;
        return {
          id: String(p.id ?? i + 1),
          url,
          thumb: p.thumb || p.thumbnail || url,
          alt: p.alt || "",
        } as Photo;
      })
      .filter(Boolean) as Photo[];
  }
  return [];
}

/* ---------------- Small auth-race retry helpers ---------------- */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function looksLikeAuthRace(err: any) {
  const status = err?.response?.status ?? err?.status;
  const msg =
    err?.response?.data?.error ?? err?.data?.error ?? err?.message ?? "";
  return status === 401 || /missing bearer token/i.test(String(msg));
}
async function getWithAuthRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 250
): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!looksLikeAuthRace(e) || i === attempts) break;
      await sleep(baseDelayMs * i);
    }
  }
  throw lastErr;
}

export default function BuilderProfile() {
  const router = useRouter();
  const { id } = router.query;
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  const [builder, setBuilder] = useState<Builder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const lightboxOpen = lightboxIdx !== null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!lightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxOpen]);

  // Fetch builder with auth-race retry
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;

    let alive = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const { data } = await getWithAuthRetry(() =>
          api.get(`/api/recommendations/${id}`)
        );
        if (!alive) return;
        setBuilder(data.recommendation);
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status;
        const msg =
          e?.data?.error || e?.response?.data?.error || e?.message || "";
        if (status === 401 || /bearer token/i.test(String(msg))) {
          setErr("You need to sign in again to view this builder.");
        } else {
          setErr("Failed to load builder");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user]);

  const [liking, setLiking] = useState(false);
  const likeOnce = async () => {
    if (!builder || !user || liking || builder.myLike === 1) return;
    setLiking(true);
    setBuilder((b) => (b ? { ...b, myLike: 1, likes: (b.likes || 0) + 1 } : b));
    try {
      await api.post(`/api/recommendations/${builder.id}/like`);
      const { data } = await api.get(`/api/recommendations/${builder.id}`);
      setBuilder(data.recommendation);
    } catch (e: any) {
      setBuilder((b) =>
        b && b.myLike === 1
          ? { ...b, myLike: 0, likes: Math.max(0, (b.likes || 1) - 1) }
          : b
      );
      alert(e?.response?.data?.error || "Unable to like right now");
    } finally {
      setLiking(false);
    }
  };

  const photos = normalizePhotos(builder);

  return (
    <AuthedOnly>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Builder profile</h1>
          {builder?.project && (
            <Link
              href="/projects"
              aria-label="Back to my projects"
              title="Back to my projects"
              className="btn-back"
            >
              <svg
                viewBox="0 0 24 24"
                className="icon-24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 19l-7-7 7-7" />
                <path d="M3 12h18" />
              </svg>
              <span className="sr-only">Back to my projects</span>
            </Link>
          )}
        </div>

        {authLoading || loading ? (
          <div className="card">Loading…</div>
        ) : err ? (
          <div className="card text-red-600">
            {err}
            <div className="mt-3">
              <Link href="/login" className="btn">
                Go to sign in
              </Link>
            </div>
          </div>
        ) : !builder ? (
          <div className="card">Not found</div>
        ) : (
          <div className="space-y-5">
            <div className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold truncate">
                    {builder.company}
                  </h2>
                  <div className="mt-2 flex items-center gap-2">
                    {builder.fromFriend ? (
                      <Badge color="indigo">Friend</Badge>
                    ) : null}
                    {builder.fromCommunity ? (
                      <Badge color="green">Community</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <div className="text-sm text-zinc-500 flex items-center gap-2">
                    <LikeIcon className="h-4 w-4" />
                    <span className="tabular-nums">{builder.likes ?? 0}</span>
                  </div>
                  <button
                    className={`mt-2 h-9 px-3 rounded-full border text-sm transition
                      ${
                        builder.myLike === 1
                          ? "bg-indigo-50 border-indigo-200 text-indigo-600 cursor-default"
                          : "border-slate-300 hover:bg-slate-50"
                      }
                      ${!user ? "opacity-60 cursor-not-allowed" : ""}`}
                    disabled={!user || builder.myLike === 1 || liking}
                    onClick={likeOnce}
                  >
                    {builder.myLike === 1 ? "Liked" : "Like"}
                  </button>
                </div>
              </div>

              {builder.comment && (
                <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">
                  {builder.comment}
                </p>
              )}

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <div className="text-slate-500">Recommender</div>
                  <div>
                    {builder.isAnonymous ? "Anonymous" : builder.name || "—"}
                    {builder.email ? ` · ${builder.email}` : ""}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-slate-500">Submitted</div>
                  <div>{new Date(builder.createdAt).toLocaleString()}</div>
                </div>
                {builder.phone ? (
                  <div className="space-y-1">
                    <div className="text-slate-500">Tradesperson phone</div>
                    <div>{builder.phone}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Gallery</h3>
                <span className="text-xs text-slate-500">
                  {photos.length} photo{photos.length === 1 ? "" : "s"}
                </span>
              </div>

              {photos.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No photos yet. Upload images when submitting a recommendation
                  to showcase the work.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {photos.map((p, i) => (
                    <button
                      key={p.id}
                      className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 hover:opacity-90"
                      onClick={() => setLightboxIdx(i)}
                      aria-label={`Open image ${i + 1} of ${photos.length}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumb || p.url}
                        alt={p.alt || ""}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {lightboxOpen && photos[lightboxIdx as number] && (
              <Lightbox
                photos={photos}
                index={lightboxIdx as number}
                onClose={() => setLightboxIdx(null)}
                onIndex={(i) => setLightboxIdx(i)}
              />
            )}
          </div>
        )}
      </div>
    </AuthedOnly>
  );
}

/* ---------------- Lightbox ---------------- */

function Lightbox({
  photos,
  index,
  onClose,
  onIndex,
}: {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight")
        onIndex((index + 1) % Math.max(1, photos.length));
      if (e.key === "ArrowLeft")
        onIndex((index - 1 + Math.max(1, photos.length)) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndex]);

  const current = photos[index];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 px-3 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Image lightbox"
      onClick={onClose}
    >
      <button
        ref={closeBtnRef}
        className="absolute top-3 right-3 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onClick={onClose}
        aria-label="Close"
      >
        ✕
      </button>

      {photos.length > 1 && (
        <button
          className="absolute left-3 md:left-6 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index - 1 + photos.length) % photos.length);
          }}
          aria-label="Previous image"
        >
          ‹
        </button>
      )}

      <div
        className="max-w-6xl w-full"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.alt || ""}
          className="mx-auto max-h-[80vh] w-auto object-contain rounded-lg shadow-2xl"
        />
        <div className="mt-2 text-center text-xs text-white/80">
          {index + 1} / {photos.length}
        </div>
      </div>

      {photos.length > 1 && (
        <button
          className="absolute right-3 md:right-6 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index + 1) % photos.length);
          }}
          aria-label="Next image"
        >
          ›
        </button>
      )}
    </div>
  );
}
