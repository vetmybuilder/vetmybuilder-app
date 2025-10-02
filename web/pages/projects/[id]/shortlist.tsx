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
  rating: number | null;
  comment: string | null;
  isAnonymous: 0 | 1;
  createdAt: string;
};

type ProjectLite = {
  id: number;
  name: string;
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

export default function ShortlistPage() {
  const api = useApi();
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();

  // page data
  const [project, setProject] = useState<ProjectLite | null>(null);
  const [items, setItems] = useState<Recommendation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // fetch project name (nice header)
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        if (!alive) return;
        setProject({ id: data.project.id, name: data.project.name });
      } catch {
        // it's fine if this fails; the shortlist still loads below
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user]);

  // fetch shortlist (paginated)
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get(
          `/api/projects/${id}/recommendations?page=${page}&pageSize=${pageSize}`
        );
        if (!alive) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
        setErr(null);
      } catch (e: any) {
        if (!alive) return;
        // Normalise error shape from useApi / fetch
        const status = e?.status ?? e?.response?.status;
        const msg =
          e?.data?.error ??
          e?.response?.data?.error ??
          (typeof e?.message === "string" ? e.message : "");
        // If auth header was missing/expired, don't show raw server text.
        if (status === 401 || /missing bearer token/i.test(String(msg))) {
          setItems([]);
          setTotal(0);
          setErr(null); // silent -> neutral UI
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
                A list of builders that have been recommended to you by your
                friends and community members.
              </p>
            </div>
            <Link className="btn" href={`/projects/${id}`}>
              Back to project
            </Link>
          </div>

          {loading ? (
            <p>Loading…</p>
          ) : err ? (
            // Only generic errors reach here; 401s are silenced into neutral UI
            <p className="text-red-400">{err}</p>
          ) : items.length === 0 ? (
            <div className="card">No builders have yet been recommended.</div>
          ) : (
            <div className="space-y-3">
              {items.map((r) => (
                <div key={r.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">{r.company}</div>
                    <StarRating value={r.rating} />
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
              ))}

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
