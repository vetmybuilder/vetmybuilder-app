import { X } from "lucide-react";
import type { BuilderCardBuilder } from "./BuilderCard";

export interface InfoModalBuilder extends BuilderCardBuilder {
  bio?: string;
  trades: string[];
  serviceAreas: string[];
  recentPhotos: string[];
  reviews: { reviewerName: string; stars: number; quote: string }[];
  recommenders: string[];
}

export default function BuilderInfoModal({
  builder,
  onClose,
  onLike,
  onPass,
}: {
  builder: InfoModalBuilder;
  onClose: () => void;
  onLike: () => void;
  onPass: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <button onClick={onClose} aria-label="Close" className="p-2">
          <X />
        </button>
        <span className="text-sm font-bold text-gray-500">Profile</span>
        <span className="w-8" />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        <Section title={builder.displayName}>
          <div className="text-gray-600">{builder.companyName}</div>
        </Section>
        <Section title="Stats">
          <div className="flex flex-wrap gap-2">
            <Pill>★ {(builder.starRating ?? 0).toFixed(1)}</Pill>
            <Pill>{builder.reviewCount} reviews</Pill>
            <Pill>{builder.yearsTrading} yrs trading</Pill>
            {builder.chVerified && <Pill>CH ✓</Pill>}
          </div>
        </Section>
        <Section title="Why matched">
          <p className="text-sm text-gray-700">{builder.whyMatch}</p>
        </Section>
        {builder.bio && (
          <Section title="About">
            <p className="text-sm text-gray-700 whitespace-pre-line">{builder.bio}</p>
          </Section>
        )}
        <Section title="Services">
          <div className="flex flex-wrap gap-2">
            {builder.trades.map(t => <Pill key={t}>{t}</Pill>)}
          </div>
        </Section>
        <Section title="Service areas">
          <p className="text-sm text-gray-700">{builder.serviceAreas.join(", ")}</p>
        </Section>
        {builder.recentPhotos.length > 0 && (
          <Section title="Recent photos">
            <div className="grid grid-cols-3 gap-2">
              {builder.recentPhotos.slice(0, 6).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="aspect-square object-cover rounded" />
              ))}
            </div>
          </Section>
        )}
        {builder.reviews.length > 0 && (
          <Section title="Reviews">
            <div className="space-y-3">
              {builder.reviews.slice(0, 3).map((r, i) => (
                <div key={i} className="text-sm">
                  <div className="font-semibold">★ {r.stars} — {r.reviewerName}</div>
                  <div className="text-gray-700">"{r.quote}"</div>
                </div>
              ))}
            </div>
          </Section>
        )}
        {builder.recommenders.length > 0 && (
          <Section title="Recommended by">
            <p className="text-sm text-gray-700">{builder.recommenders.join(", ")}</p>
          </Section>
        )}
      </div>
      <div className="p-4 border-t flex gap-3">
        <button onClick={onPass} className="flex-1 py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-bold">Pass</button>
        <button onClick={onLike} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold">Like</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{title}</h3>
      {children}
    </section>
  );
}
function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex text-xs font-semibold text-gray-800 bg-gray-100 rounded-full px-3 py-1">{children}</span>;
}
