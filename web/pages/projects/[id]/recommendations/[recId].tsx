// web/pages/projects/[id]/recommendations/[recId].tsx
//
// Profile page for an off-platform recommendation. Designed to match the
// existing tradesman profile (`TradesmanProfileMobile`) so the homeowner
// gets a consistent visual experience whether the builder is on-platform
// or not.
//
// When the recommender uploaded photos, the first one is used as the hero.
// Otherwise we fall back to a deterministic royalty-free hero image
// (5-image rotation keyed by rec id) — keeps the same rec stable across
// reloads.

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ChevronLeft, Heart, Sparkles, Star } from "lucide-react";

import { useApi } from "@/utils/api";
import AuthedOnly from "@/components/AuthedOnly";
import PhotoLightbox from "@/components/PhotoLightbox";
import { initials } from "@/utils/tradesmanProfile";
import { pickDefaultBuilderHero } from "@/utils/defaultBuilderImages";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  hasAnyRating,
  deterministicSummary,
  ratingAverage,
} from "@/utils/ratingSummary";
import type { CategoryRatings } from "@/types/builderTypes";

type Photo = { id: string; url: string; thumb?: string };

type RecPayload = {
  id: number;
  company: string;
  comment: string | null;
  createdAt: string;
  ratings: CategoryRatings | null;
  photos: Photo[];
  recommender: { name: string };
  linkedTradesmanUid: string | null;
  tradesman: {
    uid: string;
    photoUrl: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  contact: { phone: string | null; email: string | null };
};

function RecProfilePage() {
  const router = useRouter();
  const api = useApi();
  const recId = String(router.query.recId || "");

  const [rec, setRec] = useState<RecPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);

  useEffect(() => {
    if (!recId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/recommendations/${recId}`);
        if (alive) setRec(data?.recommendation || null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [recId]);

  async function handleUnfavourite() {
    if (!rec || removing) return;
    setRemoving(true);
    try {
      await api.post(`/api/recommendations/${rec.id}/unfavourite`);
      router.push("/projects?tab=favourites");
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return (
      <main className="fixed inset-0 bg-gray-50 flex items-center justify-center text-[12px] text-gray-500">
        Loading…
      </main>
    );
  }
  if (!rec) {
    return (
      <main className="fixed inset-0 bg-gray-50 flex items-center justify-center text-[12px] text-gray-500">
        Not found
      </main>
    );
  }

  const title = rec.company || "Recommendation";
  const photoUrls: string[] = rec.photos.map((p) => p.url).filter(Boolean);
  const heroPhoto = photoUrls[0] || pickDefaultBuilderHero(rec.id);
  const avatarPhoto = rec.tradesman?.photoUrl || photoUrls[0] || null;
  const phone = rec.contact?.phone || rec.tradesman?.phone || null;
  const email = rec.contact?.email || rec.tradesman?.email || null;
  const hasRatings = hasAnyRating(rec.ratings);
  const autoLine = !rec.comment && rec.ratings ? deterministicSummary(rec.ratings) : null;
  const displayText = rec.comment || autoLine;
  const avgRating = ratingAverage(rec.ratings);
  const photosCount = photoUrls.length;

  return (
    <main
      className="fixed inset-0 bg-gray-50 overflow-y-auto"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="rec-profile-mobile"
    >
      {/* Hero cover */}
      <header className="relative">
        <div className="relative w-full bg-gray-200" style={{ aspectRatio: "16 / 10" }}>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroPhoto})` }}
            aria-hidden="true"
          />
          <div
            className="absolute left-0 right-0 bottom-0 h-1/2 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.35), rgba(0,0,0,0))",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-0"
            style={{ height: "env(safe-area-inset-top)" }}
          />
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
            data-testid="rec-profile-back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Remove from favourites"
            onClick={handleUnfavourite}
            disabled={removing}
            className="absolute right-3.5 w-10 h-10 rounded-full flex items-center justify-center shadow-lg disabled:opacity-60"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 10px)",
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(8px)",
              color: "#e11d48",
            }}
            data-testid="rec-profile-unfavourite"
          >
            <Heart className="w-[18px] h-[18px] fill-rose-500" />
          </button>
        </div>
      </header>

      {/* Identity block (avatar overlaps the cover above) */}
      <div className="px-5 pb-4 text-center">
        <div className="-mt-12 w-[96px] h-[96px] mx-auto mb-3 rounded-full overflow-hidden bg-gray-200 ring-[4px] ring-gray-50 shadow-md relative z-10">
          {avatarPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPhoto} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white font-extrabold text-[22px]"
              style={{ background: "linear-gradient(135deg, #fdba74, #ea580c)" }}
            >
              {initials(title)}
            </div>
          )}
        </div>
        <h1
          className="text-[22px] font-extrabold tracking-tight text-gray-900 leading-tight"
          data-testid="rec-profile-name"
        >
          {title}
        </h1>
        <div className="mt-1 text-[12.5px] text-amber-700 font-bold">
          ⭐ Recommended by {rec.recommender.name}
        </div>
      </div>

      {/* Stats pill row */}
      {(typeof avgRating === "number" || photosCount > 0) && (
        <section className="px-5">
          <div className="rounded-2xl bg-white border border-gray-200 p-3 flex flex-wrap gap-1.5">
            {typeof avgRating === "number" && (
              <StatChip
                tone="rec"
                icon={<Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                text={`${avgRating.toFixed(1)} Recommended`}
              />
            )}
            {photosCount > 0 && (
              <StatChip
                icon={<span className="text-sky-400">📷</span>}
                text={`${photosCount} Photo${photosCount === 1 ? "" : "s"}`}
              />
            )}
          </div>
        </section>
      )}

      {/* Recommendation note + ratings */}
      {(displayText || hasRatings) && (
        <>
          <SectionHeader>Recommendation</SectionHeader>
          <section className="px-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-3.5">
              {displayText && (
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-[12.5px] text-gray-700 leading-relaxed italic">
                  &ldquo;{displayText}&rdquo;
                </div>
              )}
              {!rec.comment && autoLine && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-indigo-700">
                  <Sparkles className="h-2.5 w-2.5" />
                  Auto from ratings
                </div>
              )}
              {hasRatings && (
                <div className="mt-3 grid grid-cols-1 gap-1.5">
                  {CATEGORY_ORDER.map((key) => {
                    const v = rec.ratings?.[key];
                    if (typeof v !== "number") return null;
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between text-[12.5px] py-0.5"
                      >
                        <span className="font-semibold text-gray-600">
                          {CATEGORY_LABELS[key]}
                        </span>
                        <Stars value={v} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Photos */}
      {photoUrls.length > 0 && (
        <>
          <SectionHeader>Photos · {photoUrls.length}</SectionHeader>
          <section className="px-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-2">
              <div className="grid grid-cols-3 gap-1.5">
                {photoUrls.slice(0, 9).map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Open photo ${i + 1}`}
                    onClick={() => setLightbox({ photos: photoUrls, index: i })}
                    className="aspect-square rounded-lg bg-cover bg-center bg-gray-100"
                    style={{ backgroundImage: `url(${src})` }}
                  />
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Profile details (contact) */}
      {(phone || email) && (
        <>
          <SectionHeader>Profile details</SectionHeader>
          <section className="px-5">
            <dl className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
              {phone && (
                <DetailRow label="Phone">
                  <a
                    href={`tel:${phone}`}
                    className="text-rose-500 font-bold break-all"
                    data-testid="rec-profile-call"
                  >
                    {phone}
                  </a>
                </DetailRow>
              )}
              {email && (
                <DetailRow label="Email">
                  <a
                    href={`mailto:${email}`}
                    className="text-rose-500 font-bold break-all"
                    data-testid="rec-profile-email"
                  >
                    {email}
                  </a>
                </DetailRow>
              )}
            </dl>
          </section>
        </>
      )}

      <div className="h-24" />

      {lightbox && (
        <PhotoLightbox
          open
          photos={lightbox.photos}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </main>
  );
}

export default function RecProfileWrapper() {
  return (
    <AuthedOnly>
      <RecProfilePage />
    </AuthedOnly>
  );
}

/* ----- Subcomponents (mirrored from TradesmanProfileMobile for consistency) ----- */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 mt-5 mb-2 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500">
      {children}
    </div>
  );
}

function StatChip({
  tone,
  icon,
  text,
}: {
  tone?: "rec";
  icon: React.ReactNode;
  text: string;
}) {
  const toneClass =
    tone === "rec" ? "bg-white border-amber-200" : "bg-gray-50 border-gray-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border-[1.5px] text-[11px] font-bold text-gray-800 ${toneClass}`}
    >
      <span className="text-[12px] leading-none">{icon}</span>
      <span>{text}</span>
    </span>
  );
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

function Stars({ value }: { value: number }) {
  return (
    <span style={{ letterSpacing: "1px" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? "text-amber-500" : "text-gray-300"}>
          ★
        </span>
      ))}
    </span>
  );
}
