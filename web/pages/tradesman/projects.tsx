// web/pages/tradesman/projects.tsx
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";

type Project = {
  id: number;
  name: string;
  type: string;
  location: string;
  createdAt: string;
};

export default function TradesmanProjects() {
  const api = useApi();
  const { user, loading } = useAuth();

  /* ---------- filters ---------- */
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [near, setNear] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");

  /* ---------- data / ui ---------- */
  const [items, setItems] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gate, setGate] = useState<"none" | "notActive" | "noProfile">("none");

  const canQuery = useMemo(() => !!user && !loading, [user, loading]);

  async function fetchProjects() {
    if (!canQuery) return;

    setBusy(true);
    setErr(null);
    setGate("none");

    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (type.trim()) params.set("type", type.trim());
      if (near.trim()) params.set("near", near.trim());
      params.set("order", order);
      params.set("limit", "50");

      // must hit /api/* so the bearer is attached by the client
      const { data } = await api.get(
        `/api/tradesmen/jobs?${params.toString()}`
      );
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      const status = e?.response?.status;
      const code = e?.response?.data?.code;

      if (status === 403 && code === "NOT_ACTIVE") {
        setGate("notActive");
        setItems([]);
        setErr(null);
      } else if (status === 403 && code === "NO_PROFILE") {
        setGate("noProfile");
        setItems([]);
        setErr(null);
      } else {
        const msg =
          e?.response?.data?.error || e?.message || "Failed to load projects";
        setErr(msg);
        setItems([]);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuery]);

  return (
    <>
      <Head>
        <title>Published projects • Vetmybuilder</title>
      </Head>

      <div
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6"
        data-testid="tradesman-projects-page"
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Published projects</h1>
          <Link
            href="/tradesman/register"
            className="text-sm text-indigo-600 hover:text-indigo-500"
            data-testid="link-manage-profile"
          >
            Manage profile
          </Link>
        </div>

        {/* NOT SIGNED IN */}
        {!user && !loading && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
            data-testid="gate-not-signed-in"
          >
            Please{" "}
            <Link className="link" href="/login">
              sign in
            </Link>{" "}
            to view projects.
          </div>
        )}

        {/* GATES */}
        {user && gate === "notActive" && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 mb-4"
            data-testid="gate-not-active"
          >
            <p className="font-medium">Your trade account is being reviewed.</p>
            <p className="text-sm mt-1">
              You’ll be able to view and contact projects once your account is{" "}
              <strong>active</strong>. You can still update your details on{" "}
              <Link className="link" href="/tradesman/register">
                Manage profile
              </Link>
              .
            </p>
          </div>
        )}

        {user && gate === "noProfile" && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 mb-4"
            data-testid="gate-no-profile"
          >
            <p className="font-medium">
              Create your trade profile to continue.
            </p>
            <p className="text-sm mt-1">
              Go to{" "}
              <Link className="link" href="/tradesman/register">
                Manage profile
              </Link>{" "}
              and complete your details.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto_12rem]">
          <input
            className="input"
            placeholder="e.g. bathroom refit"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="filter-q"
          />
          <input
            className="input"
            placeholder="e.g. bathroom"
            value={type}
            onChange={(e) => setType(e.target.value)}
            data-testid="filter-type"
          />
          <input
            className="input"
            placeholder="e.g. E4 or Chingford"
            value={near}
            onChange={(e) => setNear(e.target.value)}
            data-testid="filter-near"
          />
          <button
            className="btn"
            onClick={fetchProjects}
            disabled={busy || !canQuery || gate !== "none"}
            data-testid="btn-apply-filters"
          >
            {busy ? "Loading…" : "Apply"}
          </button>
          <select
            className="input"
            value={order}
            onChange={(e) => setOrder(e.target.value as any)}
            data-testid="filter-order"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {/* Table */}
        {user && gate === "none" && !loading && (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Project</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {err && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-red-600">
                      {err}
                    </td>
                  </tr>
                )}

                {!err && items.length === 0 && !busy && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-slate-500">
                      No projects found.
                    </td>
                  </tr>
                )}

                {!err &&
                  items.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">{p.name}</td>
                      <td className="px-4 py-2">{p.type}</td>
                      <td className="px-4 py-2">{p.location}</td>
                      <td className="px-4 py-2">
                        {new Date(p.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <Link className="link" href={`/projects/${p.id}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
