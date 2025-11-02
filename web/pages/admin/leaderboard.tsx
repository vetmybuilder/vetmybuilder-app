import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = {
  id: number;
  projectId: number | null;
  company: string;
  name: string | null;
  createdAt: string;
  fromFriend: 0 | 1;
  fromCommunity: 0 | 1;
  likes: number;
  recPhotos: number;
  completionWins: number;
  completionPhotos: number;
  legacyWins: number;
  wouldAgain: number;
  chStatus: string | null;
  chScore: number | null;
  score: number;
};

export default function AdminLeaderboardPage() {
  return (
    <AuthedOnly>
      <AdminGate />
    </AuthedOnly>
  );
}

/** Gate: verify admin by probing an existing admin-only route */
function AdminGate() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"checking" | "ok" | "forbidden">(
    "checking"
  );

  useEffect(() => {
    let alive = true;
    if (!router.isReady || authLoading) return;

    try {
      if (sessionStorage.getItem("vmb:isAdmin") === "1") {
        setStatus("ok");
        return;
      }
    } catch {}

    (async () => {
      try {
        await api.get("/api/admin/tradesmen", {
          params: { page: 1, pageSize: 1, status: "all" },
        });
        if (!alive) return;
        try {
          sessionStorage.setItem("vmb:isAdmin", "1");
        } catch {}
        setStatus("ok");
      } catch {
        if (!alive) return;
        setStatus("forbidden");
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, router.isReady, authLoading]);

  if (status === "checking") {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 text-sm text-slate-500">
        Loading…
      </div>
    );
  }
  if (status === "forbidden") {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-amber-900">Admins only</h2>
          <p className="mt-1 text-sm text-amber-900/80">
            Your account didn’t pass the admin check (
            <code>/api/admin/tradesmen</code>). Ensure your{" "}
            <code>user_roles.role</code> is <code>"admin"</code> or your email
            is in <code>ADMIN_EMAILS</code>.
          </p>
          <div className="mt-4">
            <Link href="/projects" className="btn-outline">
              Back to Projects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AdminLeaderboardInner />;
}

/** Global leaderboard (no Project ID) */
function AdminLeaderboardInner() {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (authLoading || !user) return;

    setLoading(true);
    setErr(null);

    api
      .get("/api/debug/leaderboard")
      .then(({ data }) => {
        if (!alive) return;
        const items: Row[] = Array.isArray(data?.items) ? data.items : [];
        setRows(items);
      })
      .catch((e: any) => {
        if (!alive) return;
        setErr(e?.response?.data?.error || e?.message || "Failed");
        setRows([]);
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [api, authLoading, user]);

  const topId = useMemo(() => rows[0]?.id ?? null, [rows]);

  const Tick = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20 8l-1.4-1.4z" />
    </svg>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <div className="text-sm text-slate-500">
          Global • Sorted by VMB score
        </div>
      </div>

      {loading && <p className="text-slate-500">Loading…</p>}
      {err && <p className="text-red-600">{err}</p>}
      {!loading && !err && rows.length === 0 && (
        <div className="card">No data yet.</div>
      )}

      {!loading && !err && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="table text-sm">
            <thead>
              <tr>
                <th className="w-10" aria-label="Top" title="Top">
                  #
                </th>
                <th>Company</th>
                <th className="text-right">VMB Score</th>
                <th className="text-right">Likes</th>
                <th className="text-right">Photos</th>
                <th className="text-right">Wins</th>
                <th className="text-right">CH</th>
                <th>First Seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={i === 0 ? "bg-emerald-50/50" : ""}>
                  <td className="text-center">
                    {r.id === topId ? (
                      <span
                        className="inline-flex items-center justify-center rounded-full bg-emerald-600 text-white h-5 w-5"
                        title="Highest VMB score"
                        aria-label="Highest VMB score"
                      >
                        <Tick className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="text-slate-400 tabular-nums">
                        {i + 1}
                      </span>
                    )}
                  </td>
                  <td>{r.company}</td>
                  <td className="text-right tabular-nums">
                    {r.score.toFixed(1)}
                  </td>
                  <td className="text-right tabular-nums">{r.likes}</td>
                  <td className="text-right tabular-nums">{r.recPhotos}</td>
                  <td className="text-right tabular-nums">
                    {r.completionWins}
                  </td>
                  <td className="text-right tabular-nums">
                    {r.chScore ?? "—"}
                  </td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-slate-500 text-xs">
        The ✓ marks the current highest VMB score across all companies.
      </p>
    </div>
  );
}
