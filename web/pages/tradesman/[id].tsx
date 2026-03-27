// web/pages/tradesman/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import LightboxGallery, {
  type GalleryImage,
} from "@/components/LightboxGallery";
import { CheckCircle2, ShieldCheck, Heart } from "lucide-react";
import SharedProfilePhotosSection from "@/components/tradesmen/SharedProfilePhotosSection";
import {
  initials,
  prettyDomain,
  normaliseTrades,
  getPlanLabel,
  formatMemberSince,
} from "@/utils/tradesmanProfile";
import { GoogleRatingChip } from "@/components/GoogleRatingChip";

type TradesmanDetail = {
  builderId: string;
  companyName: string | null;
  displayName: string | null;
  badges: { companiesHouseVerified: boolean; insuranceValid: boolean };
  avatarUrl: string | null;
  gallery: string[];
  stats: { completed: number; photos: number; reviews: number; stars: number };
  score: number | null;
  location?: { outward?: string | null };

  phone?: string | null;
  email?: string | null;
  website?: string | null;
  socials?: string[];
  companyNumber?: string | null;

  tier?: string | null;
  serviceAreas?: string[] | null;

  badge?: string | null;
  offersDiscount?: boolean;
  warrantyMonths?: number;
  tradeTypes?: string | null;
  createdAt?: string | null;
  isFavourite?: boolean | 0 | 1;
  googlePlaceId?: string | null;
};

export default function TradesmanViewPage() {
  return (
    <AuthedOnly>
      <Inner />
    </AuthedOnly>
  );
}

