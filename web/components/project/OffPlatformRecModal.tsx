// web/components/project/OffPlatformRecModal.tsx
//
// Modal preview for an off-platform recommendation. Surfaces the
// recommender's rating + comment, any photos they uploaded, and contact
// channels they supplied (WhatsApp / phone / SMS / email). Opens from
// the right-rail Recommendations card on /projects/[id]; lazy-fetches
// the rec detail from /api/recommendations/:id when it opens.
//
// Off-platform-only: on-platform recommendations are surfaced directly
// in the swipe deck instead.

import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";
import PhotoLightbox from "@/components/PhotoLightbox";

type RecPayload = {
  id: number;
  company: string;
  comment: string | null;
  rating: number | null;
  ratings: {
    quality: number | null;
    reliability: number | null;
    communication: number | null;
    trust: number | null;
    value: number | null;
  } | null;
  photos: Array<{ id: string | number; url: string }>;
  recommender: { name: string };
  contact: { phone: string | null; email: string | null };
  phone?: string | null;
  email?: string | null;
};

function StarRow({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`${value} out of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={i < value ? "text-amber-500" : "text-slate-200"}
          style={{ fontSize: 16, lineHeight: 1 }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

/** Strip everything except digits + leading + so wa.me / sms: / tel: links
 *  work with whatever format the recommender typed in. */
function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/[^\d]/g, "");
}

export default function OffPlatformRecModal({
  open,
  recId,
  onClose,
}: {
  open: boolean;
  recId: number | null;
  onClose: () => void;
}) {
  const api = useApi();
  const [rec, setRec] = useState<RecPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);

  useEffect(() => {
    if (!open || !recId) {
      setRec(null);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get<{ recommendation: RecPayload }>(
          `/api/recommendations/${recId}`,
        );
        if (alive) setRec(data?.recommendation || null);
      } catch {
        if (alive) setRec(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, recId, api]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const phoneRaw = rec?.contact?.phone || rec?.phone || null;
  const email = rec?.contact?.email || rec?.email || null;
  const phone = phoneRaw ? normalisePhone(phoneRaw) : null;
  const photoUrls = (rec?.photos || []).map((p) => p.url).filter(Boolean);
  const subRatings = rec?.ratings
    ? (
        ["quality", "reliability", "value", "communication"] as const
      ).filter((k) => rec.ratings![k] != null)
    : [];

  // Contact strip sits at the top of the body so the homeowner can act on
  // the recommendation without scrolling past the rating + photos. Only
  // renders the channels the recommender actually supplied (phone covers
  // WhatsApp/call/SMS; email is its own).
  const contactStrip = phone || email ? (
    <section>
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500 mb-2">
        Get in touch
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {phone && (
          <a
            href={`https://wa.me/${phone.replace(/^\+/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open WhatsApp"
            className="w-12 h-12 rounded-full text-white inline-flex items-center justify-center hover:brightness-110 transition"
            style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}
            title="WhatsApp"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982 1.0-3.648-.235-.374A9.86 9.86 0 0 1 2.15 11.892c.002-5.45 4.436-9.884 9.9-9.884 2.643 0 5.127 1.03 6.994 2.901a9.825 9.825 0 0 1 2.893 6.992c-.003 5.45-4.437 9.884-9.886 9.884zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.463 3.488z" />
            </svg>
          </a>
        )}
        {phone && (
          <a
            href={`tel:${phone}`}
            aria-label="Call"
            className="w-12 h-12 rounded-full text-white inline-flex items-center justify-center hover:brightness-110 transition"
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
            title="Call"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.86 19.86 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
            </svg>
          </a>
        )}
        {phone && (
          <a
            href={`sms:${phone}`}
            aria-label="Send SMS"
            className="w-12 h-12 rounded-full text-white inline-flex items-center justify-center hover:brightness-110 transition"
            style={{ background: "linear-gradient(135deg,#fbbf24,#d97706)" }}
            title="SMS"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            aria-label="Send email"
            className="w-12 h-12 rounded-full text-white inline-flex items-center justify-center hover:brightness-110 transition"
            style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)" }}
            title="Email"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <polyline points="3 7 12 13 21 7" />
            </svg>
          </a>
        )}
      </div>
    </section>
  ) : (
    <p className="text-[12px] text-slate-500 italic">
      {rec?.recommender?.name || "The recommender"} didn&rsquo;t
      share contact details for this tradesperson. You can reach
      out to them directly to ask.
    </p>
  );

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        role="dialog"
        aria-label="Recommendation details"
        onClick={onClose}
      >
        <div
          className="bg-white border border-amber-100 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {loading || !rec ? (
            <div className="p-12 text-center text-[13px] text-slate-500">
              Loading…
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-indigo-700 mb-1">
                    Recommendation
                  </div>
                  <h2
                    className="text-[19px] font-black text-slate-900 leading-tight"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    {rec.company}
                  </h2>
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] text-slate-500">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[10px] font-black">
                      {(rec.recommender?.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span>
                      Recommended by{" "}
                      <span className="font-extrabold text-slate-700">
                        {rec.recommender?.name || "Someone"}
                      </span>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="shrink-0 w-8 h-8 rounded-full bg-stone-100 text-slate-600 hover:bg-stone-200 inline-flex items-center justify-center"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5">
                {contactStrip}

                {/* Rating */}
                {(rec.rating || subRatings.length > 0) && (
                  <section>
                    <div className="flex items-center gap-3 mb-2">
                      {rec.rating ? (
                        <>
                          <StarRow value={rec.rating} />
                          <span className="text-[14px] font-extrabold text-slate-800">
                            {rec.rating} / 5
                          </span>
                        </>
                      ) : null}
                    </div>
                    {subRatings.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {subRatings.map((k) => (
                          <div
                            key={k}
                            className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2"
                          >
                            <span className="text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                              {k}
                            </span>
                            <span className="text-[13px] font-black text-slate-900">
                              {rec.ratings![k]}/5
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Comment */}
                {rec.comment && (
                  <blockquote className="bg-indigo-50/60 border-l-4 border-indigo-400 rounded-r-2xl px-4 py-3">
                    <p
                      className="text-[14px] text-slate-800 leading-relaxed"
                      style={{ fontFamily: "'Sora', sans-serif" }}
                    >
                      &ldquo;{rec.comment}&rdquo;
                    </p>
                  </blockquote>
                )}

                {/* Photos */}
                {photoUrls.length > 0 && (
                  <section>
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500 mb-2">
                      Photos
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {photoUrls.map((url, i) => (
                        <button
                          key={`${url}-${i}`}
                          type="button"
                          onClick={() => setLightbox({ photos: photoUrls, index: i })}
                          className="aspect-square rounded-xl overflow-hidden bg-slate-200/40 focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                  </section>
                )}

              </div>
            </>
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
