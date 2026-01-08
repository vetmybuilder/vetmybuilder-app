import Link from "next/link";

type Props = {
  title: string;
  createdAt?: string;
  backHref: string;

  // Optional favourites CTA (shown when true)
  showAddToFavourites?: boolean;
  onAddToFavourites?: () => void;

  // Loading/disabled state for the CTA
  busy?: boolean;
};

export default function ProjectHeaderBar({
  title,
  createdAt,
  backHref,
  showAddToFavourites = false,
  onAddToFavourites,
  busy = false,
}: Props) {
  return (
    <div
      className="mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur px-6 py-5 shadow-sm"
      data-testid="project-header"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-labelledby="project-title">
          <h1
            id="project-title"
            className="text-2xl font-semibold tracking-tight"
            data-testid="project-title"
          >
            {title}
          </h1>
          {createdAt && (
            <p
              className="mt-1 text-sm text-slate-500"
              aria-live="polite"
              data-testid="project-created"
            >
              Created {new Date(createdAt).toLocaleString()}
            </p>
          )}
        </div>

        <div
          className="flex flex-wrap gap-2"
          aria-label="Project actions"
          data-testid="project-actions"
        >
          <Link
            href={backHref}
            aria-label="Back to my projects"
            title="Back to my projects"
            className="btn-back"
            data-testid="btn-back-to-projects"
          >
            <svg
              viewBox="0 0 24 24"
              className="icon-24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 19l-7-7 7-7" />
              <path d="M3 12h18" />
            </svg>
            <span className="sr-only">Back to my projects</span>
          </Link>

          {showAddToFavourites && (
            <button
              className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium ring-1 shadow-sm transition bg-amber-500 text-white ring-amber-400 hover:bg-amber-600 disabled:opacity-60"
              onClick={onAddToFavourites}
              disabled={busy}
              aria-busy={busy}
              data-testid="btn-add-to-favourites"
              aria-label="Add to favourites"
              title="Add to favourites"
            >
              Add to favourites
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
