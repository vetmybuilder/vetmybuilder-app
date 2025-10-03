import Layout from "@/components/Layout";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import { useEffect, useState } from "react";

type Recommendation = {
  id: number;
  name: string | null;
  email: string | null;
  company: string;
  comment: string | null;
  isAnonymous: 0 | 1;
  createdAt: string;

  // like aggregates (must be provided by API)
  likes?: number;   // total likes
  myLike?: 0 | 1;   // whether the current user has liked
};

type ProjectLite = {
  id: number;
  name: string;
  ownerUserId: string;
};

// Yellow star rating
function StarRating({ value }: { value: number | null | undefined }) {
  const v = Math.max(0, Math.min(5, Math.round(Number(value ?? 0))));
  return (
    <div className="flex gap-0.5" aria-label={`${v} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= v ? "text-yellow-400" : "text-white/30"}>
          ★
        </span>
      ))}
    </div>
  );
}

// Facebook-style heart/like icon
const LikeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M12.1 21.35c-.32 0-.63-.1-.9-.3l-1.2-.9C5.2 16.54 2 13.76 2 10.28 2 7.5 4.2 5.3 7 5.3c1.45 0 2.86.63 3.8 1.7.94-1.07 2.35-1.7 3.8-1.7 2.8 0 5 2.2 5 4.98 0 3.48-3.2 6.26-7 9.88l-1.2.9c-.27.2-.58.3-.9.3z" />
  </svg>
);

// Map likes to 0–5 stars (relative to current list’s max likes)
function starsFromLikes(likes: number, maxLikes: number) {
  if (maxLikes <= 0) return 0;
  const pct = likes / maxLikes; // 0..1
  return Math.max(1, Math.round(pct * 5));
}

export default function ShortlistPage() {
  const api = useApi();
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();

  const [project, setProject] = useState<ProjectLite | null>(null);
  const [items, setItems] = useState<Recommendation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<number | null>(null);

  const isOwner = !!(user && project && project.ownerUserId === user.uid);
  const canLike = !!user && !!project && !isOwner;

  // Fetch project (to know owner + nice header)
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        if (!alive) return;
        setProject({
          id: data.project.id,
          name: data.project.name,
          ownerUserId: data.project.ownerUserId,
        });
      } catch {
        // header is nice-to-have only
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user]);

  async function loadPage(p: number) {
    const { data } = await api.get(
      `/api/projects/${id}/recommendations?page=${p}&pageSize=${pageSize}`
    );
    setItems(data.items || []);
    setTotal(data.total || 0);
    setErr(null);
  }

  // Fetch shortlist (paginated)
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        await loadPage(page);
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status;
        const msg =
          e?.data?.error ??
          e?.response?.data?.error ??
          (typeof e?.message === "string" ? e.message : "");
        if (status === 401 || /missing bearer token/i.test(String(msg))) {
          setItems([]);
          setTotal(0);
          setErr(null);
        } else {
          setErr("Failed to load shortlist");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, id, page, pageSize, router.isReady, authLoading, user]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Like once (POST /api/recommendations/:id/like), optimistic then re-sync
  const likeOnce = async (rec: Recommendation) => {
    if (!canLike || likingId || rec.myLike === 1) return;
    setLikingId(rec.id);

    // optimistic bump + lock
    setItems((prev) =>
      prev.map((r) =>
        r.id === rec.id ? { ...r, myLike: 1, likes: (r.likes ?? 0) + 1 } : r
      )
    );

    try {
      await api.post(`/api/recommendations/${rec.id}/like`);
      await loadPage(page); // ensure tallies + ordering correct
    } catch (e: any) {
      await loadPage(page); // revert to server truth
      alert(e?.response?.data?.error || "Unable to like right now");
    } finally {
      setLikingId(null);
    }
  };

  const maxLikes = Math.max(0, ...items.map((r) => r.likes ?? 0));

  return (
    <Layout>
      <AuthedOnly>
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold">
                Shortlist{project ? ` · ${project.name}` : ""}
              </h1>
              <p className="text-sm text-zinc-400">
                A list of builders recommended by friends and the community.
              </p>
            </div>
            <Link className="btn" href={`/projects/${id}`}>
              Back to project
            </Link>
          </div>

          {loading ? (
            <p>Loading…</p>
          ) : err ? (
            <p className="text-red-400">{err}</p>
          ) : items.length === 0 ? (
            <div className="card">No builders have yet been recommended.</div>
          ) : (
            <div className="space-y-3">
              {items.map((r) => {
                const likes = r.likes ?? 0;
                const hasLiked = r.myLike === 1;
                const stars = likes > 0 ? starsFromLikes(likes, maxLikes) : 0;

                return (
                  <div key={r.id} className="card">
                    <div className="flex items-start gap-3">
                      {/* Like column (hidden for owner) */}
                      {!isOwner && (
                        <div className="w-14 flex-none flex flex-col items-center">
                          <button
                            onClick={() => likeOnce(r)}
                            disabled={!canLike || hasLiked || likingId === r.id}
                            className={`h-9 w-9 rounded-full grid place-items-center border transition
                              ${
                                hasLiked
                                  ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300 cursor-default"
                                  : "border-zinc-700 hover:bg-zinc-800"
                              }
                              ${!canLike ? "opacity-60" : ""}`}
                            aria-label="Like"
                            title={
                              !canLike
                                ? "Sign in to like"
                                : hasLiked
                                ? "You’ve liked this"
                                : "Like"
                            }
                          >
                            <LikeIcon className="h-4 w-4" />
                          </button>
                          <div className="mt-1 text-xs tabular-nums text-zinc-300">
                            {likes}
                          </div>
                        </div>
                      )}

                      {/* Body */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium truncate">{r.company}</div>
                          <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
                            <div className="text-xs text-zinc-400 tabular-nums flex items-center gap-1">
                              <LikeIcon className="h-3.5 w-3.5 -mt-px" /> {likes}
                            </div>
                            <StarRating value={stars} />
                          </div>
                        </div>

                        {r.comment && (
                          <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap">
                            {r.comment}
                          </p>
                        )}

                        <div className="text-xs text-zinc-400 mt-2 flex items-center justify-between">
                          <span>
                            {r.isAnonymous ? "Anonymous" : r.name || "—"}
                            {r.email ? ` · ${r.email}` : ""}
                          </span>
                          <span>{new Date(r.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-2">
                <button
                  className="btn disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <div className="text-sm">
                  Page {page} / {totalPages} • Total: {total}
                </div>
                <button
                  className="btn disabled:opacity-50"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </AuthedOnly>
    </Layout>
  );
}
