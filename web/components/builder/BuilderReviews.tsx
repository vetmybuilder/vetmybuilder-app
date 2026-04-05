// web/components/builder/BuilderReviews.tsx

import { Review } from "@/types/builderTypes";

const AVATAR_PALETTE = ["bg-violet-500","bg-emerald-500","bg-sky-500","bg-amber-500","bg-pink-500","bg-teal-500","bg-orange-500","bg-indigo-500"];

function buildColorMap(reviews: Review[]): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  for (const rev of reviews) {
    if (!map.has(rev.name)) {
      map.set(rev.name, AVATAR_PALETTE[idx % AVATAR_PALETTE.length]);
      idx++;
    }
  }
  return map;
}

type Props = {
  reviews: Review[];
};

export default function BuilderReviews({ reviews }: Props) {
  if (!reviews || reviews.length === 0) return null;

  const colorMap = buildColorMap(reviews);

  return (
    <section
      className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 sm:p-7"
      data-testid="builder-reviews-card"
    >
      <h2 className="text-lg font-black text-zinc-900">Reviews from neighbours</h2>
      <p className="mt-1 text-sm text-zinc-500">
        What your neighbours said when they recommended this builder.
      </p>

      <div className="mt-5 space-y-3">
        {reviews.map((rev) => (
          <article key={rev.id} className="rounded-2xl bg-zinc-50 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full text-white grid place-items-center text-xs font-black flex-shrink-0 ${colorMap.get(rev.name)}`}>
                  {rev.name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                </div>
                <span className="text-sm font-black text-zinc-900">{rev.name}</span>
              </div>
              {rev.createdAt && (
                <time className="text-xs text-zinc-400">
                  {new Date(rev.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </time>
              )}
            </div>
            <p className="mt-2 text-sm text-zinc-500 whitespace-pre-wrap">{rev.comment}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
