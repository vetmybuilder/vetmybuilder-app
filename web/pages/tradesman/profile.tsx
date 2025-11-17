// web/pages/tradesman/profile.tsx
import { useRouter } from "next/router";
import { useEffect, useState, type ReactNode } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import LightboxGallery, {
  type GalleryImage,
} from "@/components/LightboxGallery";
import { CheckCircle2, ShieldCheck, Heart } from "lucide-react";
import SharedProfilePhotosSection from "@/components/tradesmen/SharedProfilePhotosSection";

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

export default function TradesmanProfilePage() {
  return (
    <AuthedOnly>
      <Inner />
    </AuthedOnly>
  );
}

function Inner() {
  const router = useRouter();
  const api = useApi();

  const [item, setItem] = useState<TradesmanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // NEW: shared photos from trade_shares
  const [sharedImages, setSharedImages] = useState<GalleryImage[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);

  // ---- Load *my* tradesman profile via /api/tradesmen/me ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await api.get("/api/tradesmen/me");
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
          (s: any) => Array.isArray(s.photos) && s.photos.length > 0
        );

        if (!withPhotos.length) {
          setSharedImages([]);
          return;
        }

        const target = withPhotos[0];

        const imgs: GalleryImage[] = (target.photos || []).map(
          (p: any, idx: number) => {
            const src = p.absoluteUrl || p.url;
            return {
              id: idx,
              thumbUrl: src,
              fullUrl: src,
              alt:
                p.name || `Shared project photo ${idx + 1} from this tradesman`,
            };
          }
        );

        setSharedImages(imgs);
      } catch {
        if (!cancelled) setSharedImages([]);
      } finally {
        if (!cancelled) setSharedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item?.builderId, api]);

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

  return (
    <div
      className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6"
      data-testid="tradesman-page"
    >
      {/* header */}
      <header className="mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-3 text-xs font-medium text-slate-500 hover:text-slate-700"
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

          {/* Right side: Edit profile (we'll wire the edit page next) */}
          <div className="flex sm:flex-col items-start sm:items-end">
            <button
              type="button"
              onClick={() => router.push("/tradesman/profile/edit")}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium shadow-sm border bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              data-testid="btn-edit-tradesman-profile"
            >
              <Heart className="h-4 w-4 text-slate-400" />
              <span>Edit profile</span>
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

          {/* gallery */}
          <section
            className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
            data-testid="tradesman-gallery-card"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                Project photos
              </h2>
              <span className="text-xs text-slate-500">
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
              <p className="text-sm text-slate-500">
                No photos have been uploaded yet.
              </p>
            )}
          </section>
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

// import Head from "next/head";
// import { useEffect, useMemo, useState } from "react";
// import { useApi } from "@/utils/api";
// import { useAuth } from "@/utils/auth";
// import { useRouter } from "next/router";

// type Profile = {
//   user_id?: string;
//   company_name?: string;
//   contact_name?: string;
//   phone?: string;
//   email?: string;
//   trade_types?: string;
//   service_areas?: string;
//   subscription_status?: string;
// };

// export default function TradesProfilePage() {
//   const api = useApi();
//   const { user, loading } = useAuth();
//   const router = useRouter();

//   const [p, setP] = useState<Profile | null>(null);
//   const [busy, setBusy] = useState(false);
//   const [err, setErr] = useState<string | null>(null);
//   const [ok, setOk] = useState<string | null>(null);

//   const status = useMemo(() => p?.subscription_status || "draft", [p]);

//   useEffect(() => {
//     let alive = true;
//     if (loading) return;
//     if (!user) {
//       router.replace(`/login?next=${encodeURIComponent("/tradesman/profile")}`);
//       return;
//     }
//     (async () => {
//       try {
//         const { data } = await api.get("/api/tradesmen/me");
//         const prof = data?.profile || null;
//         if (!alive) return;
//         setP(prof);
//       } catch (e: any) {
//         if (!alive) return;
//         setErr(
//           e?.response?.data?.error || e?.message || "Failed to load profile"
//         );
//       }
//     })();
//     return () => {
//       alive = false;
//     };
//   }, [user, loading, api, router]);

//   function set<K extends keyof Profile>(k: K, v: Profile[K]) {
//     setP((prev) => (prev ? { ...prev, [k]: v } : prev));
//   }

