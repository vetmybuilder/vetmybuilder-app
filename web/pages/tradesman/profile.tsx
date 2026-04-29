// web/pages/tradesman/profile.tsx
// Mobile-first tradesman profile (the tradesperson's own view).
//
// Renders as a bare route - no SiteHeader, no notification bell, fills the
// screen. Layout: emerald gradient hero with overlay top-bar, floating
// stats card on the seam, then inline content sections (Trades, Service
// areas, Recent work) on a white backdrop.

import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import { ChevronLeft, Pencil, ShieldCheck } from "lucide-react";

type MeResponse = {
  role: "tradesman" | "user";
  profile: any | null;
};

type Profile = {
  companyName: string | null;
  contactName: string | null;
  profilePictureUrl: string | null;
  gallery: string[];
  outward: string | null;
  serviceAreas: string[];
  trades: string[];
  phone: string | null;
  email: string | null;
  website: string | null;
  verified: boolean;
  stats: { stars: number; completed: number; reviews: number; score: number | null };
};

export default function TradesmanProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/tradesman/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) return null;
  return <Inner />;
}

function Inner() {
  const router = useRouter();
  const api = useApi();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await api.get<MeResponse>("/api/tradesmen/me");
        const data = (res as any)?.data ?? res;
        const p = data?.profile;
        if (!p || data?.role !== "tradesman") {
          if (!cancelled) setErr("No trade profile found.");
          return;
        }
        if (!cancelled) setProfile(mapProfile(p));
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  const heroLetter = profile
    ? initials(profile.companyName || profile.contactName || "T")
    : "T";

  return (
    <>
      <Head>
        <title>Profile - VetMyBuilder</title>
        <style>{`body { background: #ffffff !important; }`}</style>
      </Head>

      <main
        className="fixed inset-0 bg-white flex flex-col"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
        data-testid="tradesman-profile-page"
      >
        {/* TOP BAR - absolute overlay so the gradient hero extends underneath */}
        <div className="absolute top-0 left-0 right-0 z-30">
          <div className="h-[env(safe-area-inset-top)]" />
          <div className="flex items-center justify-between px-4 h-14">
            <button
              type="button"
              aria-label="Back"
              onClick={() => router.back()}
              className="w-9 h-9 rounded-full bg-white/25 backdrop-blur-md inline-flex items-center justify-center hover:bg-white/35 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <span className="text-[15px] font-extrabold text-white drop-shadow">
              Profile
            </span>
            <button
              type="button"
              aria-label="Edit profile"
              onClick={() => router.push("/tradesman/profile/edit")}
              className="w-9 h-9 rounded-full bg-white/25 backdrop-blur-md inline-flex items-center justify-center hover:bg-white/35 transition-colors"
              data-testid="btn-edit-profile"
            >
              <Pencil className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-6 text-sm text-gray-500">Loading...</div>
          )}

          {err && !loading && (
            <div className="p-6 text-sm text-red-600">{err}</div>
          )}

          {profile && !loading && (
            <>
              {/* HERO - emerald gradient, top bar overlays this */}
              <div
                className="relative pt-20 pb-12 px-5 text-center"
                style={{
                  background:
                    "linear-gradient(160deg,#047857 0%,#10b981 60%,#6ee7b7 100%)",
                }}
              >
                {/* Avatar - profile pic first, fall back to initials in a
                    white circle so the emerald letter contrasts */}
                {profile.profilePictureUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={profile.profilePictureUrl}
                    alt=""
                    className="mx-auto w-24 h-24 rounded-full object-cover shadow-xl border-4 border-white/40"
                  />
                ) : (
                  <div className="mx-auto w-24 h-24 rounded-full bg-white/95 flex items-center justify-center text-[34px] font-black text-emerald-700 shadow-xl border-4 border-white/40">
                    {heroLetter}
                  </div>
                )}

                <h1
                  className="mt-4 text-[20px] sm:text-[22px] font-black tracking-tight text-white leading-tight drop-shadow"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                  data-testid="profile-name"
                >
                  {profile.companyName || profile.contactName || "Your business"}
                </h1>
                {profile.outward && (
                  <div className="mt-1 text-[13px] text-white/85 drop-shadow">
                    {profile.outward}
                  </div>
                )}

                {/* Verified pill - white bg, emerald icon + text */}
                {profile.verified && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 text-[12px] font-extrabold text-emerald-700 shadow-md">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified
                  </div>
                )}
              </div>

              {/* STATS CARD - floats half over the hero / white seam */}
              <div className="px-4 -mt-6 relative z-10">
                <div className="bg-white rounded-2xl shadow-md border border-gray-200 px-3 py-3 grid grid-cols-3 text-center">
                  <Stat
                    label="Rating"
                    value={
                      <span className="inline-flex items-center gap-0.5">
                        <span className="text-amber-500">★</span>
                        {profile.stats.stars.toFixed(1)}
                      </span>
                    }
                    color="text-amber-700"
                  />
                  <div className="border-x border-gray-100">
                    <Stat
                      label="Completed"
                      value={profile.stats.completed}
                      color="text-emerald-700"
                    />
                  </div>
                  <Stat
                    label="Strength"
                    value={
                      profile.stats.score == null ? "-" : `${profile.stats.score}`
                    }
                    color="text-violet-700"
                  />
                </div>
              </div>

              {/* TRADES OFFERED */}
              {profile.trades.length > 0 && (
                <section className="px-5 mt-7">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-2">
                    Trades offered
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.trades.slice(0, 5).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12px] font-semibold px-2.5 py-1"
                      >
                        {t}
                      </span>
                    ))}
                    {profile.trades.length > 5 && (
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12px] font-semibold px-2.5 py-1">
                        +{profile.trades.length - 5} more
                      </span>
                    )}
                  </div>
                </section>
              )}

              {/* SERVICE AREAS */}
              {profile.serviceAreas.length > 0 && (
                <section className="px-5 mt-6">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-2">
                    Service areas
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.serviceAreas.slice(0, 6).map((a) => (
                      <span
                        key={a}
                        className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[12px] font-semibold px-2.5 py-1"
                      >
                        {a}
                      </span>
                    ))}
                    {profile.serviceAreas.length > 6 && (
                      <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[12px] font-semibold px-2.5 py-1">
                        +{profile.serviceAreas.length - 6} more
                      </span>
                    )}
                  </div>
                </section>
              )}

              {/* RECENT WORK */}
              {profile.gallery.length > 0 && (
                <section className="px-5 mt-6">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-2">
                    Recent work
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {profile.gallery.slice(0, 6).map((src, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="aspect-square w-full rounded-xl object-cover"
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* CONTACT */}
              {(profile.phone || profile.email || profile.website) && (
                <section className="px-5 mt-6 mb-10">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-2">
                    Contact
                  </div>
                  <div className="rounded-2xl bg-white border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                    {profile.phone && (
                      <ContactRow
                        label="Phone"
                        value={profile.phone}
                        href={`tel:${profile.phone}`}
                      />
                    )}
                    {profile.email && (
                      <ContactRow
                        label="Email"
                        value={profile.email}
                        href={`mailto:${profile.email}`}
                      />
                    )}
                    {profile.website && (
                      <ContactRow
                        label="Website"
                        value={prettyDomain(profile.website)}
                        href={
                          profile.website.startsWith("http")
                            ? profile.website
                            : `https://${profile.website}`
                        }
                      />
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

/* ---------- subcomponents ---------- */

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
}) {
  return (
    <div>
      <div className={`text-[16px] font-black ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500 font-bold mt-0.5">{label}</div>
    </div>
  );
}

function ContactRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
    >
      <span className="text-[12px] font-extrabold uppercase tracking-wide text-gray-500 w-20 shrink-0">
        {label}
      </span>
      <span className="flex-1 text-[14px] font-semibold text-emerald-700 truncate">
        {value}
      </span>
    </a>
  );
}

/* ---------- helpers ---------- */

function mapProfile(p: any): Profile {
  const gallery: string[] = Array.isArray(p.photo_urls) ? p.photo_urls.filter(Boolean) : [];
  return {
    companyName: p.company_name || null,
    contactName: p.contact_name || null,
    profilePictureUrl: p.profile_picture_url || null,
    gallery,
    outward: p.location_outward || null,
    serviceAreas: parseServiceAreas(p.service_areas || p.serviceAreas),
    trades: parseTrades(p.trade_types || p.tradeTypes),
    phone: p.phone || null,
    email: p.email || null,
    website: p.web_url || p.website || null,
    verified: String(p.ch_status || "").trim().toLowerCase() === "verified",
    stats: {
      stars: Number(p.stars ?? p.rating ?? p.avg_rating ?? 0) || 0,
      completed: Number(p.completed_projects ?? p.completed ?? p.jobs_completed ?? 0) || 0,
      reviews: Number(p.reviews_count ?? p.likes_count ?? p.recommendations_count ?? 0) || 0,
      score: typeof p.vmb_score === "number" ? p.vmb_score : (p.score ?? null),
    },
  };
}

function parseTrades(raw?: string | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseServiceAreas(raw: any): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "T";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function prettyDomain(url: string) {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
