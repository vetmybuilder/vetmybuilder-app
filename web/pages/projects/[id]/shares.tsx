import AuthedOnly from "@/components/AuthedOnly";
import LightboxGallery from "@/components/LightboxGallery";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ShareItem = {
  id: number;
  projectId: number;
  tradesmanUid: string;
  message: string;
  createdAt: string;
  photos: {
    name?: string;
    type?: string;
    size?: number;
    url?: string;          // relative (/uploads/xxx) or full
    absoluteUrl?: string;  // full (http://.../api/uploads/xxx)
  }[];
  tradesman?: {
    id?: number | null;
    uid?: string | null;
    user_id?: string | null;
    name?: string | null;
    company?: string | null;
    company_number?: string | null;
    profile_slug?: string | null;
  } | null;
};

export default function ProjectSharesPage() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const projectId = useMemo(() => {
    const raw = router.query.id;
    const n = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(n) ? n : null;
  }, [router.query.id]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ShareItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || authLoading || !user || !projectId) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // Explicit bearer token to avoid "Missing bearer token"
        const token =
          (typeof user.getIdToken === "function" &&
            (await user.getIdToken())) ||
          (typeof (user as any).accessToken === "string" &&
            (user as any).accessToken) ||
          null;

        const { data } = await api.get(`/api/projects/${projectId}/shares`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!alive) return;
        const list: ShareItem[] = Array.isArray(data?.items) ? data.items : [];
        setItems(list);
      } catch (e: any) {
        if (!alive) return;
        setErr(
          e?.response?.data?.error || e?.message || "Failed to load shares"
        );
        setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, router.isReady, authLoading, user, projectId]);

  const backHref = `/projects/${projectId}`;

  const builderHref = (it: ShareItem) => {
    const t = it.tradesman || {};
    if (t && t.profile_slug) return `/builder/${t.profile_slug}`;
    if (t && t.id) return `/builder/${t.id}`;
    return null;
  };

  // Normalize image URL for display: prefer absoluteUrl, else rewrite /uploads → /api/uploads
  const pickImageUrl = (p: ShareItem["photos"][number]) => {
    if (p.absoluteUrl && typeof p.absoluteUrl === "string") return p.absoluteUrl;
    const u = p.url || "";
    if (u.startsWith("/uploads/")) return `/api${u}`; // same-origin proxy path
    return u; // could already be absolute or some other path
  };

  return (
    <AuthedOnly>
      <div
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
        data-testid="project-shares-page"
      >
        <div className="flex items-center justify-between gap-3 py-6">
          <div>
            <h1 className="text-xl font-semibold">Shared profiles</h1>
            <p className="text-sm text-slate-600">
              Tradespeople who expressed interest in your project.
            </p>
          </div>
          <Link href={backHref} className="btn-ghost">
            Back to project
          </Link>
        </div>

        {loading && <p className="py-10 text-sm text-slate-500">Loading…</p>}

        {!loading && err && <p className="py-4 text-sm text-rose-600">{err}</p>}

        {!loading && !err && items.length === 0 && (
          <div className="rounded-2xl border border-slate-200 p-6 text-sm text-slate-600">
            No shared profiles yet.
          </div>
        )}

        {!loading && !err && items.length > 0 && (
          <ul className="space-y-5">
            {items.map((it) => {
              const href = builderHref(it);
              const tmName = it.tradesman?.name || "Unknown tradesman";
              const company = it.tradesman?.company || "";
              const coNo = it.tradesman?.company_number || "";

              // map photos for the lightbox
              const galleryImages =
                (it.photos || [])
                  .map((p, idx) => {
                    const src = pickImageUrl(p);
                    if (!src) return null;
                    return {
                      id: `${it.id}-${idx}`,
                      thumbUrl: src,
                      fullUrl: src,
                      alt: p.name || "Shared photo",
                    };
                  })
                  .filter(Boolean) || [];

              // any without a usable src (show as chips)
              const noUrlFiles =
                (it.photos || []).filter((p) => !pickImageUrl(p)) || [];

              return (
                <li
                  key={it.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {href ? (
                          <Link
                            href={href}
                            className="font-medium hover:underline"
                            data-testid="share-tradesman-link"
                          >
                            {tmName}
                          </Link>
                        ) : (
                          <span className="font-medium">{tmName}</span>
                        )}
                        {company && (
                          <span className="text-slate-500">· {company}</span>
                        )}
                        {coNo && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
                            Co. No. {coNo}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        Shared on {new Date(it.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {href && (
                      <Link
                        href={href}
                        className="btn"
                        data-testid="btn-view-profile"
                      >
                        View builder profile
                      </Link>
                    )}
                  </div>

                  {it.message && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                      {it.message}
                    </p>
                  )}

                  {/* Gallery (clickable) */}
                  {galleryImages.length > 0 && (
                    <div className="mt-4">
                      <LightboxGallery
                        images={galleryImages as any}
                        cols={4}
                        rounded="rounded-xl"
                      />
                    </div>
                  )}

                  {/* Any files without a URL (non-clickable chips) */}
                  {noUrlFiles && noUrlFiles.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {noUrlFiles.map((p, idx) => (
                        <span
                          key={`f-${idx}`}
                          className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200"
                          title={p.type || ""}
                        >
                          {p.name || "File"}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AuthedOnly>
  );
}