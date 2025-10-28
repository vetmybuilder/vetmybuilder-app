import Link from "next/link";
import * as React from "react";
import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { ThumbsUpIcon } from "@/components/ui/Icons";
import { chBadgeClass, chIcon, chLabel } from "@/components/ui/vmb";

/* ===== Types ===== */
type TradesmanLite = {
  companyNumber?: string | null;
  companyName: string;
  topRecId?: number | null;
  votes?: number;
  score?: number | null;
  area?: string | null;
  photos?: string[] | { filePath: string }[] | null;
};

function asPhotoUrl(p?: string | { filePath?: string } | null) {
  if (!p) return null;
  if (typeof p === "string") return p;
  if (typeof p === "object" && p.filePath) return p.filePath;
  return null;
}

/* ===== Props ===== */
type Props = {
  /** Postcode or area to search near, e.g., "E4" */
  location: string | null | undefined;
  /** Max number of cards to show inline (default 6) */
  limit?: number;
  /** Section title (optional) */
  title?: string;
  /** Optional subtitle (set "" to hide) */
  subtitle?: string;
  /** "grid" (cards) or "list" (rows) */
  layout?: "grid" | "list";
  /** Where to render View All button */
  ctaPlacement?: "header" | "footer" | "none";
  /** Link target for View All */
  viewAllHref?: string;
};

