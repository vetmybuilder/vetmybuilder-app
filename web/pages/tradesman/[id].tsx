// web/pages/tradesman/[id].tsx
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import LightboxGallery, { type GalleryImage } from "@/components/LightboxGallery";
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

  const backHref = useMemo(() => {
    const q: any = router.query || {};
    const raw =
      (Array.isArray(q.returnTo) ? q.returnTo[0] : q.returnTo) ||
      (Array.isArray(q.from) ? q.from[0] : q.from) || "";
    const s = String(raw || "").trim();
    return s && s.startsWith("/") ? s : "/projects?tab=completed";
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
      } else {
        await api.delete(`/api/tradesmen/${encodeURIComponent(builderId)}/favourite`);
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
      <div className="relative min-h-screen bg-stone-50 -mt-14">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-24 text-sm text-zinc-500">Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <>
        <Head>
          <title>Tradesman not found — VetMyBuilder</title>
          <style>{`body { background: #fafaf9 !important; }`}</style>
        </Head>
        <div className="overflow-x-hidden min-h-screen">
          <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-stone-50">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
              <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
            </div>
            <div className="relative z-10 w-full max-w-lg px-4 sm:px-0 text-center">
              <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-10 sm:p-14">
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
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="relative min-h-screen overflow-x-hidden bg-stone-50 -mt-14" data-testid="tradesman-page">
        {/* Background bands */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-24 pb-16 space-y-6">

          {/* Back link */}
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
            data-testid="btn-back-to-projects"
          >
            ← Back to projects
          </button>

          {/* Header card */}
          <header className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              {/* Left: avatar + info */}
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="h-20 w-20 sm:h-24 sm:w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-zinc-200 grid place-items-center text-xl font-black text-white">
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt={title} className="h-full w-full object-cover" />
                  ) : (
                    <span>{initials(title)}</span>
                  )}
                </div>

                <div className="min-w-0">
                  <h1
                    className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900"
                    title={title}
                    data-testid="tradesman-name"
                  >
                    {title}
                  </h1>

                  {/* Badges */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.badges?.companiesHouseVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-3 py-0.5 text-xs font-bold">
                        <ShieldCheck className="h-3 w-3" />
                        Companies House verified
                      </span>
                    )}
                    {item.badges?.insuranceValid && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-700 px-3 py-0.5 text-xs font-bold">
                        <ShieldCheck className="h-3 w-3" />
                        Insurance verified
                      </span>
                    )}
                    {planLabel && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-3 py-0.5 text-xs font-bold">
                        {planLabel}
                      </span>
                    )}
                    {memberSince && (
                      <span className="text-xs text-zinc-400">Member since {memberSince}</span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                    <GoogleRatingChip
                      rating={item.stats?.stars}
                      count={item.stats?.reviews}
                      placeId={item.googlePlaceId || undefined}
                    />
                    <span data-testid="tradesman-likes">Likes: {item.stats?.reviews ?? 0}</span>
                    <span data-testid="tradesman-completed">Completed: {item.stats?.completed ?? 0}</span>
                    <span data-testid="tradesman-photos">Photos: {item.stats?.photos ?? item.gallery?.length ?? 0}</span>
                    {item.score != null && (
                      <span data-testid="tradesman-score">VMB score: {item.score}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: favourite button */}
              <div className="flex sm:flex-col items-start sm:items-end">
                <button
                  type="button"
                  onClick={toggleFavourite}
                  disabled={favBusy}
                  aria-pressed={isFavourite}
                  className={[
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-sm border transition",
                    isFavourite
                      ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100"
                      : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                    favBusy ? "opacity-70 cursor-wait" : "",
                  ].join(" ")}
                  data-testid="btn-favourite-tradesman"
                >
                  <Heart className={`h-4 w-4 ${isFavourite ? "fill-rose-500 text-rose-500" : ""}`} />
                  {isFavourite ? "Saved" : "Save to favourites"}
                </button>
              </div>
            </div>
          </header>

          {/* Main layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] gap-6">
            {/* Left: trades + photos + portfolio */}
            <div className="space-y-6">

              {/* Trades offered */}
              <section className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 sm:p-7" data-testid="tradesman-trades-card">
                <h2 className="text-lg font-black text-zinc-900 mb-4">Trades offered</h2>
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
                <section className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6" data-testid="tradesman-shared-photos-loading">
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
                    className="text-sm font-bold text-red-500 hover:text-red-600 transition-colors"
                    data-testid="btn-view-builder-work"
                  >
                    View builder's work →
                  </button>
                </div>
              )}

              {/* Portfolio gallery */}
              {showPortfolio && galleryImages.length > 0 && (
                <section className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 sm:p-7" data-testid="tradesman-portfolio-card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-black text-zinc-900">Builder portfolio</h2>
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
            <aside className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 sm:p-7 h-fit" data-testid="tradesman-contact-card">
              <h2 className="text-lg font-black text-zinc-900 mb-5">Profile details</h2>

              <div className="space-y-6 text-sm">
                {/* Contact details */}
                <section data-testid="tradesman-contact-details-section">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Contact details</h3>
                  <div className="space-y-3">
                    <ContactRow label="Phone" value={item.phone} dataTestId="tradesman-phone"
                      render={(v) => <a href={`tel:${v}`} className="text-red-500 hover:underline font-medium">{v}</a>}
                    />
                    <ContactRow label="Email" value={item.email} dataTestId="tradesman-email"
                      render={(v) => <a href={`mailto:${v}`} className="text-red-500 break-all hover:underline font-medium">{v}</a>}
                    />
                    <ContactRow label="Website" value={item.website} dataTestId="tradesman-website"
                      render={(v) => (
                        <a href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noopener noreferrer" className="text-red-500 break-all hover:underline font-medium">
                          {prettyDomain(v)}
                        </a>
                      )}
                    />
                    <ContactRow label="Company no" value={item.companyNumber} dataTestId="tradesman-company-number" />
                  </div>
                </section>

                {/* Discounts & warranty */}
                <section data-testid="tradesman-extras">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Discounts &amp; warranty</h3>
                  {item.offersDiscount || item.warrantyMonths ? (
                    <div className="space-y-1.5">
                      {item.offersDiscount && (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-3 py-0.5 text-xs font-bold">
                          Offers discounts
                        </span>
                      )}
                      {item.warrantyMonths ? (
                        <div className="text-xs text-zinc-600">Warranty: {item.warrantyMonths} months</div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">No discounts listed.</p>
                  )}
                </section>

                {/* Areas covered */}
                <section data-testid="tradesman-areas">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Areas covered</h3>
                  {item.serviceAreas && item.serviceAreas.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.serviceAreas.map((area, i) => (
                        <span key={`${area}-${i}`} className="inline-flex items-center rounded-full bg-zinc-100 text-zinc-700 px-2.5 py-0.5 text-xs font-medium">
                          {area}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">Not provided.</p>
                  )}
                </section>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- helpers ---------- */

type ContactRowProps = {
  label: string;
  value?: string | null;
  dataTestId: string;
  render?: (value: string) => ReactNode;
};

function ContactRow({ label, value, dataTestId, render }: ContactRowProps) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={dataTestId}>
      <span className="text-[11px] uppercase tracking-wide text-zinc-400 font-bold">{label}</span>
      {value ? (
        render ? render(value) : <span className="text-sm text-zinc-700 font-medium">{value}</span>
      ) : (
        <span className="text-sm text-zinc-300">Not provided</span>
      )}
    </div>
  );
}
