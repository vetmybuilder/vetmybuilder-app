import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

type Row = {
  id: number;
  projectId: number;
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

export default function ProjectLeaderboard() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const projectId = useMemo(() => {
    const raw = router.query.id;
    const n = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(n) ? n : null;
  }, [router.query.id]);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || authLoading || !user) return;
    let alive = true;
    setLoading(true);
    api
      .get(`/api/debug/leaderboard?projectId=${projectId}`)
      .then(({ data }) => {
        if (!alive) return;
        setRows(data?.items ?? []);
        setErr(null);
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
  }, [api, projectId, authLoading, user]);

  return (
    <AuthedOnly>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-4">Leaderboard (debug)</h1>
        {loading && <p className="text-slate-500">Loading…</p>}
        {err && <p className="text-red-600">{err}</p>}
        {!loading && !err && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Company</th>
                  <th>Rec&nbsp;ID</th>
                  <th>Friend</th>
                  <th>Community</th>
                  <th>Likes</th>
                  <th>Rec&nbsp;Photos</th>
                  <th>Comp&nbsp;Wins</th>
                  <th>Comp&nbsp;Photos</th>
                  <th>Legacy&nbsp;Wins</th>
                  <th>Would&nbsp;Again</th>
                  <th>CH&nbsp;Status</th>
                  <th>CH&nbsp;Score</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold tabular-nums">VMB {r.score.toFixed(1)}</td>
                    <td>{r.company}</td>
                    <td className="tabular-nums">{r.id}</td>
                    <td>{r.fromFriend ? "✓" : ""}</td>
                    <td>{r.fromCommunity ? "✓" : ""}</td>
                    <td className="tabular-nums">{r.likes}</td>
                    <td className="tabular-nums">{r.recPhotos}</td>
                    <td className="tabular-nums">{r.completionWins}</td>
                    <td className="tabular-nums">{r.completionPhotos}</td>
                    <td className="tabular-nums">{r.legacyWins}</td>
                    <td className="tabular-nums">{r.wouldAgain}</td>
                    <td>{r.chStatus ?? "—"}</td>
                    <td className="tabular-nums">{r.chScore ?? "—"}</td>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-slate-500 text-xs">
          Debug view — numbers come from the exact same scoring logic used by the shortlist.
        </p>
      </div>
    </AuthedOnly>
  );
}