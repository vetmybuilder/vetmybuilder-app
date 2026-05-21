// web/pages/tradesman/profile.tsx
// Mobile-first tradesman profile (the tradesperson's own view).
//
// Renders as a bare route - no SiteHeader, no notification bell, fills the
// screen. Layout: emerald gradient hero with overlay top-bar, floating
// stats card on the seam, then inline content sections (Trades, Service
// areas, Recent work) on a white backdrop.

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import { ChevronLeft, Pencil, ShieldCheck } from "lucide-react";
import PhotoLightbox from "@/components/PhotoLightbox";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import { getCoachingTips } from "@/utils/coachingTips";

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
  // The raw API row is kept alongside the mapped Profile so we can
  // compute coaching tips - mapProfile drops the fields the scorer
  // needs (ch_status, photo_count, warranty_months, etc.).
  const [rawProfile, setRawProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);

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
          // tradesman_pending (role-intent stamped, wizard not
          // completed) -> send to wizard instead of a cold error.
          const r = String(data?.role || "").toLowerCase();
          if (r === "tradesman" && !p) {
            if (!cancelled) router.replace("/tradesman/signup/complete");
            return;
          }
          if (!cancelled) setErr("No trade profile found.");
          return;
        }
        if (!cancelled) {
          setProfile(mapProfile(p));
          setRawProfile(p);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  // Same coaching tips as /tradesman/profile/edit. Shown on the
  // profile view too so the trader sees the same nudges without
  // having to click into edit mode.
  const tips = useMemo(() => {
    if (!rawProfile) return [];
    const socials = parseSocialLinks(rawProfile.social_links_json);
    return getCoachingTips({
      photoCount: Array.isArray(rawProfile.photo_urls)
        ? rawProfile.photo_urls.length
        : 0,
      chStatus: (rawProfile.ch_status as any) ?? null,
      warrantyMonths: rawProfile.warranty_months ?? null,
      trades: parseTrades(rawProfile.trade_types),
      serviceAreas: parseServiceAreas(rawProfile.service_areas),
      supportingDocCount: parseSupportingDocCount(
        rawProfile.supporting_docs_json,
      ),
      websiteUrl: rawProfile.web_url ?? null,
      webVerified: rawProfile.web_verified ?? null,
      socialLinks: socials,
      offersDiscount: !!rawProfile.offers_discount,
    });
  }, [rawProfile]);

  const heroLetter = profile
    ? initials(profile.companyName || profile.contactName || "T")
    : "T";

  return (
    <>
      <Head>
        <title>Profile - VetMyBuilder</title>
        {/* Mobile keeps the white full-bleed shell so the emerald hero
            reads as a native screen. Desktop swaps to the cream brand
            backdrop the rest of the app uses. */}
        <style>{`
          body { background: #ffffff !important; }
          @media (min-width: 768px) {
            body { background: #fef6e9 !important; }
          }
        `}</style>
      </Head>

      {/* MOBILE - existing full-bleed emerald hero + scrollable card stack */}
      <main
        className="md:hidden fixed inset-0 bg-white flex flex-col"
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

              {/* Coaching tips - mirrors /tradesman/profile/edit so
                  traders see profile gaps without having to enter
                  edit mode. Sits below the stats card so the hero +
                  stats layering isn't disturbed. */}
              {tips.length > 0 && (
                <div className="px-5 mt-5">
                  <CoachingTipsCallout tips={tips} />
                </div>
              )}

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
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          setLightbox({ photos: profile.gallery, index: i })
                        }
                        className="aspect-square w-full rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        aria-label="Open photo"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </button>
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

      {/* DESKTOP - cream backdrop, centred container, hero card on top
          and a 2-column body (trades / areas / contact on the left,
          photo gallery on the right). Same state as the mobile branch
          above. */}
      <div
        className="hidden md:block"
        data-testid="tradesman-profile-page-desktop"
      >
        <div className="bg-[#fef6e9] min-h-screen pb-16 relative overflow-hidden">
          <BrandWatermarkScatter />
          <div className="relative z-10 mx-auto max-w-4xl px-6 pt-6">
            {/* Crumb row - small gray-circle back chevron (matches the
                WizardTopBar pattern used on /tradesman/profile/edit
                etc) + emerald Edit button on the right. */}
            <div className="flex items-center justify-between mb-5">
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 shadow-sm px-4 py-2.5 text-[13.5px] font-bold text-gray-800 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => router.push("/tradesman/profile/edit")}
                data-testid="btn-edit-profile-desktop"
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-extrabold text-white shadow-md transition-all hover:scale-[1.01]"
                style={{
                  background:
                    "linear-gradient(135deg, #10b981, #047857)",
                  boxShadow: "0 8px 22px rgba(16,185,129,0.30)",
                }}
              >
                <Pencil className="w-4 h-4" />
                Edit profile
              </button>
            </div>

            {loading && (
              <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-10 text-center text-sm text-slate-500">
                Loading…
              </div>
            )}

            {err && !loading && (
              <div className="bg-white rounded-3xl border border-rose-100 shadow-sm p-10 text-center text-sm text-rose-600">
                {err}
              </div>
            )}

            {profile && !loading && (
              <>
                {/* HERO CARD - emerald gradient band hosting avatar +
                    identity, stats sit just below */}
                <div className="rounded-3xl overflow-hidden shadow-md border border-emerald-100">
                  <div
                    className="relative px-8 pt-10 pb-14 text-center"
                    style={{
                      background:
                        "linear-gradient(160deg,#047857 0%,#10b981 60%,#6ee7b7 100%)",
                    }}
                  >
                    {profile.profilePictureUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={profile.profilePictureUrl}
                        alt=""
                        className="mx-auto w-28 h-28 rounded-full object-cover shadow-xl border-4 border-white/50"
                      />
                    ) : (
                      <div className="mx-auto w-28 h-28 rounded-full bg-white/95 flex items-center justify-center text-[38px] font-black text-emerald-700 shadow-xl border-4 border-white/50">
                        {heroLetter}
                      </div>
                    )}
                    <h1
                      className="mt-5 text-[28px] font-black tracking-tight text-white leading-tight drop-shadow"
                      style={{ fontFamily: "'Sora', sans-serif" }}
                      data-testid="profile-name-desktop"
                    >
                      {profile.companyName ||
                        profile.contactName ||
                        "Your business"}
                    </h1>
                    {profile.outward && (
                      <div className="mt-1 text-[14px] text-white/90 drop-shadow">
                        {profile.outward}
                      </div>
                    )}
                    {profile.verified && (
                      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[12.5px] font-extrabold text-emerald-700 shadow-md">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verified
                      </div>
                    )}
                  </div>
                  {/* Stats row - sits on the bottom of the hero, white
                      panel with 3 columns. */}
                  <div className="bg-white px-6 py-5 grid grid-cols-3 text-center divide-x divide-slate-100">
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
                    <Stat
                      label="Completed"
                      value={profile.stats.completed}
                      color="text-emerald-700"
                    />
                    <Stat
                      label="Strength"
                      value={
                        profile.stats.score == null
                          ? "-"
                          : `${profile.stats.score}`
                      }
                      color="text-violet-700"
                    />
                  </div>
                </div>

                {/* Coaching tips - same callout shown on
                    /tradesman/profile/edit so the trader sees the
                    same nudges without needing to enter edit mode. */}
                {tips.length > 0 && (
                  <div className="mt-6">
                    <CoachingTipsCallout tips={tips} />
                  </div>
                )}

                {/* BODY GRID - left column: chips + contact. right
                    column: gallery. Stacks single-column under lg
                    when both columns would crush. */}
                <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
                  <div className="flex flex-col gap-6">
                    {profile.trades.length > 0 && (
                      <section className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-6">
                        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-3">
                          Trades offered
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.trades.map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12.5px] font-semibold px-3 py-1"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}

                    {profile.serviceAreas.length > 0 && (
                      <section className="bg-white rounded-3xl border border-amber-100 shadow-sm p-6">
                        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-3">
                          Service areas
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.serviceAreas.map((a) => (
                            <span
                              key={a}
                              className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px] font-semibold px-3 py-1"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}

                    {(profile.phone || profile.email || profile.website) && (
                      <section className="bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
                        <div className="px-6 pt-5 pb-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">
                          Contact
                        </div>
                        <div className="divide-y divide-slate-100">
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
                  </div>

                  {/* RECENT WORK - right column, lets the gallery
                      breathe at desktop widths. Falls back to a
                      friendly empty state when the trade hasn't
                      uploaded anything yet so the column doesn't
                      collapse. */}
                  <section className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-6">
                    {/* Header row carries the count so the section
                        scales honestly regardless of supply — 3 photos
                        vs 30+ both read the same. */}
                    <div className="flex items-baseline justify-between mb-3">
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">
                        Recent work
                      </div>
                      {profile.gallery.length > 0 && (
                        <div className="text-[12px] font-bold text-slate-500">
                          {profile.gallery.length} photo
                          {profile.gallery.length === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                    {profile.gallery.length > 0 ? (
                      (() => {
                        // 2-col grid. When the trade has more than 4
                        // photos we show the first 3 + a "+N more"
                        // overlay tile on slot 4 so the section is
                        // always exactly 2 rows. When they have 4 or
                        // fewer we just show them all directly (no
                        // empty/half row, no useless +0 tile).
                        const CAP = 4;
                        const showAll = profile.gallery.length <= CAP;
                        const visibleCount = showAll
                          ? profile.gallery.length
                          : CAP - 1;
                        const previewSrcs = profile.gallery.slice(
                          0,
                          visibleCount,
                        );
                        const overflow = showAll
                          ? 0
                          : profile.gallery.length - visibleCount;
                        const overflowSrc =
                          overflow > 0 ? profile.gallery[visibleCount] : null;
                        return (
                          <div className="grid grid-cols-2 gap-2">
                            {previewSrcs.map((src, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() =>
                                  setLightbox({
                                    photos: profile.gallery,
                                    index: i,
                                  })
                                }
                                className="relative aspect-square w-full rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-emerald-400 group"
                                aria-label="Open photo"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={src}
                                  alt=""
                                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                                  loading="lazy"
                                />
                              </button>
                            ))}
                            {overflow > 0 && overflowSrc && (
                              <button
                                type="button"
                                onClick={() =>
                                  setLightbox({
                                    photos: profile.gallery,
                                    index: visibleCount,
                                  })
                                }
                                className="relative aspect-square w-full rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-emerald-400 group"
                                aria-label={`Open photo gallery, ${overflow} more`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={overflowSrc}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                <span className="absolute inset-0 bg-slate-900/65 flex items-center justify-center text-white font-extrabold text-[20px] group-hover:bg-slate-900/75 transition-colors">
                                  +{overflow}
                                </span>
                              </button>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                        <div className="text-[14px] font-extrabold text-slate-900">
                          No photos yet
                        </div>
                        <p className="mt-1 text-[12.5px] text-slate-500 leading-relaxed max-w-[280px] mx-auto">
                          Add a few photos of your work to give homeowners
                          something to recognise you by.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <PhotoLightbox
        open={lightbox !== null}
        photos={lightbox?.photos || []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
      />
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

// Same JSON shape that /tradesman/profile/edit uses to feed
// getCoachingTips. Kept local so the profile view doesn't have to
// import the edit page's helpers.
function parseSocialLinks(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
  } catch {
    /* ignore */
  }
  return [];
}

function parseSupportingDocCount(raw: unknown): number {
  if (!raw) return 0;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

// Shared "Boost your profile" callout - mirrors the markup from
// /tradesman/profile/edit so the trader sees the same nudges in both
// places without having to click Edit to find out what's missing.
function CoachingTipsCallout({
  tips,
}: {
  tips: Array<{ key: string; message: string }>;
}) {
  if (!tips.length) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">
        Boost your profile - {tips.length} quick win
        {tips.length === 1 ? "" : "s"}
      </p>
      <ul className="mt-1.5 space-y-1">
        {tips.map((tip) => (
          <li
            key={tip.key}
            className="flex items-start gap-2 text-sm text-amber-800"
          >
            <span className="mt-0.5 text-amber-500">•</span>
            {tip.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
