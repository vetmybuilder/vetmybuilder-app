import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import Link from "next/link";
import * as React from "react";
import { useEffect, useState } from "react";

/* ===== Types ===== */
type DiscoverItem = {
  companyNumber: string;
  companyName: string;
  sampleRecommendationId: number;
  recCount: number;
  totalLikes: number;
  lastRecommendedAt: string;
  hasPhotos: boolean;
};

type DiscoverResponse = {
  ok: boolean;
  location: string;
  items: DiscoverItem[];
  total: number;
  page: number;
  pageSize: number;
};

/* Small pill component (brand-ish) */
function Pill({
  children,
  testId,
  title,
}: {
  children: React.ReactNode;
  testId?: string;
  title?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white text-[11px] leading-none px-2 py-1 shadow-sm"
      data-testid={testId}
      title={title}
    >
      {children}
    </span>
  );
}

/* Camera glyph */
function CameraIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M9 3a1 1 0 0 0-.9.56L7.38 5H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-2.38l-.72-1.44A1 1 0 0 0 14 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6.5 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
    </svg>
  );
}

/* Thumbs-up glyph */
function ThumbIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M2 10h4v12H2V10zm7.5 12h6.27c1.02 0 1.94-.64 2.29-1.6l2.41-6.52a2 2 0 0 0-1.24-2.55c-.2-.07-.42-.11-.64-.11h-4.6l.62-3.02.02-.23a2 2 0 0 0-.59-1.42L13.2 4 8.9 8.29A3 3 0 0 0 8 10.4V20a2 2 0 0 0 1.5 2z" />
    </svg>
  );
}

/* ===== Component ===== */
export default function DiscoverBuilders() {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [resolvedArea, setResolvedArea] = useState<string>(""); // server echoed outward like "E4"
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // Optional manual override for outward code
  const [inputArea, setInputArea] = useState<string>("");

  async function load(p: number, area?: string) {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams();
      q.set("page", String(p));
      q.set("pageSize", String(pageSize));
      if (area && area.trim()) q.set("location", area.trim());

      const { data } = await api.get<DiscoverResponse>(
        `/api/builders/discover?${q.toString()}`
      );
      setItems(data.items || []);
      setResolvedArea(data.location || "");
      setTotal(data.total || 0);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || "Failed to load results";
      setErr(msg);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !user) return;
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const onApplyArea = async (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    await load(1, inputArea);
  };

  return (
    <div data-testid="discover-builders-component">
      {/* Header */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              data-testid="discover-title"
            >
              Discover verified tradespeople
              {resolvedArea ? ` · ${resolvedArea}` : ""}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Companies House–verified builders recommended by your local
              community.
            </p>
          </div>

          {/* Location override */}
          <form onSubmit={onApplyArea} className="flex items-center gap-2">
            <input
              type="text"
              value={inputArea}
              onChange={(e) => setInputArea(e.target.value.toUpperCase())}
              placeholder={resolvedArea || "E4"}
              className="h-9 w-28 rounded-md border border-slate-300 bg-white/80 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
              aria-label="Postcode area"
              data-testid="discover-area-input"
            />
            <button
              type="submit"
              className="h-9 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-sm"
              data-testid="discover-apply"
              title="Apply area"
            >
              Apply
            </button>
          </form>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : err ? (
        <p className="text-red-600">{err}</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-slate-600">
          No verified tradespeople found yet in {resolvedArea || "your area"}.
        </div>
      ) : (
        <>
          <ul className="space-y-3" data-testid="discover-list">
            {items.map((it) => (
              <li key={it.companyNumber} data-testid="discover-item">
                <div className="rounded-2xl border border-slate-200 bg-white/85 hover:bg-white shadow-sm hover:shadow-md transition p-5 relative">
                  {/* Blue +N pill (extra recs) */}
                  {it.recCount > 1 && (
                    <span
                      className="absolute -top-2 -right-2 z-20 rounded-full bg-indigo-600 text-white text-[11px] leading-none px-2 py-1 shadow-md"
                      title={`${it.recCount - 1} more recommendation${
                        it.recCount - 1 === 1 ? "" : "s"
                      } in this area`}
                      data-testid="discover-recs-pill"
                    >
                      +{it.recCount - 1} more
                    </span>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-medium truncate">
                          <Link
                            href={`/builders/${it.sampleRecommendationId}`}
                            className="hover:underline decoration-indigo-400/60"
                            data-testid="discover-company"
                          >
                            {it.companyName}
                          </Link>
                        </h2>
                        <span
                          className="text-xs text-slate-500"
                          data-testid="discover-number"
                          title="Companies House number"
                        >
                          · {it.companyNumber}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                          data-testid="discover-likes"
                          title={`${it.totalLikes} vote${
                            it.totalLikes === 1 ? "" : "s"
                          }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5 -mt-px"
                            fill="currentColor"
                            aria-hidden
                          >
                            <path d="M2 10h4v12H2V10zm7.5 12h6.27c1.02 0 1.94-.64 2.29-1.6l2.41-6.52a2 2 0 0 0-1.24-2.55c-.2-.07-.42-.11-.64-.11h-4.6l.62-3.02.02-.23a2 2 0 0 0-.59-1.42L13.2 4 8.9 8.29A3 3 0 0 0 8 10.4V20a2 2 0 0 0 1.5 2z" />
                          </svg>
                          {it.totalLikes}
                        </span>

                        {it.hasPhotos && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                            data-testid="discover-photos"
                            title="Includes photos"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="currentColor"
                              aria-hidden
                            >
                              <path d="M9 3a1 1 0 0 0-.9.56L7.38 5H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-2.38l-.72-1.44A1 1 0 0 0 14 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6.5 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
                            </svg>
                            Photos
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className="text-xs text-slate-500 whitespace-nowrap"
                      title="Last recommended"
                      data-testid="discover-last-recommended"
                    >
                      {new Date(it.lastRecommendedAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="mt-3">
                    <Link
                      href={`/builders/${it.sampleRecommendationId}`}
                      className="btn"
                      data-testid="discover-view-btn"
                      aria-label={`View ${it.companyName}`}
                    >
                      View builder
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Pager */}
          <div
            className="mt-4 flex items-center justify-between"
            data-testid="discover-pager"
          >
            <button
              className="btn disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              data-testid="discover-prev"
            >
              Prev
            </button>
            <div
              className="text-sm text-slate-600"
              data-testid="discover-status"
            >
              Page <span data-testid="discover-page">{page}</span> /{" "}
              <span data-testid="discover-pages">
                {Math.max(1, Math.ceil(total / pageSize))}
              </span>{" "}
              • Total: <span data-testid="discover-total">{total}</span>
            </div>
            <button
              className="btn disabled:opacity-50"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
              data-testid="discover-next"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
