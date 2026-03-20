// web/components/builder/BuilderReviews.tsx

import { Review } from "@/types/builderTypes";

type Props = {
  reviews: Review[];
};

export default function BuilderReviews({ reviews }: Props) {
  if (!reviews || reviews.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      data-testid="builder-reviews-card"
    >
      <h2 className="text-sm sm:text-base font-semibold text-slate-900">
        Reviews from neighbours
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        What your neighbours said when they recommended this builder.
      </p>

      <div className="mt-4 space-y-4">
        {reviews.map((rev) => (
          <article
            key={rev.id}
            className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 grid place-items-center text-xs font-semibold">
                  {rev.name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="text-sm font-medium text-slate-900">
                  {rev.name}
                </div>
              </div>

              {rev.createdAt && (
                <time className="text-xs text-slate-500">
                  {new Date(rev.createdAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </time>
              )}
            </div>

            <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
              {rev.comment}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
