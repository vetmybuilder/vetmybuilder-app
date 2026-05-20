// web/components/tradesmen/TradesmanProfileMobile.tsx
//
// Mobile redesign of /tradesman/[id]. V1 hero portrait + sequential
// sections: header (avatar, name, badges), stats pill row, shared
// photos (when in project context), trades offered (icon chips),
// portfolio grid, Google reviews (3 snippet cards linking to the
// place URL), profile details, external review links, discounts +
// warranty, service areas. Sticky ♥ + Show interest CTA.
//
// All data is passed in from the parent page so this component is
// presentational; the only fetch it owns is /api/tradesmen/:id/google-reviews
// for the snippet write-ups.

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  ShieldCheck,
  Star,
  Flag,
} from "lucide-react";

import { useApi } from "@/utils/api";
import { tradeIconFor } from "@/utils/tradeIcons";
import { initials, prettyDomain } from "@/utils/tradesmanProfile";
import { platformLabelFor } from "@/utils/reviewLinks";
import PhotoLightbox from "@/components/PhotoLightbox";
import ReportModal from "@/components/ReportModal";

export type TradesmanDetail = {
  builderId: string;
  companyName: string | null;
  displayName: string | null;
  badges?: { companiesHouseVerified?: boolean; insuranceValid?: boolean };
  avatarUrl?: string | null;
  gallery?: string[];
  stats?: { completed: number; photos: number; reviews: number; stars: number };
  score?: number | null;
  location?: { outward?: string | null };
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  companyNumber?: string | null;
  tier?: string | null;
  serviceAreas?: string[] | null;
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

type SharedImage = { id: number | string; thumbUrl: string; fullUrl: string; alt?: string };

type GoogleReview = {
  author: string;
  initials?: string;
  rating: number;
  relativeTime?: string;
  text: string;
};

type Props = {
  item: TradesmanDetail;
  trades: string[];
  planLabel?: string | null;
  memberSince?: string | null;
  /** Project-scoped trust score (preferred over item.score when present). */
  projectScore?: number | null;
  /** Photos shared with the current project (if any). */
  sharedImages?: SharedImage[];
  isFavourite: boolean;
  favBusy: boolean;
  onToggleFavourite: () => void;
};

export default function TradesmanProfileMobile({
  item,
  trades,
  planLabel,
  memberSince,
  projectScore,
  sharedImages,
  isFavourite,
  favBusy,
  onToggleFavourite,
}: Props) {
  const api = useApi();
  const router = useRouter();
  const title = item.companyName || item.displayName || "Tradesman";

  const [reportOpen, setReportOpen] = useState(false);

  // Google review snippets — only loaded once per profile view.
  const [reviews, setReviews] = useState<GoogleReview[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get<{ reviews?: GoogleReview[] }>(
          `/api/tradesmen/${encodeURIComponent(item.builderId)}/google-reviews`,
        );
        if (alive)
          setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
      } catch {
        if (alive) setReviews([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, item.builderId]);

  // Lightbox: shared photos and the portfolio gallery each get their own
  // index space. Stash both arrays so we can pass either to the lightbox.
  const galleryUrls: string[] = (item.gallery || []).filter(Boolean);
  const sharedUrls: string[] = (sharedImages || [])
    .map((s) => s.fullUrl || s.thumbUrl)
    .filter(Boolean);
  const [lightbox, setLightbox] = useState<{
    photos: string[];
    index: number;
  } | null>(null);

  const placeUrl =
    item.googlePlaceId
      ? `https://search.google.com/local/reviews?placeid=${encodeURIComponent(
          item.googlePlaceId,
        )}`
      : null;

  const ratingDisplay =
    typeof item.googleRating === "number" && item.googleRating > 0
      ? item.googleRating.toFixed(1)
      : typeof item.stats?.stars === "number" && item.stats.stars > 0
      ? item.stats.stars.toFixed(1)
      : null;

  const reviewsCount =
    typeof item.googleReviewsCount === "number" && item.googleReviewsCount > 0
      ? item.googleReviewsCount
      : null;

  const trustScore =
    typeof projectScore === "number" && projectScore > 0
      ? Math.round(projectScore)
      : typeof item.score === "number" && item.score > 0
      ? Math.round(item.score)
      : null;

  return (
    <main
      className="fixed inset-0 bg-gray-50 overflow-y-auto"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="tradesman-profile-mobile"
    >
      {/* Hero cover with floating top nav + overlapping avatar */}
      <header className="relative">
        <div
          className="relative w-full bg-gray-200"
          style={{ aspectRatio: "16 / 10" }}
        >
          {galleryUrls[0] ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${galleryUrls[0]})` }}
              aria-hidden="true"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #4338ca 100%)",
              }}
              aria-hidden="true"
            />
          )}
          {/* Bottom dark gradient so the floating buttons stay legible */}
          <div
            className="absolute left-0 right-0 bottom-0 h-1/2 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.35), rgba(0,0,0,0))",
            }}
          />
          {/* Safe-area top spacer */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-0"
            style={{ height: "env(safe-area-inset-top)" }}
          />
          {/* Floating back chevron */}
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="absolute left-3.5 w-10 h-10 rounded-full flex items-center justify-center text-gray-900 shadow-lg"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 10px)",
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(8px)",
            }}
            data-testid="tradesman-mobile-back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          {/* Floating favourite heart */}
          <button
            type="button"
            aria-label={
              isFavourite ? "Remove from favourites" : "Save to favourites"
            }
            aria-pressed={isFavourite}
            onClick={onToggleFavourite}
            disabled={favBusy}
            className="absolute right-3.5 w-10 h-10 rounded-full flex items-center justify-center shadow-lg disabled:opacity-60"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 10px)",
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(8px)",
              color: isFavourite ? "#e11d48" : "#374151",
            }}
            data-testid="tradesman-mobile-favourite"
          >
            <Heart
              className={`w-[18px] h-[18px] ${isFavourite ? "fill-rose-500" : ""}`}
            />
          </button>
        </div>
      </header>

      {/* Identity block (avatar overlaps the cover above) */}
      <div className="px-5 pb-4 text-center">
        <div className="-mt-12 w-[96px] h-[96px] mx-auto mb-3 rounded-full overflow-hidden bg-gray-200 ring-[4px] ring-gray-50 shadow-md relative z-10">
          {item.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.avatarUrl}
              alt=""
              className="w-full h-full object-cover"
              data-testid="tradesman-avatar-photo"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white font-extrabold text-[22px]"
              style={{ background: "linear-gradient(135deg, #6ee7b7, #10b981)" }}
              data-testid="tradesman-avatar-initials"
            >
              {initials(title)}
            </div>
          )}
        </div>
        <h1
          className="text-[22px] font-extrabold tracking-tight text-gray-900 leading-tight"
          data-testid="tradesman-name"
        >
          {title}
        </h1>
        <div className="mt-1 text-[12.5px] text-gray-500">
          {[trades.slice(0, 3).join(", "), memberSince]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5 justify-center">
          {item.badges?.companiesHouseVerified && (
            <Pill tone="emerald">
              <ShieldCheck className="w-3 h-3" /> Verified
            </Pill>
          )}
          {item.badges?.insuranceValid && (
            <Pill tone="sky">
              <ShieldCheck className="w-3 h-3" /> Insured
            </Pill>
          )}
          {planLabel && <Pill tone="amber">{planLabel}</Pill>}
        </div>
      </div>

      {/* Stats pill row */}
      <section className="px-5">
        <div className="rounded-2xl bg-white border border-gray-200 p-3 flex flex-wrap gap-1.5">
          {ratingDisplay && (
            <StatChip
              tone="google"
              icon={<Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
              text={`${ratingDisplay}${reviewsCount ? ` · ${reviewsCount}` : ""} Google`}
              href={placeUrl ?? undefined}
            />
          )}
          {typeof item.stats?.reviews === "number" && (
            <StatChip
              icon={<span className="text-rose-400">♥</span>}
              text={`${item.stats.reviews} Likes`}
            />
          )}
          {typeof item.stats?.completed === "number" && (
            <StatChip
              icon={<span className="text-emerald-500">✓</span>}
              text={`${item.stats.completed} Completed`}
            />
          )}
          {(item.stats?.photos ?? galleryUrls.length) > 0 && (
            <StatChip
              icon={<span className="text-sky-400">📷</span>}
              text={`${item.stats?.photos ?? galleryUrls.length} Photos`}
            />
          )}
          {trustScore !== null && (
            <StatChip
              tone="trust"
              icon={<Star className="w-3 h-3 fill-rose-400 text-rose-400" />}
              text={`${trustScore} Trust`}
            />
          )}
        </div>

      </section>

      {/* Shared photos (only when accessed via a project) */}
      {sharedUrls.length > 0 && (
        <>
          <SectionHeader>Shared photos</SectionHeader>
          <section className="px-5">
            <div
              className="rounded-2xl border p-3.5"
              style={{ background: "#ecfdf5", borderColor: "#a7f3d0" }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-[12.5px] font-extrabold text-emerald-900">
                    Shared with this project
                  </div>
                  <div className="text-[10.5px] text-emerald-700/90 mt-0.5">
                    Photos sent with their interest.
                  </div>
                </div>
                <span className="text-[10.5px] font-bold text-emerald-700">
                  {sharedUrls.length} photo{sharedUrls.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {sharedUrls.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Open shared photo ${i + 1}`}
                    onClick={() =>
                      setLightbox({ photos: sharedUrls, index: i })
                    }
                    className="aspect-square rounded-xl bg-cover bg-center bg-gray-100"
                    style={{ backgroundImage: `url(${src})` }}
                  />
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Trades offered */}
      {trades.length > 0 && (
        <>
          <SectionHeader>Trades offered</SectionHeader>
          <section className="px-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-3.5">
              <div className="flex flex-wrap gap-1.5">
                {trades.map((t) => {
                  const Icon = tradeIconFor(t);
                  return (
                    <span
                      key={t}
                      data-testid="tradesman-trade-item"
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-[12px] font-bold text-gray-700"
                    >
                      <Icon className="w-3.5 h-3.5 text-rose-400" />
                      {t}
                    </span>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Builder portfolio */}
      {galleryUrls.length > 0 && (
        <>
          <SectionHeader>Builder portfolio · {galleryUrls.length}</SectionHeader>
          <section className="px-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-2">
              <div className="grid grid-cols-3 gap-1.5">
                {galleryUrls.slice(0, 9).map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Open portfolio photo ${i + 1}`}
                    onClick={() =>
                      setLightbox({ photos: galleryUrls, index: i })
                    }
                    className="aspect-square rounded-lg bg-cover bg-center bg-gray-100"
                    style={{ backgroundImage: `url(${src})` }}
                  />
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Google reviews (3 snippet cards) */}
      {reviews.length > 0 && (
        <>
          <SectionHeader>
            Google reviews
            {ratingDisplay ? ` · ${ratingDisplay}${reviewsCount ? ` · ${reviewsCount}` : ""}` : ""}
          </SectionHeader>
          <section className="px-5 space-y-2">
            {reviews.slice(0, 3).map((r, i) => (
              <ReviewCard key={i} review={r} href={placeUrl ?? undefined} />
            ))}
            {placeUrl && reviewsCount && (
              <a
                href={placeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[12.5px] font-extrabold text-rose-500 mt-1"
              >
                View all {reviewsCount} on Google →
              </a>
            )}
          </section>
        </>
      )}

      {/* Profile details */}
      <>
        <SectionHeader>Profile details</SectionHeader>
        <section className="px-5" data-testid="tradesman-contact-card">
          <dl className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
            <DetailRow label="Phone">
              {item.phone ? (
                <a
                  href={`tel:${item.phone}`}
                  data-testid="tradesman-phone"
                  className="text-rose-500 font-bold break-all"
                >
                  {item.phone}
                </a>
              ) : (
                <span
                  data-testid="tradesman-phone"
                  className="text-slate-400 font-normal"
                >
                  Available after a mutual match
                </span>
              )}
            </DetailRow>
            <DetailRow label="Email">
              {item.email ? (
                <a
                  href={`mailto:${item.email}`}
                  data-testid="tradesman-email"
                  className="text-rose-500 font-bold break-all"
                >
                  {item.email}
                </a>
              ) : (
                <span
                  data-testid="tradesman-email"
                  className="text-slate-400 font-normal"
                >
                  Available after a mutual match
                </span>
              )}
            </DetailRow>
            {item.website && (
              <DetailRow label="Website">
                <a
                  href={
                    item.website.startsWith("http")
                      ? item.website
                      : `https://${item.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="tradesman-website"
                  className="text-rose-500 font-bold break-all"
                >
                  {prettyDomain(item.website)}
                </a>
              </DetailRow>
            )}
            {item.companyNumber && (
              <DetailRow label="Company no">
                <span className="font-extrabold text-gray-900">
                  {item.companyNumber}
                </span>
              </DetailRow>
            )}
          </dl>
        </section>
      </>

      {/* External review links */}
      {Array.isArray(item.reviewLinks) && item.reviewLinks.length > 0 && (
        <>
          <SectionHeader>External reviews</SectionHeader>
          <section className="px-5" data-testid="tradesman-review-links-section">
            <ul className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
              {item.reviewLinks.map((entry) => (
                <li
                  key={`${entry.platform}-${entry.url}`}
                  data-testid={`tradesman-review-link-${entry.platform}`}
                  className="px-3.5 py-3"
                >
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex items-center justify-between text-[13px] font-extrabold text-rose-500"
                  >
                    <span>View on {platformLabelFor(entry)}</span>
                    <ChevronRight className="w-4 h-4" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* Discounts & warranty */}
      {(item.offersDiscount || (item.warrantyMonths ?? 0) > 0) && (
        <>
          <SectionHeader>Discounts &amp; warranty</SectionHeader>
          <section className="px-5" data-testid="tradesman-extras">
            <div className="rounded-2xl border border-gray-200 bg-white p-3.5 flex flex-wrap items-center gap-2">
              {item.offersDiscount && (
                <Pill tone="emerald">Offers discounts</Pill>
              )}
              {item.warrantyMonths ? (
                <span
                  className="text-[12.5px] text-gray-600"
                  data-testid="tradesman-warranty"
                >
                  Warranty: {item.warrantyMonths} months
                </span>
              ) : null}
            </div>
          </section>
        </>
      )}

      {/* Service areas */}
      {Array.isArray(item.serviceAreas) && item.serviceAreas.length > 0 && (
        <>
          <SectionHeader>Service areas</SectionHeader>
          <section className="px-5" data-testid="tradesman-areas">
            <div className="rounded-2xl border border-gray-200 bg-white p-3.5">
              <div className="flex flex-wrap gap-1.5">
                {item.serviceAreas.map((a) => (
                  <span
                    key={a}
                    data-testid={`tradesman-service-area-${a}`}
                    className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-[12px] font-bold text-gray-700"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      <div className="px-5 pt-2 pb-4">
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          data-testid="btn-report-profile"
          className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-rose-500 transition-colors py-2"
        >
          <Flag className="w-3.5 h-3.5" />
          Report this profile
        </button>
      </div>

      <div className="h-24" />

      {lightbox && (
        <PhotoLightbox
          open
          photos={lightbox.photos}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {reportOpen && (
        <ReportModal
          targetType="profile"
          targetId={item.builderId}
          onClose={() => setReportOpen(false)}
        />
      )}
    </main>
  );
}

/* ----- Subcomponents ----- */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 mt-5 mb-2 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500">
      {children}
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "emerald" | "sky" | "amber";
  children: React.ReactNode;
}) {
  const map: Record<typeof tone, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-800",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function StatChip({
  tone,
  icon,
  text,
  href,
}: {
  tone?: "google" | "trust";
  icon: React.ReactNode;
  text: string;
  href?: string;
}) {
  const toneClass =
    tone === "google"
      ? "bg-white border-amber-200"
      : tone === "trust"
      ? "bg-white border-rose-200"
      : "bg-gray-50 border-gray-200";
  const inner = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border-[1.5px] text-[11px] font-bold text-gray-800 ${toneClass}`}
    >
      <span className="text-[12px] leading-none">{icon}</span>
      <span>{text}</span>
    </span>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return inner;
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <dt className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-[13px] text-right truncate max-w-[60%]">{children}</dd>
    </div>
  );
}

function ReviewCard({
  review,
  href,
}: {
  review: GoogleReview;
  href?: string;
}) {
  const stars = "★".repeat(Math.round(review.rating)) +
    "☆".repeat(Math.max(0, 5 - Math.round(review.rating)));
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {children}
      </a>
    ) : (
      <div>{children}</div>
    );

  return (
    <Wrapper>
      <div className="rounded-2xl border border-gray-200 bg-white p-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10.5px] font-extrabold"
            style={{ background: "linear-gradient(135deg, #c7d2fe, #6366f1)" }}
          >
            {review.initials || review.author.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-[12.5px] font-extrabold text-gray-900">
            {review.author}
          </span>
          {review.relativeTime && (
            <span className="ml-auto text-[10.5px] font-semibold text-gray-500">
              {review.relativeTime}
            </span>
          )}
        </div>
        <div className="mt-1 text-[11.5px] text-amber-500 tracking-[2px]">
          {stars}
        </div>
        <div className="mt-1 text-[12.5px] text-gray-700 leading-relaxed">
          {review.text}
        </div>
      </div>
    </Wrapper>
  );
}
