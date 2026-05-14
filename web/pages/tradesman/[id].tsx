// web/pages/tradesman/[id].tsx
import Head from "next/head";
import Toast from "@/components/Toast";
import ReportModal from "@/components/ReportModal";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import Layout from "@/components/Layout";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import TradesmanProfileMobile from "@/components/tradesmen/TradesmanProfileMobile";
import { useApi } from "@/utils/api";
import { trackBuilderProfileViewed, trackBuilderFavourited } from "@/utils/analytics";
import LightboxGallery, { type GalleryImage } from "@/components/LightboxGallery";
import { platformLabelFor } from "@/utils/reviewLinks";
import {
  CheckCircle2, ShieldCheck, Heart, ChevronLeft, Sparkles,
  Phone, Mail, Globe, Flag,
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
  about?: string | null;
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
  const [showReport, setShowReport] = useState(false);
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
        if (!cancelled) {
          setItem(data.item as TradesmanDetail);
          trackBuilderProfileViewed(String(id));
        }
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
        trackBuilderFavourited(builderId);
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

  // Bounce to the canonical /404 page when the tradesman can't be
  // loaded - single source of truth for the brand-correct, role-
  // aware 404 surface. Replaces the legacy red-styled inline 404
  // that used to live here. The redirect fires in a useEffect so
  // it runs after render, and we render a neutral shell in the
  // meantime so the old UI never flashes.
  if (err) {
    if (typeof window !== "undefined") {
      // router.replace inside a render is a no-op on the first pass,
      // but Next caches the navigation so the second tick swaps to
      // /404 cleanly. Wrapped in setTimeout(0) so we don't update
      // router during the current render cycle.
      setTimeout(() => {
        router.replace("/404");
      }, 0);
    }
    return null;
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

      {/* MOBILE — bare V1 hero portrait redesign */}
      <div className="md:hidden">
        <TradesmanProfileMobile
          item={item}
          trades={trades}
          planLabel={planLabel}
          memberSince={memberSince}
          projectScore={projectScore}
          sharedImages={sharedImages}
          isFavourite={isFavourite}
          favBusy={favBusy}
          onToggleFavourite={toggleFavourite}
        />
      </div>

      {/* DESKTOP - cream backdrop with brand watermark scatter, sticky 300px
          identity rail + main content column. Matches the visual language
          of /projects/[id] for consistency across the homeowner journey. */}
      <div className="hidden md:block">
      <Head>
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>
      <Layout>
      <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-12 relative overflow-hidden" data-testid="tradesman-page">
        <BrandWatermarkScatter />

        <div className="relative z-10 mx-auto max-w-6xl px-6 pt-3">
          {/* Back link */}
          <button
            type="button"
            onClick={() => window.history.length > 1 ? router.back() : router.push(backHref)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors mb-4"
            data-testid="btn-back-to-projects"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">

            {/* LEFT RAIL */}
            <aside className="lg:sticky lg:top-20 space-y-4">
              {/* Identity card with emerald accent border + floating Verified pill */}
              <div className="bg-white border-2 border-emerald-400 rounded-3xl p-5 shadow-md relative">
                <span className="absolute -top-2.5 left-5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white bg-emerald-600 px-2 py-0.5 rounded-full">
                  Verified
                </span>

                <button
                  type="button"
                  onClick={toggleFavourite}
                  disabled={favBusy}
                  aria-pressed={isFavourite}
                  aria-label={isFavourite ? "Remove from favourites" : "Save to favourites"}
                  title={isFavourite ? "Saved to favourites" : "Save to favourites"}
                  className={[
                    "absolute top-3 right-3 inline-flex items-center justify-center h-9 w-9 rounded-full border transition",
                    isFavourite
                      ? "bg-rose-50 border-rose-200 hover:bg-rose-100"
                      : "bg-amber-50 border-amber-100 hover:bg-amber-100",
                    favBusy ? "opacity-70 cursor-wait" : "",
                  ].join(" ")}
                  data-testid="btn-favourite-tradesman"
                >
                  <Heart className={`h-4 w-4 ${isFavourite ? "fill-rose-500 text-rose-500" : "text-zinc-400"}`} />
                </button>

                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-xl font-black shadow-md overflow-hidden mb-4">
                  {item.avatarUrl ? (
                    <img
                      src={item.avatarUrl}
                      alt={title}
                      className="w-full h-full object-cover"
                      data-testid="tradesman-avatar-photo"
                    />
                  ) : (
                    <span data-testid="tradesman-avatar-initials">
                      {initials(title)}
                    </span>
                  )}
                </div>

                <h1
                  className="text-[19px] font-black tracking-tight leading-tight text-slate-900 pr-10"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                  title={title}
                  data-testid="tradesman-name"
                >
                  {title}
                </h1>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.badges?.companiesHouseVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[11px] font-extrabold">
                      <ShieldCheck className="h-3 w-3" />
                      Verified
                    </span>
                  )}
                  {item.badges?.insuranceValid && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-700 px-2.5 py-0.5 text-[11px] font-extrabold">
                      <ShieldCheck className="h-3 w-3" />
                      Insured
                    </span>
                  )}
                  {planLabel && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-[11px] font-extrabold">
                      {planLabel}
                    </span>
                  )}
                </div>

                {item.googleRating != null && (
                  <div className="mt-2.5">
                    <GoogleRatingChip
                      rating={item.stats?.stars}
                      count={item.googleReviewsCount}
                      placeId={item.googlePlaceId || undefined}
                    />
                  </div>
                )}

                {memberSince && (
                  <div className="mt-2 text-[11px] text-zinc-500">{memberSince}</div>
                )}

                {/* Mini stats grid (2x2) */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MiniStat label="Likes" value={String(item.stats?.reviews ?? 0)} testId="tradesman-likes" />
                  <MiniStat label="Completed" value={String(item.stats?.completed ?? 0)} testId="tradesman-completed" />
                  <MiniStat label="Photos" value={String(item.stats?.photos ?? item.gallery?.length ?? 0)} testId="tradesman-photos" />
                  {(() => {
                    const displayScore = projectScore ?? (item.score != null && item.score > 0 ? item.score : null);
                    return (
                      <MiniStat
                        label="Trust"
                        value={displayScore != null ? String(Math.round(displayScore)) : "—"}
                        testId="tradesman-vmb-score"
                      />
                    );
                  })()}
                </div>

                {item.builderId && (
                  <div className="mt-4">
                    <HireButton
                      tradesmanUserId={item.builderId}
                      displayName={title}
                    />
                  </div>
                )}
              </div>

              {/* Contact details card */}
              <div className="bg-white border border-amber-100 rounded-3xl p-5 shadow-sm" data-testid="tradesman-contact-card">
                <SectionHeading>Contact details</SectionHeading>
                <div className="mt-3 space-y-2.5" data-testid="tradesman-contact-details-section">
                  <ContactLink
                    icon={<Phone className="w-4 h-4" />}
                    value={item.phone}
                    href={item.phone ? `tel:${item.phone}` : undefined}
                    testId="tradesman-phone"
                  />
                  <ContactLink
                    icon={<Mail className="w-4 h-4" />}
                    value={item.email}
                    href={item.email ? `mailto:${item.email}` : undefined}
                    testId="tradesman-email"
                  />
                  <ContactLink
                    icon={<Globe className="w-4 h-4" />}
                    value={item.website ? prettyDomain(item.website) : null}
                    href={item.website ? (item.website.startsWith("http") ? item.website : `https://${item.website}`) : undefined}
                    testId="tradesman-website"
                  />
                  {item.companyNumber && (
                    <div
                      className="flex items-center gap-2.5 text-[13px] text-slate-600"
                      data-testid="tradesman-company-number"
                    >
                      <span className="text-amber-500">
                        <ShieldCheck className="w-4 h-4" />
                      </span>
                      <span>
                        Co. no. <span className="font-bold text-slate-700">{item.companyNumber}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Online / socials card */}
              {item.socials && item.socials.length > 0 && (
                <div className="bg-white border border-amber-100 rounded-3xl p-5 shadow-sm">
                  <SectionHeading>Online</SectionHeading>
                  <ul className="mt-3 space-y-1.5 text-[13px]">
                    {item.socials.map((s) => (
                      <li key={s}>
                        <a
                          href={s}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
                        >
                          {socialLabel(s)} →
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* External review profiles - tradesperson-supplied plain-text
                  links to their own profiles on Trustpilot, Bark, MyBuilder,
                  Checkatrade, Houzz, Yell. We do NOT replicate the platforms'
                  brand visuals or display star counts; that's their UI's job.
                  The link text is "View on <Platform>" so the homeowner
                  clicks through and forms their own opinion at the source. */}
              {Array.isArray(item.reviewLinks) && item.reviewLinks.length > 0 && (
                <div
                  className="bg-white border border-amber-100 rounded-3xl p-5 shadow-sm"
                  data-testid="tradesman-review-links-section"
                >
                  <SectionHeading>External reviews</SectionHeading>
                  <ul className="mt-3 space-y-1.5 text-[13px]">
                    {item.reviewLinks.map((entry) => (
                      <li
                        key={`${entry.platform}-${entry.url}`}
                        data-testid={`tradesman-review-link-${entry.platform}`}
                      >
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
                        >
                          View on {platformLabelFor(entry)} →
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Discounts & warranty */}
              <div
                className="bg-white border border-amber-100 rounded-3xl p-5 shadow-sm"
                data-testid="tradesman-extras"
              >
                <SectionHeading>Discounts &amp; warranty</SectionHeading>
                {item.offersDiscount || item.warrantyMonths ? (
                  <div className="mt-3 space-y-2">
                    {item.offersDiscount && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[11px] font-extrabold">
                        Offers discounts
                      </span>
                    )}
                    {item.warrantyMonths ? (
                      <div className="text-[12.5px] text-slate-700">
                        Warranty: <span className="font-bold">{item.warrantyMonths} months</span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-[12.5px] text-slate-400">No discounts listed.</p>
                )}
              </div>

              {/* Areas covered */}
              <div
                className="bg-white border border-amber-100 rounded-3xl p-5 shadow-sm"
                data-testid="tradesman-areas"
              >
                <SectionHeading>Areas covered</SectionHeading>
                {item.serviceAreas && item.serviceAreas.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.serviceAreas.map((area, i) => (
                      <span
                        key={`${area}-${i}`}
                        data-testid={`tradesman-service-area-${area}`}
                        className="inline-flex items-center rounded-full bg-amber-50 border border-amber-100 text-amber-800 px-2.5 py-0.5 text-[11px] font-bold"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[12.5px] text-slate-400">Not provided.</p>
                )}
              </div>

              <button
                onClick={() => setShowReport(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-rose-500 transition-colors py-2"
                data-testid="btn-report-profile"
              >
                <Flag className="w-3.5 h-3.5" />
                Report this profile
              </button>
            </aside>

            {/* RIGHT MAIN */}
            <div className="space-y-6">
              {/* Hello banner: visual chrome only. The body paragraph used
                  to auto-stitch warranty / discount / registration facts but
                  it read like LLM filler, so we dropped the copy and kept
                  just the eyebrow + headline as a friendly section opener. */}
              <div className="bg-white rounded-3xl border border-amber-100 shadow-sm px-8 py-7 relative overflow-hidden">
                <Sparkles className="absolute top-5 right-7 w-5 h-5 text-amber-400/70" />
                <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-1.5">
                  About
                </div>
                <h2
                  className="text-[28px] font-black tracking-tight text-slate-900 leading-tight"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  Get to know{" "}
                  <span
                    className="text-emerald-600"
                    style={{ fontFamily: "'Caveat', cursive", fontSize: "118%" }}
                  >
                    {firstWord(title)}
                  </span>
                </h2>
              </div>

              {/* Trades offered */}
              <section
                className="bg-white rounded-3xl border border-amber-100 shadow-sm p-7"
                data-testid="tradesman-trades-card"
              >
                <SectionHeading>Trades offered</SectionHeading>
                {trades.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">No trades listed yet.</p>
                ) : (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {trades.map((t, i) => {
                      const Icon = TRADE_ICONS[t.toLowerCase()] ?? Hammer;
                      return (
                        <li
                          key={`${t}-${i}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-3.5 py-1.5 text-[13px] font-bold text-slate-700"
                          data-testid="tradesman-trade-item"
                        >
                          <Icon className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                          {t}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Shared photos */}
              {sharedLoading ? (
                <section
                  className="bg-white rounded-3xl border border-amber-100 shadow-sm p-6"
                  data-testid="tradesman-shared-photos-loading"
                >
                  <p className="text-sm text-slate-400">Loading shared photos…</p>
                </section>
              ) : (
                sharedImages.length > 0 && <SharedProfilePhotosSection images={sharedImages} />
              )}

              {/* View portfolio button (when hidden) */}
              {!sharedLoading && galleryImages.length > 0 && !showPortfolio && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowPortfolio(true)}
                    className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-4 py-2 text-[12px] font-bold text-amber-800 hover:bg-amber-100 transition-colors"
                    data-testid="btn-view-builder-work"
                  >
                    View their work →
                  </button>
                </div>
              )}

              {/* Portfolio gallery */}
              {showPortfolio && galleryImages.length > 0 && (
                <section
                  className="bg-white rounded-3xl border border-amber-100 shadow-sm p-7"
                  data-testid="tradesman-portfolio-card"
                >
                  <div className="flex items-center justify-between mb-4">
                    <SectionHeading>Recent work</SectionHeading>
                    <button
                      type="button"
                      onClick={() => setShowPortfolio(false)}
                      className="text-[12px] font-semibold text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      Hide
                    </button>
                  </div>
                  <LightboxGallery images={galleryImages} cols={3} rounded="rounded-2xl" />
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
      </Layout>
      </div>

      {showReport && item.builderId && (
        <ReportModal
          targetType="profile"
          targetId={item.builderId}
          onClose={() => setShowReport(false)}
        />
      )}
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

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div
      className="bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2 text-center"
      data-testid={testId}
    >
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div
        className="text-[16px] font-black tracking-tight text-slate-900 leading-none mt-0.5"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        {value}
      </div>
    </div>
  );
}

function ContactLink({
  icon,
  value,
  href,
  testId,
}: {
  icon: ReactNode;
  value?: string | null;
  href?: string;
  testId?: string;
}) {
  if (!value) {
    return (
      <div className="flex items-center gap-2.5 text-[13px] text-slate-400" data-testid={testId}>
        <span className="text-amber-500">{icon}</span>
        <span>Not provided</span>
      </div>
    );
  }
  if (!href) {
    return (
      <div className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-700" data-testid={testId}>
        <span className="text-amber-500">{icon}</span>
        <span className="truncate">{value}</span>
      </div>
    );
  }
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="flex items-center gap-2.5 text-[13px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
      data-testid={testId}
    >
      <span className="text-amber-500">{icon}</span>
      <span className="truncate">{value}</span>
    </a>
  );
}

function firstWord(s: string): string {
  return s.split(/\s+/)[0] || s;
}

function socialLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("facebook")) return "Facebook";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("twitter") || host.includes("x.com")) return "Twitter / X";
    if (host.includes("linkedin")) return "LinkedIn";
    if (host.includes("youtube")) return "YouTube";
    if (host.includes("tiktok")) return "TikTok";
    return host;
  } catch {
    return url;
  }
}