function Inner() {
  const router = useRouter();
  const api = useApi();
  const { id } = router.query;

  const [item, setItem] = useState<TradesmanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [favBusy, setFavBusy] = useState(false);

  const [showPortfolio, setShowPortfolio] = useState(false);
  const [sharedImages, setSharedImages] = useState<GalleryImage[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);

  // --- Back target: prefer explicit returnTo/from, otherwise go to projects completed tab ---
  const backHref = useMemo(() => {
    const q: any = router.query || {};
    const raw =
      (Array.isArray(q.returnTo) ? q.returnTo[0] : q.returnTo) ||
      (Array.isArray(q.from) ? q.from[0] : q.from) ||
      "";

    const s = String(raw || "").trim();
    // Only allow internal paths
    if (s && s.startsWith("/")) return s;

    // Fallback
    return "/projects?tab=completed";
  }, [router.query]);

  const handleBackToProjects = () => {
    // Don't rely on router.back() because Next can restore /projects from bfcache
    // leaving stale state; pushing /projects triggers the refresh hooks on that page.
    router.push(backHref);
  };

  // ---- Load tradesman profile ----
  useEffect(() => {
    if (!router.isReady || !id) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await api.get(`/api/tradesmen/${id}`);
        const data = (res as any)?.data ?? res;
        if (!data?.item) throw new Error("Not found");
        if (!cancelled) setItem(data.item as TradesmanDetail);
      } catch (e: any) {
        if (!cancelled) {
          const status = e?.response?.status;
          setErr(status === 404 ? "Not found" : e?.message || "Failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, id, api]);

  // ---- Load shared photos for this tradesman (if any) ----
  useEffect(() => {
    if (!item?.builderId) {
      setSharedImages([]);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        setSharedLoading(true);
        const q = new URLSearchParams({
          tradesmanUid: String(item.builderId),
          limit: "5",
        });

        const res = await api.get(`/api/tradesmen/shares?${q.toString()}`);
        const data = (res as any)?.data ?? res;

        if (cancelled) return;

        const shares = Array.isArray(data?.shares) ? data.shares : [];
        const withPhotos = shares.filter(
          (s: any) => Array.isArray(s.photos) && s.photos.length > 0,
        );

        if (!withPhotos.length) {
          setSharedImages([]);
          return;
        }

        // For now, use the most recent share with photos
        const target = withPhotos[0];

        const imgs: GalleryImage[] = (target.photos || []).map(
          (p: any, idx: number) => {
            const src = p.absoluteUrl || p.url;
            return {
              id: idx, // local to this gallery
              thumbUrl: src,
              fullUrl: src,
              alt:
                p.name || `Shared project photo ${idx + 1} from this tradesman`,
            };
          },
        );

        setSharedImages(imgs);
      } catch (e) {
        // Fail silently – shared photos are optional UX
        if (!cancelled) setSharedImages([]);
      } finally {
        if (!cancelled) setSharedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item?.builderId, api]);

  const toggleFavourite = async () => {
    if (!item || favBusy) return;
    const builderId = item.builderId;
    if (!builderId) return;

    const currentlyFav = item.isFavourite === true || item.isFavourite === 1;

    setFavBusy(true);
    try {
      if (!currentlyFav) {
        // add to favourites
        await api.post(
          `/api/tradesmen/${encodeURIComponent(builderId)}/favourite`,
        );
        setItem({ ...item, isFavourite: true });
      } else {
        // remove from favourites
        await api.delete(
          `/api/tradesmen/${encodeURIComponent(builderId)}/favourite`,
        );
        setItem({ ...item, isFavourite: false });
      }
    } catch (e) {
      console.error("Failed to toggle favourite", e);
    } finally {
      setFavBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (err) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sm text-rose-600">{err}</p>
      </div>
    );
  }

  if (!item) return null;

  const title = item.companyName || item.displayName || "Tradesman";
  const trades = normaliseTrades(item.tradeTypes);

  const galleryImages: GalleryImage[] = (item.gallery || []).map((src, i) => ({
    id: i,
    thumbUrl: src,
    fullUrl: src,
    alt: `${title} photo ${i + 1}`,
  }));

  const planLabel = getPlanLabel(item.tier);
  const memberSince = formatMemberSince(item.createdAt);
  const isFavourite = item.isFavourite === true || item.isFavourite === 1;

  return (
    <div
      className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6"
      data-testid="tradesman-page"
    >
      {/* header */}
      <header className="mb-6">
        <button
          type="button"
          onClick={handleBackToProjects}
          className="mb-3 text-xs font-medium text-slate-500 hover:text-slate-700"
          data-testid="btn-back-to-projects"
          aria-label="Back to projects"
        >
          ← Back to projects
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            {item.avatarUrl ? (
              <img
                src={item.avatarUrl}
                alt={title}
                className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover ring-1 ring-neutral-200"
              />
            ) : (
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-slate-200 grid place-items-center font-semibold text-slate-700">
                {initials(title)}
              </div>
            )}

            <div className="min-w-0">
              <h1
                className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900"
                title={title}
                data-testid="tradesman-name"
              >
                {title}
              </h1>

              {/* badges row – Companies House + plan */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                {item.badges?.companiesHouseVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                    <ShieldCheck className="h-3 w-3" />
                    Companies House verified
                  </span>
                )}
                {item.badges?.insuranceValid && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 px-2 py-0.5">
                    <ShieldCheck className="h-3 w-3" />
                    Insurance verified
                  </span>
                )}
                {planLabel && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full
                               bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500
                               text-xs font-medium text-amber-900 px-2.5 py-0.5"
                  >
                    {planLabel}
                  </span>
                )}
                {memberSince && (
                  <span className="text-xs text-slate-500">
                    Member since {memberSince}
                  </span>
                )}
              </div>

              {/* quick stats */}
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs sm:text-sm text-neutral-700">
                <span data-testid="tradesman-stars">
                  <GoogleRatingChip
                    rating={item.stats?.stars}
                    count={item.stats?.reviews}
                    placeId={item.googlePlaceId || undefined}
                  />
                </span>
                <span data-testid="tradesman-likes">
                  Likes: {item.stats?.reviews ?? 0}
                </span>
                <span data-testid="tradesman-completed">
                  Completed: {item.stats?.completed ?? 0}
                </span>
                <span data-testid="tradesman-photos">
                  Photos: {item.stats?.photos ?? item.gallery?.length ?? 0}
                </span>
                {item.score != null && (
                  <span data-testid="tradesman-score">
                    VMB score: {item.score}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Favourite button */}
          <div className="flex sm:flex-col items-start sm:items-end">
            <button
              type="button"
              onClick={toggleFavourite}
              disabled={favBusy}
              aria-pressed={isFavourite}
              className={[
                "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium shadow-sm border",
                isFavourite
                  ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
                favBusy ? "opacity-70 cursor-wait" : "",
              ].join(" ")}
              data-testid="btn-favourite-tradesman"
            >
              <Heart
                className={`h-4 w-4 ${
                  isFavourite ? "fill-rose-500 text-rose-500" : ""
                }`}
              />
              <span>
                {isFavourite ? "Saved to favourites" : "Save to favourites"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* main layout: left content, right contact card */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] gap-6">
        {/* left: trades + shared photos + gallery */}
        <div className="space-y-6">
          {/* trades offered */}
          <section
            className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
            data-testid="tradesman-trades-card"
          >
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 mb-3">
              Trades offered
            </h2>
            {trades.length === 0 ? (
              <p className="text-sm text-slate-500">No trades listed yet.</p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {trades.map((t, i) => (
                  <li
                    key={`${t}-${i}`}
                    className="inline-flex items-start gap-2 text-sm text-slate-800"
                    data-testid="tradesman-trade-item"
                  >
                    <CheckCircle2 className="h-4 w-4 mt-[2px] text-emerald-500 flex-shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* shared photos – only when there are any */}
          {sharedLoading ? (
            <section
              className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:p-5"
              data-testid="tradesman-shared-photos-loading"
            >
              <p className="text-sm text-emerald-700">Loading shared photos…</p>
            </section>
          ) : (
            sharedImages.length > 0 && (
              <SharedProfilePhotosSection images={sharedImages} />
            )
          )}

          {!sharedLoading && galleryImages.length > 0 && !showPortfolio && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowPortfolio(true)}
                className="text-sm font-medium text-indigo-600 hover:underline"
                data-testid="btn-view-builder-work"
              >
                View builder’s work
              </button>
            </div>
          )}

          {showPortfolio && galleryImages.length > 0 && (
            <section
              className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
              data-testid="tradesman-portfolio-card"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                  Builder portfolio
                </h2>
                <button
                  type="button"
                  onClick={() => setShowPortfolio(false)}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Hide
                </button>
              </div>

              <LightboxGallery
                images={galleryImages}
                cols={3}
                rounded="rounded-xl"
              />
            </section>
          )}
        </div>

        {/* right: contact + discounts + areas */}
        <aside
          className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
          data-testid="tradesman-contact-card"
        >
          <h2 className="text-sm sm:text-base font-semibold text-slate-900 mb-4">
            Profile details
          </h2>

          <div className="space-y-6 text-sm text-slate-800">
            {/* 1) Contact details */}
            <section data-testid="tradesman-contact-details-section">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Contact details
              </h3>
              <div className="space-y-3">
                <ContactRow
                  label="Phone"
                  value={item.phone}
                  dataTestId="tradesman-phone"
                  render={(v) => (
                    <a
                      href={`tel:${v}`}
                      className="text-emerald-700 hover:underline"
                    >
                      {v}
                    </a>
                  )}
                />
                <ContactRow
                  label="Email"
                  value={item.email}
                  dataTestId="tradesman-email"
                  render={(v) => (
                    <a
                      href={`mailto:${v}`}
                      className="text-emerald-700 break-all hover:underline"
                    >
                      {v}
                    </a>
                  )}
                />
                <ContactRow
                  label="Website"
                  value={item.website}
                  dataTestId="tradesman-website"
                  render={(v) => (
                    <a
                      href={v.startsWith("http") ? v : `https://${v}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 break-all hover:underline"
                    >
                      {prettyDomain(v)}
                    </a>
                  )}
                />
                <ContactRow
                  label="Company no"
                  value={item.companyNumber}
                  dataTestId="tradesman-company-number"
                />
              </div>
            </section>

            {/* 2) Discounts & warranty */}
            <section data-testid="tradesman-extras">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Discounts &amp; warranty
              </h3>
              {item.offersDiscount || item.warrantyMonths ? (
                <div className="space-y-1 text-xs text-slate-600">
                  {item.offersDiscount && <div>Offers discounts</div>}
                  {item.warrantyMonths ? (
                    <div>Warranty: {item.warrantyMonths} months</div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No discounts listed.</p>
              )}
            </section>

            {/* 3) Areas covered */}
            <section data-testid="tradesman-areas">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Areas covered
              </h3>
              {item.serviceAreas && item.serviceAreas.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {item.serviceAreas.map((area, i) => (
                    <span
                      key={`${area}-${i}`}
                      className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Not provided.</p>
              )}
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- small helpers still local ---------- */

type ContactRowProps = {
  label: string;
  value?: string | null;
  dataTestId: string;
  render?: (value: string) => ReactNode;
};

function ContactRow({ label, value, dataTestId, render }: ContactRowProps) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={dataTestId}>
      <span className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {value ? (
        render ? (
          render(value)
        ) : (
          <span className="text-sm text-slate-800">{value}</span>
        )
      ) : (
        <span className="text-sm text-slate-400">Not provided</span>
      )}
    </div>
  );
}