//   async function save(e: React.FormEvent) {
//     e.preventDefault();
//     if (!p) return;
//     setBusy(true);
//     setErr(null);
//     setOk(null);
//     try {
//       await api.put("/api/tradesmen/me", {
//         // immutable: company_name, contact_name, email
//         companyName: p.company_name, // server requires it, so echo current value
//         contactName: p.contact_name,
//         email: p.email,
//         phone: p.phone || "",
//         tradeTypes: p.trade_types || "",
//         serviceAreas: p.service_areas || "",
//       });
//       setOk("Saved.");
//     } catch (e: any) {
//       setErr(
//         e?.response?.data?.error || e?.message || "Failed to save profile"
//       );
//     } finally {
//       setBusy(false);
//     }
//   }

//   return (
//     <>
//       <Head>
//         <title>Manage trades profile • Vetmybuilder</title>
//       </Head>
//       <div
//         className="mx-auto max-w-2xl px-4 py-4"
//         data-testid="trades-profile-page"
//       >
//         <h1 className="text-2xl font-semibold mb-2">Manage profile</h1>
//         {status === "draft" && (
//           <div
//             className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
//             data-testid="review-banner"
//           >
//             Your account is being reviewed. We’ll notify you once your account
//             is fully verified.
//           </div>
//         )}

//         {!p ? (
//           <div className="card">Loading…</div>
//         ) : (
//           <form
//             className="card grid gap-3"
//             onSubmit={save}
//             data-testid="trades-profile-form"
//           >
//             <div className="grid sm:grid-cols-2 gap-3">
//               <div>
//                 <label className="text-sm">Company name</label>
//                 <input
//                   className="input bg-slate-50"
//                   value={p.company_name || ""}
//                   disabled
//                 />
//               </div>
//               <div>
//                 <label className="text-sm">Contact name</label>
//                 <input
//                   className="input bg-slate-50"
//                   value={p.contact_name || ""}
//                   disabled
//                 />
//               </div>
//             </div>

//             <div className="grid sm:grid-cols-2 gap-3">
//               <div>
//                 <label className="text-sm">Email</label>
//                 <input
//                   className="input bg-slate-50"
//                   value={p.email || ""}
//                   disabled
//                 />
//               </div>
//               <div>
//                 <label className="text-sm" htmlFor="phone">
//                   Phone
//                 </label>
//                 <input
//                   id="phone"
//                   className="input"
//                   value={p.phone || ""}
//                   onChange={(e) => set("phone", e.target.value)}
//                   placeholder="020…"
//                   data-testid="input-phone"
//                 />
//               </div>
//             </div>

//             <div>
//               <label className="text-sm" htmlFor="trades">
//                 Trades (comma separated)
//               </label>
//               <input
//                 id="trades"
//                 className="input"
//                 value={p.trade_types || ""}
//                 onChange={(e) => set("trade_types", e.target.value)}
//                 placeholder="plumber, electrician"
//                 data-testid="input-trades"
//               />
//             </div>

//             <div>
//               <label className="text-sm" htmlFor="areas">
//                 Service areas (comma separated)
//               </label>
//               <input
//                 id="areas"
//                 className="input"
//                 value={p.service_areas || ""}
//                 onChange={(e) => set("service_areas", e.target.value)}
//                 placeholder="E4, E17, Chingford"
//                 data-testid="input-areas"
//               />
//             </div>

//             {err && (
//               <p
//                 className="text-sm text-red-600"
//                 role="alert"
//                 data-testid="profile-error"
//               >
//                 {err}
//               </p>
//             )}
//             {ok && (
//               <p
//                 className="text-sm text-emerald-700"
//                 role="status"
//                 data-testid="profile-ok"
//               >
//                 {ok}
//               </p>
//             )}

//             <div className="flex gap-2">
//               <button
//                 className="btn"
//                 disabled={busy}
//                 data-testid="btn-save-profile"
//               >
//                 {busy ? "Saving…" : "Save changes"}
//               </button>
//               <button
//                 type="button"
//                 className="btn btn-secondary"
//                 onClick={() => router.push("/tradesman/projects")}
//               >
//                 Back to jobs
//               </button>
//             </div>
//           </form>
//         )}
//       </div>
//     </>
//   );
// }