export default function DiscoverInline({
  location,
  limit = 6,
  title = "Discover trusted tradespeople near you",
  subtitle = "Here are nearby tradesmen we think could help with your home project.",
  layout = "grid",
  ctaPlacement = "header",
  viewAllHref = "/builders/discover",
}: Props) {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  const [items, setItems] = useState<TradesmanLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!location || authLoading || !user) return;
    let killed = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/api/tradesmen/discover", {
          params: { near: location, limit },
        });
        if (killed) return;
        const arr: TradesmanLite[] = Array.isArray(data?.items)
          ? data.items
          : [];
        setItems(arr);
      } catch {
        if (!killed) setItems([]);
      } finally {
        if (!killed) setLoading(false);
      }
    })();
    return () => {
      killed = true;
    };
  }, [api, user, authLoading, location, limit]);

  if (loading) {
    return (
      <section className="mt-8" aria-label="Discover loading skeleton">
        <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm p-5">
          <div
            className={
              layout === "grid"
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                : "space-y-3"
            }
            aria-hidden
          >
            {Array.from({ length: limit }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-xl border border-slate-200 bg-slate-50 animate-pulse"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!items.length) return null;

  const Header = () => (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2
          id="discover-inline-title"
          className="text-xl font-semibold tracking-tight"
          data-testid="discover-inline-heading"
        >
          {title}
        </h2>
        {subtitle !== "" && (
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        )}
      </div>
      {ctaPlacement === "header" && (
        <Link
          href={viewAllHref}
          className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          data-testid="discover-inline-view-all"
          aria-label="View all nearby tradespeople"
        >
          View all
        </Link>
      )}
    </div>
  );

  return (
    <section
      className="mt-8"
      data-testid="discover-inline"
      aria-labelledby="discover-inline-title"
    >
      <div className="rounded-2xl border border-slate-200 bg-white/90 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5">
          <Header />
        </div>

        {/* Soft divider */}
        <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

        {/* Content */}
        <div className="p-5">
          {layout === "grid" ? (
            <ul
              role="list"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {items.slice(0, limit).map((t, idx) => (
                <li
                  key={`${t.companyNumber || t.companyName}-${idx}`}
                  role="listitem"
                >
                  <DiscoverCard t={t} />
                </li>
              ))}
            </ul>
          ) : (
            <ul role="list" className="space-y-3">
              {items.slice(0, limit).map((t, idx) => (
                <li
                  key={`${t.companyNumber || t.companyName}-${idx}`}
                  role="listitem"
                >
                  <DiscoverRow t={t} />
                </li>
              ))}
            </ul>
          )}

          {ctaPlacement === "footer" && (
            <div className="mt-5 flex justify-center">
              <Link
                href={viewAllHref}
                className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                data-testid="discover-inline-view-all"
              >
                View all tradespeople
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ===== Presentational bits ===== */

function DiscoverCard({ t }: { t: TradesmanLite }) {
  const photoSrc = asPhotoUrl(Array.isArray(t.photos) ? t.photos[0] : null);
  const href = t.topRecId ? `/builders/${t.topRecId}` : "/builders/discover";
  const initials = t.companyName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Link
      href={href}
      className="group relative block rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition"
      data-testid="discover-card"
      aria-label={`Open ${t.companyName} profile`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="h-12 w-12 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 text-slate-500 grid place-items-center">
            {photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="font-semibold text-sm">{initials}</span>
            )}
          </div>

          {/* Title + badges */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{t.companyName}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${chBadgeClass(
                      "verified"
                    )}`}
                    title={
                      t.companyNumber
                        ? `Companies House · ${t.companyNumber}`
                        : "Companies House"
                    }
                    data-testid={
                      t.companyNumber ? "discover-ch-number" : undefined
                    }
                  >
                    {chIcon("verified")}
                    {t.companyNumber ? (
                      <>CH&nbsp;#{t.companyNumber}</>
                    ) : (
                      <span>{chLabel("verified")}</span>
                    )}
                  </span>

                  {t.area && (
                    <span
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 px-2 py-0.5"
                      data-testid="discover-area"
                    >
                      {t.area}
                    </span>
                  )}
                </div>
              </div>

              {/* Metrics */}
              <div className="shrink-0 text-right">
                {typeof t.score === "number" && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                    title={`VMB score: ${t.score}`}
                    data-testid="discover-vmb-score"
                  >
                    VMB {Number(t.score).toFixed(1).replace(/\.0$/, "")}
                  </span>
                )}
                {typeof t.votes === "number" && (
                  <div
                    className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 tabular-nums"
                    data-testid="discover-votes"
                    title={`${t.votes} vote${t.votes === 1 ? "" : "s"}`}
                  >
                    <ThumbsUpIcon className="h-3.5 w-3.5" />
                    {t.votes}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hover accent */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 opacity-0 group-hover:opacity-100 transition bg-gradient-to-r from-indigo-200 via-indigo-300 to-indigo-200" />
    </Link>
  );
}

function DiscoverRow({ t }: { t: TradesmanLite }) {
  const photoSrc = asPhotoUrl(Array.isArray(t.photos) ? t.photos[0] : null);
  const href = t.topRecId ? `/builders/${t.topRecId}` : "/builders/discover";
  const initials = t.companyName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md transition"
      data-testid="discover-card"
      aria-label={`Open ${t.companyName} profile`}
    >
      {/* Avatar */}
      <div className="h-12 w-12 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 text-slate-500 grid place-items-center shrink-0">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="font-semibold text-sm">{initials}</span>
        )}
      </div>

      {/* Main */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium truncate">{t.companyName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${chBadgeClass(
                  "verified"
                )}`}
                title={
                  t.companyNumber
                    ? `Companies House · ${t.companyNumber}`
                    : "Companies House"
                }
                data-testid={t.companyNumber ? "discover-ch-number" : undefined}
              >
                {chIcon("verified")}
                {t.companyNumber ? (
                  <>CH&nbsp;#{t.companyNumber}</>
                ) : (
                  <span>{chLabel("verified")}</span>
                )}
              </span>

              {t.area && (
                <span
                  className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 px-2 py-0.5"
                  data-testid="discover-area"
                >
                  {t.area}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            {typeof t.score === "number" && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                data-testid="discover-vmb-score"
              >
                VMB {Number(t.score).toFixed(1).replace(/\.0$/, "")}
              </span>
            )}
            {typeof t.votes === "number" && (
              <div
                className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 tabular-nums"
                data-testid="discover-votes"
              >
                <ThumbsUpIcon className="h-3.5 w-3.5" />
                {t.votes}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
