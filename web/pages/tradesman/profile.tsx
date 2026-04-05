// web/pages/tradesman/profile.tsx
import { useRouter } from "next/router";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import LightboxGallery, {
  type GalleryImage,
} from "@/components/LightboxGallery";
import {
  ShieldCheck,
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

  isFavourite?: boolean | 0 | 1; // not really used on "my profile" view
};

type MeResponse = {
  role: "tradesman" | "user";
  profile: any | null;
};

export default function TradesmanProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/tradesman/login");
    }
  }, [loading, user, router]);

  if (loading || !user) return null;
  return <Inner />;
}

function Inner() {
  const router = useRouter();
  const api = useApi();

  const [item, setItem] = useState<TradesmanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ---- Load *my* tradesman profile via /api/tradesmen/me ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await api.get<MeResponse>("/api/tradesmen/me");
        const data = (res as any)?.data ?? res;

        const profile = data?.profile || null;
        const role = data?.role;

        if (!profile || role !== "tradesman") {
          if (!cancelled) {
            setErr("No trade profile found.");
            setItem(null);
          }
          return;
        }

        const mapped = mapProfileToDetail(profile);
        if (!cancelled) setItem(mapped);
      } catch (e: any) {
        if (!cancelled) {
          const status = e?.response?.status;
          setErr(status === 404 ? "Not found" : e?.message || "Failed");
          setItem(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const pageContent = (() => {
    if (loading) {
      return (
        <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 text-sm text-zinc-500">
          Loading…
        </div>
      );
    }

    if (err) {
      return (
        <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 text-sm text-rose-600">
          {err}
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

    return (
      <div className="space-y-6" data-testid="tradesman-page">
        {/* header card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              {item.avatarUrl ? (
                <img
                  src={item.avatarUrl}
                  alt={title}
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover ring-1 ring-zinc-200"
                  data-testid="profile-avatar-img"
                />
              ) : (
                <div
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-zinc-100 grid place-items-center font-bold text-zinc-700 text-xl"
                  data-testid="profile-avatar-initials"
                >
                  {initials(title)}
                </div>
              )}

              <div className="min-w-0">
                <h1
                  className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900"
                  title={title}
                  data-testid="tradesman-name"
                >
                  {title}
                </h1>

                {/* badges row */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.badges?.companiesHouseVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-medium">
                      <ShieldCheck className="h-3 w-3" />
                      Companies House verified
                    </span>
                  )}
                  {item.badges?.insuranceValid && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 px-2.5 py-0.5 text-xs font-medium">
                      <ShieldCheck className="h-3 w-3" />
                      Insurance verified
                    </span>
                  )}
                  {planLabel && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 text-xs font-medium text-amber-900 px-2.5 py-0.5">
                      {planLabel}
                    </span>
                  )}
                  {memberSince && (
                    <span className="text-xs text-zinc-500">
                      Member since {memberSince}
                    </span>
                  )}
                </div>

                {/* quick stats */}
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-zinc-600">
                  <span data-testid="tradesman-stars">
                    ⭐ {item.stats?.stars?.toFixed?.(1) ?? "4.8"}
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

            {/* actions */}
            <div className="flex flex-wrap sm:flex-col items-start gap-2 shrink-0">
              <button
                type="button"
                onClick={() => router.push("/tradesman/projects")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 hover:shadow-xl hover:scale-[1.02] transition-all"
                data-testid="btn-view-tradesman-jobs"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd"/>
                  <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z"/>
                </svg>
                View available jobs
              </button>
              <button
                type="button"
                onClick={() => router.push("/tradesman/profile/edit")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all"
                data-testid="btn-edit-tradesman-profile"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                </svg>
                Edit your profile
              </button>
            </div>
          </div>
        </div>

        {/* main layout: left content, right contact card */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] gap-6">
          {/* left: trades + gallery */}
          <div className="space-y-6">
            {/* trades offered */}
            <section
              className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 sm:p-8"
              data-testid="tradesman-trades-card"
            >
              <h2 className="text-base font-black tracking-tight text-zinc-900 mb-4">
                Trades offered
              </h2>
              {trades.length === 0 ? (
                <p className="text-sm text-zinc-500">No trades listed yet.</p>
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

            {/* gallery */}
            <section
              className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 sm:p-8"
              data-testid="tradesman-gallery-card"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-black tracking-tight text-zinc-900">
                  Project photos
                </h2>
                <span className="text-xs text-zinc-500">
                  {item.gallery?.length || 0} photo
                  {(item.gallery?.length || 0) === 1 ? "" : "s"}
                </span>
              </div>

              {galleryImages.length > 0 ? (
                <LightboxGallery
                  images={galleryImages}
                  cols={3}
                  rounded="rounded-xl"
                />
              ) : (
                <p className="text-sm text-zinc-500">
                  No photos have been uploaded yet.
                </p>
              )}
            </section>
          </div>

          {/* right: contact + discounts + areas */}
          <aside
            className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 sm:p-8"
            data-testid="tradesman-contact-card"
          >
            <h2 className="text-base font-black tracking-tight text-zinc-900 mb-5">
              Profile details
            </h2>

            <div className="space-y-6 text-sm text-zinc-800">
              {/* 1) Contact details */}
              <section data-testid="tradesman-contact-details-section">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
                  Contact details
                </h3>
                <div className="space-y-3">
                  <ContactRow
                    label="Name"
                    value={item.displayName}
                    dataTestId="tradesman-contact-name"
                  />
                  <ContactRow
                    label="Phone"
                    value={item.phone}
                    dataTestId="tradesman-phone"
                    render={(v) => (
                      <a href={`tel:${v}`} className="text-red-500 hover:underline">
                        {v}
                      </a>
                    )}
                  />
                  <ContactRow
                    label="Email"
                    value={item.email}
                    dataTestId="tradesman-email"
                    render={(v) => (
                      <a href={`mailto:${v}`} className="text-red-500 break-all hover:underline">
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
                        className="text-red-500 break-all hover:underline"
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
                  {item.socials && item.socials.length > 0 && (
                    <div data-testid="tradesman-socials">
                      <span className="text-[11px] uppercase tracking-wide text-slate-500 block mb-1">
                        Social links
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {item.socials.map((url, i) => {
                          const href = url.startsWith("http") ? url : `https://${url}`;
                          const { icon, label, color } = getSocialMeta(url);
                          return (
                            <a
                              key={i}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={label}
                              title={label}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-80 ${color}`}
                            >
                              {icon}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* 2) Discounts & warranty */}
              <section data-testid="tradesman-extras">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
                  Discounts &amp; warranty
                </h3>
                {item.offersDiscount || item.warrantyMonths ? (
                  <div className="space-y-1 text-xs text-zinc-600">
                    {item.offersDiscount && <div>Offers discounts</div>}
                    {item.warrantyMonths ? (
                      <div>Warranty: {item.warrantyMonths} months</div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">No discounts listed.</p>
                )}
              </section>

              {/* 3) Areas covered */}
              <section data-testid="tradesman-areas">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
                  Areas covered
                </h3>
                {item.serviceAreas && item.serviceAreas.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {item.serviceAreas.map((area, i) => (
                      <span
                        key={`${area}-${i}`}
                        className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700"
                      >
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
    );
  })();

  return (
    <>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        {pageContent}
      </div>
    </>
  );
}

/* ---------- mapping helpers ---------- */

function mapProfileToDetail(profile: any): TradesmanDetail {
  const companyName = profile.company_name || null;
  const displayName = profile.contact_name || null;
  const builderId =
    String(profile.user_id || profile.uid || profile.id || "") || "me";

  const companiesHouseVerified =
    String(profile.ch_status || "")
      .trim()
      .toLowerCase() === "verified";

  const insuranceValid =
    Number(profile.insurance_valid ?? profile.insuranceVerified ?? 0) === 1;

  const gallery: string[] = Array.isArray(profile.gallery)
    ? profile.gallery
    : Array.isArray(profile.photo_urls)
    ? profile.photo_urls
    : [];

  const serviceAreas: string[] = (() => {
    const raw = profile.service_areas || profile.serviceAreas || "";
    return String(raw)
      .split(/[,;|]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  })();

  const tradeTypes = profile.trade_types || profile.tradeTypes || null;

  const score =
    typeof profile.vmb_score === "number"
      ? profile.vmb_score
      : profile.score ?? null;

  const outward =
    profile.location_outward || (serviceAreas[0] || "").split(/\s+/)[0] || null;

  const stats = {
    completed:
      Number(
        profile.completed_projects ??
          profile.completed ??
          profile.jobs_completed ??
          0
      ) || 0,
    photos: Number(profile.photo_count ?? gallery.length ?? 0) || 0,
    reviews:
      Number(
        profile.reviews_count ??
          profile.likes_count ??
          profile.recommendations_count ??
          0
      ) || 0,
    stars:
      Number(profile.stars ?? profile.rating ?? profile.avg_rating ?? 0) || 0,
  };

  const discountMin = Number(
    profile.discount_min_percent ?? profile.discount_min ?? 0
  );
  const discountMax = Number(
    profile.discount_max_percent ?? profile.discount_max ?? 0
  );
  const offersDiscount =
    Number(profile.offers_discount ?? 0) > 0 ||
    discountMin > 0 ||
    discountMax > 0;

  return {
    builderId,
    companyName,
    displayName,
    badges: {
      companiesHouseVerified,
      insuranceValid,
    },
    avatarUrl: profile.avatar_url || profile.logo_url || null,
    gallery,
    stats,
    score,
    location: { outward },

    phone: profile.phone || null,
    email: profile.email || null,
    website: profile.web_url || profile.website || null,
    socials: parseSocials(profile.social_links_json || profile.socialLinks),
    companyNumber: profile.company_number || profile.companyNumber || null,

    tier: profile.plan || profile.tier || null,
    serviceAreas,
    badge: profile.vmb_badge || profile.badge || null,
    offersDiscount,
    warrantyMonths: Number(profile.warranty_months ?? 0) || 0,
    tradeTypes,
    createdAt: profile.created_at || profile.createdAt || null,

    isFavourite: false,
  };
}

/* ---------- UI helpers ---------- */

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

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "T";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function prettyDomain(url: string) {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function normaliseTrades(raw?: string | null): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[,/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function getPlanLabel(tier?: string | null): string | null {
  const t = (tier || "").toLowerCase();
  if (t === "gold") return "Gold member";
  if (t === "spotlight") return "Spotlight plan";
  if (t === "unlock" || t === "unlock_contact") return "Unlock plan";
  if (t === "free" || !t) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function formatMemberSince(createdAt?: string | null): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function getSocialMeta(url: string): { icon: React.ReactNode; label: string; color: string } {
  if (/instagram/i.test(url)) return {
    label: "Instagram",
    color: "bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 text-white",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    ),
  };
  if (/tiktok/i.test(url)) return {
    label: "TikTok",
    color: "bg-black text-white",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.67a8.18 8.18 0 004.78 1.52V6.74a4.85 4.85 0 01-1.01-.05z"/>
      </svg>
    ),
  };
  if (/facebook/i.test(url)) return {
    label: "Facebook",
    color: "bg-[#1877F2] text-white",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  };
  if (/twitter|x\.com/i.test(url)) return {
    label: "X",
    color: "bg-black text-white",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  };
  if (/youtube/i.test(url)) return {
    label: "YouTube",
    color: "bg-[#FF0000] text-white",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
  };
  if (/linkedin/i.test(url)) return {
    label: "LinkedIn",
    color: "bg-[#0A66C2] text-white",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  };
  // fallback — generic link icon
  let hostname = url;
  try { hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace("www.", ""); } catch {}
  return {
    label: hostname,
    color: "bg-zinc-200 text-zinc-700",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
    ),
  };
}

function parseSocials(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
  } catch {
    // ignore
  }
  return [];
}
