import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import TradesmanOnly from "@/components/TradesmanOnly";

/** Simple helper to load role/profile */
async function getTradesMe(api: any) {
  try {
    const { data } = await api.get("/api/tradesmen/me");
    return {
      role: String(data?.role || "user").toLowerCase(),
      hasProfile: !!data?.profile,
    };
  } catch {
    return { role: "user", hasProfile: false };
  }
}

type Job = {
  id: number;
  name: string;
  type: string;
  location: string;
  description?: string;
  propertyType?: string;
  bedrooms?: number;
  createdAt: string;
};

export default function TradesJobsPage() {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  // query state
  const [near, setNear] = useState<string>("");
  const [items, setItems] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // role/prof gate
  const [isTrades, setIsTrades] = useState<boolean | null>(null);

  // Kick non-trades to register (soft gate)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (authLoading) return;
      if (!user) {
        setIsTrades(false);
        return;
      }
      const me = await getTradesMe(api);
      if (!alive) return;
      setIsTrades(me.role === "tradesman" || me.hasProfile);
    })();
    return () => {
      alive = false;
    };
  }, [user, authLoading, api]);

  const page = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);
  const pages = useMemo(
    () => (total > 0 ? Math.ceil(total / Math.max(1, limit)) : 1),
    [total, limit]
  );

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const q = new URLSearchParams();
      if (near.trim()) q.set("near", near.trim());
      q.set("limit", String(limit));
      q.set("offset", String(offset));

      const { data } = await api.get(`/api/tradesmen/jobs?${q.toString()}`);
      setItems(data?.items || []);
      setTotal(Number.isFinite(data?.total) ? data.total : 0);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Failed to load jobs");
      setItems([]);
      setTotal(0);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (isTrades) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrades, near, limit, offset]);

  function resetAndSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    load();
  }

  return (
    <TradesmanOnly>
      <>
      <Head>
        <title>Jobs for Trades • Vetmybuilder</title>
      </Head>

      <div
        className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4"
        data-testid="trades-jobs-page"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <Link
            href="/tradesman/register"
            className="text-sm text-indigo-700 hover:text-indigo-600"
            data-testid="link-edit-trades-profile"
            title="Edit trades profile"
          >
            Edit trades profile
          </Link>
        </div>

        {/* Gate for non-trades */}
        {isTrades === false && (
          <div className="card" data-testid="trades-gate">
            <h2 className="text-lg font-medium mb-1">
              For verified trades only
            </h2>
            <p className="text-sm text-slate-600">
              Create a free trades profile to view and contact jobs. Homeowners
              stay free; pros fund the platform.
            </p>
            <div className="mt-3 flex gap-2">
              {!user ? (
                <>
                  <a
                    className="btn"
                    href={`/login?next=${encodeURIComponent(
                      "/tradesman/register"
                    )}`}
                    data-testid="gate-login"
                  >
                    Log in
                  </a>
                  <a
                    className="btn btn-secondary"
                    href={`/register?next=${encodeURIComponent(
                      "/tradesman/register"
                    )}`}
                    data-testid="gate-register"
                  >
                    Create account
                  </a>
                </>
              ) : (
                <Link
                  className="btn"
                  href="/tradesman/register"
                  data-testid="gate-go-register"
                >
                  Create trades profile
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        {isTrades && (
          <form
            onSubmit={resetAndSearch}
            className="mb-3 flex flex-wrap items-end gap-2"
            data-testid="jobs-filters"
          >
            <div>
              <label htmlFor="near" className="block text-sm text-slate-700">
                Near (postcode/city)
              </label>
              <input
                id="near"
                className="input"
                placeholder="e.g. E4 or Chingford"
                value={near}
                onChange={(e) => setNear(e.target.value)}
                data-testid="input-near"
              />
            </div>
            <div>
              <label htmlFor="limit" className="block text-sm text-slate-700">
                Page size
              </label>
              <select
                id="limit"
                className="input"
                value={limit}
                onChange={(e) => {
                  setLimit(parseInt(e.target.value, 10));
                  setOffset(0);
                }}
                data-testid="select-limit"
              >
                {[10, 20, 30, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn"
              disabled={busy}
              data-testid="btn-apply-filters"
            >
              {busy ? "Searching…" : "Search"}
            </button>
          </form>
        )}

        {/* Results */}
        {isTrades && (
          <div className="space-y-3" data-testid="jobs-results">
            {err && (
              <div
                className="card text-rose-700"
                role="alert"
                data-testid="jobs-error"
              >
                {err}
              </div>
            )}

            {!busy && items.length === 0 && !err ? (
              <div className="card text-slate-600" data-testid="jobs-empty">
                No jobs found{near ? ` near “${near}”` : ""}.
              </div>
            ) : null}

            {items.map((j) => (
              <article key={j.id} className="card" data-testid={`job-${j.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold">{j.name}</h3>
                    <div className="mt-1 text-sm text-slate-600">
                      <span className="mr-2">{j.type}</span>
                      <span aria-hidden>•</span>
                      <span className="ml-2">{j.location}</span>
                      {j.propertyType ? (
                        <>
                          <span aria-hidden className="mx-2">
                            •
                          </span>
                          <span>{j.propertyType}</span>
                        </>
                      ) : null}
                      {Number.isFinite(j.bedrooms) ? (
                        <>
                          <span aria-hidden className="mx-2">
                            •
                          </span>
                          <span>{j.bedrooms} bed</span>
                        </>
                      ) : null}
                    </div>
                    {j.description && (
                      <p className="mt-2 text-sm text-slate-700 line-clamp-2">
                        {j.description}
                      </p>
                    )}
                  </div>
                  <time
                    className="shrink-0 text-sm text-slate-500"
                    title={new Date(j.createdAt).toLocaleString()}
                  >
                    {new Date(j.createdAt).toLocaleDateString()}
                  </time>
                </div>

                <div className="mt-3">
                  <button
                    className="btn btn-secondary"
                    disabled
                    title="Contact flow coming soon"
                    data-testid={`btn-contact-${j.id}`}
                  >
                    View / contact
                  </button>
                </div>
              </article>
            ))}

            {total > limit && (
              <div
                className="flex items-center justify-between gap-3 pt-2"
                data-testid="jobs-pagination"
              >
                <div className="text-sm text-slate-600">
                  Page <span className="tabular-nums">{page}</span> /{" "}
                  <span className="tabular-nums">{pages}</span> •{" "}
                  <span className="tabular-nums">{total}</span> jobs
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn"
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset <= 0 || busy}
                    data-testid="btn-prev"
                  >
                    Prev
                  </button>
                  <button
                    className="btn"
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total || busy}
                    data-testid="btn-next"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </>
    </TradesmanOnly>
  );
}
