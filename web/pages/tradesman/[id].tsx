// web/pages/tradesman/[id].tsx
import Head from "next/head";
import Toast from "@/components/Toast";
import { useRouter } from "next/router";
import StatPill from "@/components/StatPill";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import LightboxGallery, { type GalleryImage } from "@/components/LightboxGallery";
import { platformLabelFor } from "@/utils/reviewLinks";
import {
  CheckCircle2, ShieldCheck, Heart,
  Hammer, Home, PaintBucket, Layers, Wrench, Bath, Building2,
  Zap, Droplets, Flame, TreePine, Wind, Lightbulb, Shovel,
  HardHat, Ruler, Square, Fence, DoorOpen, Sun,
} from "lucide-react";

const TRADE_ICONS: Record<string, React.ElementType> = {
  "general builder":          Hammer,
  "extension builder":        Building2,
  "loft conversion":          Home,
  "new build":                Building2,
  "decorator":                PaintBucket,
  "painter":                  PaintBucket,
  "painter & decorator":      PaintBucket,
  "plasterer":                Layers,
  "flooring specialist":      Layers,
  "flooring":                 Layers,
  "tiler":                    Square,
  "bathroom fitter":          Bath,
  "kitchen fitter":           Wrench,
  "plumber":                  Droplets,
  "electrician":              Zap,
  "handyman":                 Wrench,
  "roofer":                   Home,
  "external wall insulation": Wind,
  "insulation":               Wind,
  "landscaper":               TreePine,
  "gardener":                 TreePine,
  "carpenter":                Ruler,
  "joiner":                   Ruler,
  "windows & doors":          DoorOpen,
  "conservatory":             Sun,
  "solar panels":             Sun,
  "groundworks":              Shovel,
  "demolition":               HardHat,
  "scaffolding":              HardHat,
  "fencing":                  Fence,
  "gas engineer":             Flame,
  "heating engineer":         Flame,
  "boiler installation":      Flame,
  "lighting":                 Lightbulb,
};
import SharedProfilePhotosSection from "@/components/tradesmen/SharedProfilePhotosSection";
import HireButton from "@/components/project/HireButton";
import {
  initials,
  prettyDomain,
  normaliseTrades,
  getPlanLabel,
  formatMemberSince,
} from "@/utils/tradesmanProfile";
import { normalizedCompanyKey, getAggregateVmbForCompany } from "@/utils/vmb";
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
  googleRating?: number | null;
  googleReviewsCount?: number | null;
  reviewLinks?: Array<{ platform: string; url: string }>;
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
  const [favToast, setFavToast] = useState<string | null>(null);
  const [showPortfolio, setShowPortfolio] = useState(true);
  const [sharedImages, setSharedImages] = useState<GalleryImage[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [projectScore, setProjectScore] = useState<number | null>(null);

  const backHref = useMemo(() => {
    const q: any = router.query || {};
    const raw =
      (Array.isArray(q.returnTo) ? q.returnTo[0] : q.returnTo) ||
      (Array.isArray(q.from) ? q.from[0] : q.from) || "";
    const s = String(raw || "").trim();
    const pid = Array.isArray(q.projectId) ? q.projectId[0] : q.projectId;
    if (s && s.startsWith("/")) return s;
    if (pid) return `/projects/${pid}`;
    return "/projects";
  }, [router.query]);

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
    return () => { cancelled = true; };
  }, [router.isReady, id, api]);

  // When viewing from a project context, fetch the same project-specific
  // trust score the builders page uses — so both pages are consistent.
  useEffect(() => {
    const rawPid = Array.isArray(router.query.projectId) ? router.query.projectId[0] : router.query.projectId;
    const pid = Number(rawPid);
    const companyName = item?.companyName;
    if (!Number.isFinite(pid) || !companyName) { setProjectScore(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const agg = await getAggregateVmbForCompany(
          async ({ projectId, offset = 0, limit = 250 }) => {
            const res = await api.get(`/api/recommendations/ratings?projectId=${projectId}&offset=${offset}&limit=${limit}`);
            const data = (res as any)?.data ?? res;
            const items = (data?.items || []).map((it: any) => ({
              id: it.id,
              company: it.company ?? "",
              score: it.score,
            }));
            return { items, total: Number.isFinite(data?.total) ? data.total : items.length };
          },
          pid,
          companyName,
        );
        if (!cancelled && typeof agg === "number" && agg > 0) setProjectScore(agg);
      } catch {
        // score unavailable
      }
    })();
    return () => { cancelled = true; };
  }, [item?.companyName, router.query.projectId, api]);

  useEffect(() => {
    if (!item?.builderId) { setSharedImages([]); return; }
    let cancelled = false;
    (async () => {
      try {
        setSharedLoading(true);
        const q = new URLSearchParams({ tradesmanUid: String(item.builderId), limit: "5" });
        const res = await api.get(`/api/tradesmen/shares?${q.toString()}`);
        const data = (res as any)?.data ?? res;
        if (cancelled) return;
        const shares = Array.isArray(data?.shares) ? data.shares : [];
        const withPhotos = shares.filter((s: any) => Array.isArray(s.photos) && s.photos.length > 0);
        if (!withPhotos.length) { setSharedImages([]); return; }
        const target = withPhotos[0];
        const imgs: GalleryImage[] = (target.photos || []).map((p: any, idx: number) => {
          const src = p.absoluteUrl || p.url;
          return { id: idx, thumbUrl: src, fullUrl: src, alt: p.name || `Shared project photo ${idx + 1}` };
        });
        setSharedImages(imgs);
      } catch {
        if (!cancelled) setSharedImages([]);
      } finally {
        if (!cancelled) setSharedLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item?.builderId, api]);

  const toggleFavourite = async () => {
    if (!item || favBusy) return;
    const builderId = item.builderId;
    if (!builderId) return;
    const currentlyFav = item.isFavourite === true || item.isFavourite === 1;
    setFavBusy(true);
    try {
      if (!currentlyFav) {
        await api.post(`/api/tradesmen/${encodeURIComponent(builderId)}/favourite`);
        setItem({ ...item, isFavourite: true });
        setFavToast("Added to favourites");
      } else {
        await api.delete(`/api/tradesmen/${encodeURIComponent(builderId)}/favourite`);
        setItem({ ...item, isFavourite: false });
        setFavToast("Removed from favourites");
      }
    } catch (e) {
      console.error("Failed to toggle favourite", e);
    } finally {
      setFavBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="relative min-h-screen -mt-14">
        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-24">
          <p className="text-sm text-white/80 drop-shadow">Loading…</p>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <>
        <Head>
          <title>Tradesman not found — VetMyBuilder</title>
        </Head>
        <div className="overflow-x-hidden min-h-screen">
          <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
            <div className="relative z-10 w-full max-w-lg px-4 sm:px-0 text-center">
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm p-6 sm:p-14">
                <p className="text-8xl font-black text-red-500 leading-none mb-4">404</p>
                <h1 className="text-2xl font-black tracking-tight text-zinc-900 mb-3">
                  Tradesman not found
                </h1>
                <p className="text-zinc-500 text-sm leading-relaxed mb-8">
                  This tradesman profile doesn&apos;t exist or is no longer available.
                </p>
                <a
                  href="/"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all"
                >
                  Back to home
                </a>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!item) return null;

  const title = item.companyName || item.displayName || "Tradesman";
  const trades = normaliseTrades(item.tradeTypes);
  const galleryImages: GalleryImage[] = (item.gallery || []).map((src, i) => ({
    id: i, thumbUrl: src, fullUrl: src, alt: `${title} photo ${i + 1}`,
  }));
  const planLabel = getPlanLabel(item.tier);
  const memberSince = formatMemberSince(item.createdAt);
  const isFavourite = item.isFavourite === true || item.isFavourite === 1;

  return (
    <>
      <Head>
        <title>{title} — VetMyBuilder</title>
      </Head>

      <div className="relative min-h-screen overflow-x-hidden -mt-14" data-testid="tradesman-page">

        <div className="relative z-10 mx-auto max-w-6xl px-2.5 sm:px-6 lg:px-8 pt-3 sm:pt-10 pb-16 space-y-3 sm:space-y-6">

          {/* Back link */}
          <button
            type="button"
            onClick={() => window.history.length > 1 ? router.back() : router.push(backHref)}
            className="inline-flex items-center gap-2 mb-3 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            data-testid="btn-back-to-projects"
          >
            ← Back to projects
          </button>

          {/* Header card */}
          <header className="relative bg-white rounded-xl sm:rounded-3xl shadow-sm px-3.5 py-4 sm:px-8 sm:py-7">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 pr-10 sm:pr-0">
              {/* Left: avatar + info */}
              <div className="flex items-start gap-2.5 sm:gap-5">
                <div className="h-12 w-12 sm:h-24 sm:w-24 flex-shrink-0 overflow-hidden rounded-lg sm:rounded-2xl bg-zinc-200 grid place-items-center text-base sm:text-xl font-black text-white">
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt={title} className="h-full w-full object-cover" />
                  ) : (
                    <span>{initials(title)}</span>
                  )}
                </div>

                <div className="min-w-0">
                  <h1
                    className="text-base sm:text-3xl font-black tracking-tight text-zinc-900 leading-tight"
                    title={title}
                    data-testid="tradesman-name"
                  >
                    {title}
                  </h1>

                  {/* Badges */}
                  <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                    {item.badges?.companiesHouseVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 sm:px-3 py-0.5 text-[10px] sm:text-xs font-bold">
                        <ShieldCheck className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        Verified
                      </span>
                    )}
                    {item.badges?.insuranceValid && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-700 px-2 sm:px-3 py-0.5 text-[10px] sm:text-xs font-bold">
                        <ShieldCheck className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        Insured
                      </span>
                    )}
                    {planLabel && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 sm:px-3 py-0.5 text-[10px] sm:text-xs font-bold">
                        {planLabel}
                      </span>
                    )}
                    {memberSince && (
                      <span className="text-[10px] sm:text-xs text-zinc-400">{memberSince}</span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <GoogleRatingChip
                      rating={item.stats?.stars}
                      count={item.googleReviewsCount}
                      placeId={item.googlePlaceId || undefined}
                    />
                    <StatPill
                      testId="tradesman-likes"
                      icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-rose-400"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"/></svg>}
                      label="Likes"
                      value={item.stats?.reviews ?? 0}
                    />
                    <StatPill
                      testId="tradesman-completed"
                      icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-emerald-500"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>}
                      label="Completed"
                      value={item.stats?.completed ?? 0}
                    />
                    <StatPill
                      testId="tradesman-photos"
                      icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-sky-400"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd"/></svg>}
                      label="Photos"
                      value={item.stats?.photos ?? item.gallery?.length ?? 0}
                    />
                    {(() => {
                      const displayScore = projectScore ?? (item.score != null && item.score > 0 ? item.score : null);
                      if (displayScore == null) return null;
                      return (
                        <StatPill
                          testId="tradesman-vmb-score"
                          icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-red-500"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>}
                          label="Trust score"
                          value={Math.round(displayScore)}
                        />
                      );
                    })()}
                  </div>

                  {/* Hire button */}
                  {item.builderId && (
                    <div className="mt-3 sm:mt-4">
                      <HireButton
                        tradesmanUserId={item.builderId}
                        displayName={title}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Favourite heart — absolute top-right */}
              <button
                type="button"
                onClick={toggleFavourite}
                disabled={favBusy}
                aria-pressed={isFavourite}
                aria-label={isFavourite ? "Remove from favourites" : "Save to favourites"}
                title={isFavourite ? "Saved to favourites" : "Save to favourites"}
                className={[
                  "absolute top-3 right-3 sm:top-6 sm:right-6 inline-flex items-center justify-center h-8 w-8 sm:h-10 sm:w-10 rounded-full border transition",
                  isFavourite
                    ? "bg-rose-50 border-rose-200 hover:bg-rose-100"
                    : "bg-white border-zinc-200 hover:bg-zinc-50",
                  favBusy ? "opacity-70 cursor-wait" : "",
                ].join(" ")}
                data-testid="btn-favourite-tradesman"
              >
                <Heart className={`h-4 w-4 sm:h-6 sm:w-6 ${isFavourite ? "fill-rose-500 text-rose-500" : "text-zinc-400"}`} />
              </button>
            </div>
          </header>

          {/* Main layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] gap-3 sm:gap-6">
            {/* Left: trades + photos + portfolio */}
            <div className="space-y-3 sm:space-y-6">

              {/* Trades offered */}
              <section className="bg-white rounded-2xl sm:rounded-3xl shadow-sm p-4 sm:p-7" data-testid="tradesman-trades-card">
                <h2 className="text-base sm:text-lg font-black text-zinc-900 mb-2.5 sm:mb-4">Trades offered</h2>
                {trades.length === 0 ? (
                  <p className="text-sm text-zinc-400">No trades listed yet.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {trades.map((t, i) => {
                      const Icon = TRADE_ICONS[t.toLowerCase()] ?? Hammer;
                      return (
                        <li
                          key={`${t}-${i}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-700"
                          data-testid="tradesman-trade-item"
                        >
                          <Icon className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                          {t}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Shared photos */}
              {sharedLoading ? (
                <section className="bg-white rounded-2xl sm:rounded-3xl shadow-sm p-4 sm:p-6" data-testid="tradesman-shared-photos-loading">
                  <p className="text-sm text-zinc-400">Loading shared photos…</p>
                </section>
              ) : (
                sharedImages.length > 0 && <SharedProfilePhotosSection images={sharedImages} />
              )}

              {/* View portfolio button */}
              {!sharedLoading && galleryImages.length > 0 && !showPortfolio && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowPortfolio(true)}
                    className="inline-flex items-center rounded-lg bg-black/40 px-3 py-1.5 text-xs sm:text-sm font-bold text-white hover:bg-black/60 transition-colors backdrop-blur-sm"
                    data-testid="btn-view-builder-work"
                  >
                    View builder&apos;s work →
                  </button>
                </div>
              )}

              {/* Portfolio gallery */}
              {showPortfolio && galleryImages.length > 0 && (
                <section className="bg-white rounded-2xl sm:rounded-3xl shadow-sm p-4 sm:p-7" data-testid="tradesman-portfolio-card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base sm:text-lg font-black text-zinc-900">Builder portfolio</h2>
                    <button
                      type="button"
                      onClick={() => setShowPortfolio(false)}
                      className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
                    >
                      Hide
                    </button>
                  </div>
                  <LightboxGallery images={galleryImages} cols={3} rounded="rounded-xl" />
                </section>
              )}

            </div>

            {/* Right: contact card */}
            <aside className="bg-white rounded-2xl sm:rounded-3xl shadow-sm p-4 sm:p-7 h-fit" data-testid="tradesman-contact-card">
              <h2 className="text-base sm:text-lg font-black text-zinc-900 mb-3 sm:mb-5">Profile details</h2>

              <div className="space-y-4 sm:space-y-6">
                {/* Contact details */}
                <section data-testid="tradesman-contact-details-section">
                  <h3 className="hidden sm:block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Contact details</h3>
                  <div className="space-y-3 sm:space-y-4">
                    <ContactRow label="Phone" value={item.phone} dataTestId="tradesman-phone"
                      render={(v) => <a href={`tel:${v}`} className="text-red-500 hover:underline font-semibold break-all">{v}</a>}
                    />
                    <ContactRow label="Email" value={item.email} dataTestId="tradesman-email"
                      render={(v) => <a href={`mailto:${v}`} className="text-red-500 break-all hover:underline font-semibold">{v}</a>}
                    />
                    <ContactRow label="Website" value={item.website} dataTestId="tradesman-website"
                      render={(v) => (
                        <a href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noopener noreferrer" className="text-red-500 break-all hover:underline font-semibold">
                          {prettyDomain(v)}
                        </a>
                      )}
                    />
                    <ContactRow label="Company no" value={item.companyNumber} dataTestId="tradesman-company-number" />
                  </div>
                </section>

                {/* External review profiles - tradesperson-supplied
                    plain-text links to their own profiles on Trustpilot,
                    Bark, MyBuilder, Checkatrade, Houzz, Yell. We do NOT
                    replicate the platforms' brand visuals or display
                    star counts; that's their UI's job. The link text is
                    "View on <Platform>" so the homeowner clicks through
                    and forms their own opinion at the source. */}
                {Array.isArray(item.reviewLinks) && item.reviewLinks.length > 0 && (
                  <section data-testid="tradesman-review-links-section">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                      External reviews
                    </h3>
                    <ul className="space-y-2">
                      {item.reviewLinks.map((entry) => (
                        <li
                          key={`${entry.platform}-${entry.url}`}
                          data-testid={`tradesman-review-link-${entry.platform}`}
                        >
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="text-red-500 hover:underline font-semibold text-sm"
                          >
                            View on {platformLabelFor(entry)} →
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Discounts & warranty */}
                <section data-testid="tradesman-extras">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Discounts &amp; warranty</h3>
                  {item.offersDiscount || item.warrantyMonths ? (
                    <div className="space-y-2">
                      {item.offersDiscount && (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-sm sm:text-xs font-bold">
                          Offers discounts
                        </span>
                      )}
                      {item.warrantyMonths ? (
                        <div className="text-sm sm:text-xs text-zinc-600">Warranty: {item.warrantyMonths} months</div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm sm:text-xs text-zinc-400">No discounts listed.</p>
                  )}
                </section>

                {/* Areas covered */}
                <section data-testid="tradesman-areas">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Areas covered</h3>
                  {item.serviceAreas && item.serviceAreas.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {item.serviceAreas.map((area, i) => (
                        <span key={`${area}-${i}`} className="inline-flex items-center rounded-full bg-zinc-100 text-zinc-700 px-3 py-1 text-sm sm:text-xs font-semibold">
                          {area}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm sm:text-xs text-zinc-400">Not provided.</p>
                  )}
                </section>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <Toast message={favToast} onDismiss={() => setFavToast(null)} />
    </>
  );
}

/* ---------- helpers ---------- */

function vmbScoreColor(score: number): string {
  if (score >= 55) return "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/25";
  if (score >= 30) return "bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/25";
  return "bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/25";
}

type ContactRowProps = {
  label: string;
  value?: string | null;
  dataTestId: string;
  render?: (value: string) => ReactNode;
};

function ContactRow({ label, value, dataTestId, render }: ContactRowProps) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={dataTestId}>
      <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{label}</span>
      <div className="text-lg sm:text-base font-semibold text-zinc-700">
        {value ? (
          render ? render(value) : value
        ) : (
          <span className="text-zinc-300 font-normal">Not provided</span>
        )}
      </div>
    </div>
  );
}
