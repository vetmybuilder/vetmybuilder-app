// web/components/project/BuilderCardBack.tsx
//
// Back face of a swipe-deck card. Shown when the homeowner taps the (i)
// info button — the card flips on the Y axis to reveal full details
// without leaving the deck. No "View full profile" link any more — all
// the relevant tradesperson detail (photo gallery, about copy, trades,
// service areas, verified callout) is surfaced inline.
//
// Lazy-fetches /api/tradesmen/:publicId on mount when we have a uid so
// we get gallery + about copy. Falls back to whatever the card already
// has (matches API row) if the fetch fails or hasn't returned yet.

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { BuilderCardBuilder } from "./BuilderCard";
import { useApi } from "@/utils/api";
import PhotoLightbox from "@/components/PhotoLightbox";

export interface BuilderCardBackBuilder extends BuilderCardBuilder {
  primaryTrade?: string | null;
  secondaryTrades?: string[];
  serviceAreas?: string[];
}

type FullProfile = {
  publicId?: string | null;
  companyName?: string | null;
  displayName?: string | null;
  about?: string | null;
  gallery?: string[];
  serviceAreas?: string[];
  tradeTypes?: string | null;
  googlePlaceId?: string | null;
};

export default function BuilderCardBack({
  builder,
}: {
  builder: BuilderCardBackBuilder;
}) {
  const api = useApi();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);

  // Recommendation-card backs are local to the swipe deck — there's no
  // tradesperson to fetch, so we just show what the card already has.
  const isRecCard = !!builder.isRecommendation;

  useEffect(() => {
    if (isRecCard || !builder.uid) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get<{ item: FullProfile }>(
          `/api/tradesmen/${encodeURIComponent(builder.uid)}`,
        );
        if (alive) setProfile(data?.item || null);
      } catch {
        if (alive) setProfile(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, builder.uid, isRecCard]);

  const title =
    profile?.companyName ||
    profile?.displayName ||
    builder.companyName ||
    builder.displayName ||
    "Builder";
  const tradesFromProfile = parseTradeTypes(profile?.tradeTypes);
  const trades = (
    tradesFromProfile.length > 0
      ? tradesFromProfile
      : [builder.primaryTrade, ...(builder.secondaryTrades || [])]
  )
    .filter(Boolean)
    .map((t) => String(t));
  const areas = (profile?.serviceAreas?.length
    ? profile.serviceAreas
    : builder.serviceAreas || []
  ).filter(Boolean);
  const gallery = (profile?.gallery || []).filter(Boolean);
  // Rec cards: fall back to the recommender's cover photo if no
  // tradesperson gallery exists.
  const galleryToShow =
    gallery.length > 0
      ? gallery
      : isRecCard && builder.coverPhotoUrl
        ? [builder.coverPhotoUrl]
        : [];
  const about = profile?.about || null;

  const heroBg = isRecCard
    ? "linear-gradient(135deg, #fdba74, #ea580c)"
    : "linear-gradient(135deg, #6366f1, #4338ca)";
  const heroLabel = isRecCard ? "⭐ Recommendation" : "Profile";
  const whyText = isRecCard
    ? builder.recommenderName
      ? `By ${builder.recommenderName}`
      : null
    : builder.whyMatch || null;

  // Stat strip values — only render slots when we genuinely have a value.
  const starVal =
    typeof builder.starRating === "number" && builder.starRating > 0
      ? builder.starRating.toFixed(1)
      : null;
  const reviewsVal =
    typeof builder.reviewCount === "number" && builder.reviewCount > 0
      ? builder.reviewCount.toLocaleString()
      : null;
  const trustVal =
    typeof builder.baseScore === "number" && builder.baseScore > 0
      ? Math.round(builder.baseScore).toString()
      : null;
  // Rating + reviews deep-link to the company's Google reviews page when
  // we have a place id. The mock/dev DB rarely has one set, so fall back
  // to a non-link span. Open in a new tab so the homeowner doesn't lose
  // the swipe deck.
  const googlePlaceId = profile?.googlePlaceId || null;
  const googleHref = googlePlaceId
    ? `https://search.google.com/local/reviews?placeid=${encodeURIComponent(googlePlaceId)}`
    : null;
  const statSlots: Array<{ value: string; label: string; tone: "amber" | "default" | "rose"; href?: string | null }> = [];
  if (starVal) statSlots.push({ value: `★ ${starVal}`, label: "Rating", tone: "amber", href: googleHref });
  if (reviewsVal) statSlots.push({ value: reviewsVal, label: "Reviews", tone: "default", href: googleHref });
  if (trustVal) statSlots.push({ value: trustVal, label: "Trust", tone: "rose" });

  return (
    <>
    <div
      className="relative md:rounded-[22px] overflow-hidden bg-white flex flex-col h-full"
    >
      {/* Hero band */}
      <div className="px-4 py-4 text-white" style={{ background: heroBg }}>
        <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] opacity-90">
          {heroLabel}
        </div>
        <div className="mt-0.5 text-[18px] font-extrabold leading-tight">{title}</div>
        {whyText && (
          <span className="mt-2 inline-block bg-white/20 text-white px-2.5 py-1 rounded-full text-[10px] font-bold">
            {whyText}
          </span>
        )}
      </div>

      {/* Stat strip — only shown when we have at least one stat */}
      {statSlots.length > 0 && (
        <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: `repeat(${statSlots.length}, 1fr)` }}>
          {statSlots.map((s, i) => {
            const cellCls =
              "text-center py-3 px-2 " +
              (i < statSlots.length - 1 ? "border-r border-gray-100" : "") +
              (s.href ? " hover:bg-stone-50 transition-colors" : "");
            const inner = (
              <>
                <div
                  className={
                    "text-[18px] font-extrabold leading-none " +
                    (s.tone === "amber" ? "text-amber-500" : s.tone === "rose" ? "text-rose-500" : "text-gray-900")
                  }
                >
                  {s.value}
                </div>
                <div className="mt-1 text-[9.5px] font-bold uppercase tracking-wider text-gray-500 inline-flex items-center gap-1 justify-center">
                  {s.label}
                  {s.href && (
                    <span aria-hidden className="text-gray-400 text-[8px] leading-none">↗</span>
                  )}
                </div>
              </>
            );
            return s.href ? (
              <a
                key={i}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cellCls + " block"}
                onClick={(e) => e.stopPropagation()}
              >
                {inner}
              </a>
            ) : (
              <div key={i} className={cellCls}>
                {inner}
              </div>
            );
          })}
        </div>
      )}

      {/* Sections — pb-28 leaves a clear gutter for the floating action
          bar so the last chip / paragraph never sits under the buttons.
          (Same trick as the front face's gradient overlay.) */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-3">
        {builder.chVerified && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
            <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
            <span className="text-[12px] font-bold text-emerald-800">Verified</span>
          </div>
        )}

        {galleryToShow.length > 0 && (
          <Section colorDot="#6366f1" label="Photos">
            <div className="grid grid-cols-3 gap-1.5">
              {galleryToShow.slice(0, 6).map((url, i) => (
                <button
                  key={`${url}-${i}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightbox({ photos: galleryToShow, index: i });
                  }}
                  className="aspect-square rounded-lg overflow-hidden bg-slate-200/40 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  aria-label="Open photo"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </Section>
        )}

        {about && (
          <Section colorDot="#0ea5e9" label="About">
            <p className="text-[12.5px] text-slate-700 leading-relaxed whitespace-pre-line">
              {about}
            </p>
          </Section>
        )}

        {trades.length > 0 && (
          <Section colorDot="#4338ca" label="Trades">
            <div className="flex flex-wrap gap-1">
              {trades.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          </Section>
        )}

        {areas.length > 0 && (
          <Section colorDot="#10b981" label="Service areas">
            <div className="flex flex-wrap gap-1">
              {areas.slice(0, 12).map((a) => (
                <Chip key={a} tone="indigo">
                  📍 {a}
                </Chip>
              ))}
            </div>
          </Section>
        )}
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

/** tradesmen.trade_types is stored as a JSON array string in MySQL. Parse
 *  defensively — older rows may be plain comma-separated. */
function parseTradeTypes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = String(raw).trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* not JSON */
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function Section({
  colorDot,
  label,
  children,
}: {
  colorDot: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-1.5">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: colorDot }}
        />
        {label}
      </div>
      {children}
    </div>
  );
}

function Chip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "indigo";
}) {
  const cls =
    tone === "indigo"
      ? "bg-indigo-50 border-indigo-100 text-indigo-700"
      : "bg-gray-50 border-gray-200 text-gray-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cls}`}
    >
      {children}
    </span>
  );
}
