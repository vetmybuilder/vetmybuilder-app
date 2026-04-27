// web/pages/projects/[id]/recommendations/[recId].tsx
//
// Owner-only mobile profile page for a recommendation. Loaded when the
// homeowner taps (i) on a rec card in the swipe deck or favourites.
// Layout follows the existing tradesman-profile pattern: 16:10 hero,
// floating back/heart, 80px avatar overlapping, sectioned content.

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ChevronLeft, Heart, Phone, Mail, Sparkles } from "lucide-react";
import { useApi } from "@/utils/api";
import AuthedOnly from "@/components/AuthedOnly";
import PhotoLightbox from "@/components/PhotoLightbox";
import { CATEGORY_LABELS, CATEGORY_ORDER, hasAnyRating, deterministicSummary } from "@/utils/ratingSummary";
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
  tradesman: { uid: string; photoUrl: string | null; phone: string | null; email: string | null } | null;
  contact: { phone: string | null; email: string | null };
};

function CompactStars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{ fontSize: "9px", letterSpacing: "0.5px" }}
          className={i <= value ? "text-amber-500" : "text-gray-300"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function RecProfilePage() {
  const router = useRouter();
  const api = useApi();
  const projectId = String(router.query.id || "");
  const recId = String(router.query.recId || "");

  const [rec, setRec] = useState<RecPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);

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
    return () => { alive = false; };
  }, [recId]);

  async function handleUnfavourite() {
    if (!rec || removing) return;
    setRemoving(true);
    try {
      await api.post(`/api/recommendations/${rec.id}/unfavourite`);
      router.push(`/projects/${projectId}`);
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center bg-gray-50 text-[12px] text-gray-500">Loading…</main>;
  }
  if (!rec) {
    return <main className="min-h-screen flex items-center justify-center bg-gray-50 text-[12px] text-gray-500">Not found</main>;
  }

  const heroPhoto = rec.photos?.[0]?.url || rec.tradesman?.photoUrl || null;
  const initial = (rec.company?.[0] || "?").toUpperCase();
  const hasRatings = hasAnyRating(rec.ratings);
  const autoLine = !rec.comment && rec.ratings ? deterministicSummary(rec.ratings) : null;
  const displayText = rec.comment || autoLine;
  const phone = rec.contact?.phone || rec.tradesman?.phone || null;
  const email = rec.contact?.email || rec.tradesman?.email || null;
  const photoUrls = rec.photos.map((p) => p.url);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div
        className="relative aspect-[16/10] bg-cover bg-center"
        style={{
          backgroundImage: heroPhoto ? `url(${heroPhoto})` : undefined,
          background: heroPhoto ? undefined : "linear-gradient(135deg, #fdba74, #ea580c)",
        }}
      >
        {!heroPhoto && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-[72px] font-extrabold">
            {initial}
          </div>
        )}
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute top-3.5 left-3.5 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5 text-gray-900" />
        </button>
        <button
          type="button"
          onClick={handleUnfavourite}
          disabled={removing}
          className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm disabled:opacity-50"
          aria-label="Remove from favourites"
        >
          <Heart className="w-[18px] h-[18px] text-pink-500 fill-pink-500" />
        </button>
      </div>

      {/* Avatar overlap */}
      <div className="px-4">
        <div
          className="w-20 h-20 rounded-full border-4 border-white -mt-10 mb-2 flex items-center justify-center text-white text-[28px] font-extrabold"
          style={{
            background: rec.tradesman?.photoUrl
              ? `url(${rec.tradesman.photoUrl}) center/cover`
              : "linear-gradient(135deg, #fdba74, #ea580c)",
          }}
        >
          {!rec.tradesman?.photoUrl && initial}
        </div>
        <h1 className="text-[19px] font-extrabold text-gray-900 leading-tight">{rec.company}</h1>
        <p className="mt-1 text-[12px] font-bold text-amber-700">
          ⭐ Recommended by {rec.recommender.name}
        </p>
      </div>

      {/* Recommendation section */}
      {(displayText || hasRatings) && (
        <section className="px-4 mt-4 pt-4 border-t border-gray-100">
          <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-gray-500 mb-2">Recommendation</h2>
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
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CATEGORY_ORDER.map((key) => {
                const v = rec.ratings?.[key];
                if (typeof v !== "number") return null;
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-[10.5px] font-bold text-gray-700"
                  >
                    <span>{CATEGORY_LABELS[key]}</span>
                    <CompactStars value={v} />
                  </span>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Photos */}
      {rec.photos.length > 0 && (
        <section className="px-4 mt-4 pt-4 border-t border-gray-100">
          <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-gray-500 mb-2">
            Photos · {rec.photos.length}
          </h2>
          <div className="grid grid-cols-3 gap-1.5">
            {rec.photos.slice(0, 9).map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLightboxIdx(i)}
                className="aspect-square rounded-lg bg-gray-100 bg-cover bg-center"
                style={{ backgroundImage: `url(${p.url})` }}
                aria-label={`Open photo ${i + 1}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Contact */}
      {(phone || email) && (
        <section className="px-4 mt-4 pt-4 pb-8 border-t border-gray-100">
          <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-gray-500 mb-2">Contact</h2>
          <div className="flex gap-2">
            {phone && (
              <a
                href={`tel:${phone}`}
                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-[13px] font-extrabold flex items-center justify-center gap-2"
                data-testid="rec-profile-call"
              >
                <Phone className="w-4 h-4" />
                Call
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="flex-1 py-3 rounded-xl bg-white border-2 border-gray-200 text-gray-900 text-[13px] font-extrabold flex items-center justify-center gap-2"
                data-testid="rec-profile-email"
              >
                <Mail className="w-4 h-4" />
                Email
              </a>
            )}
          </div>
        </section>
      )}

      <PhotoLightbox
        open={lightboxIdx !== null}
        photos={photoUrls}
        initialIndex={lightboxIdx ?? 0}
        onClose={() => setLightboxIdx(null)}
      />
    </main>
  );
}

export default function RecProfileWrapper() {
  return <AuthedOnly><RecProfilePage /></AuthedOnly>;
}
