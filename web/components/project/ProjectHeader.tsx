import Link from "next/link";

type Props = {
  projectName: string;
  createdAtISO: string; // ISO string from the API
  backHref: string; // where the back button goes (e.g. "/projects" or `/projects?tab=community`)
  rightActions?: React.ReactNode; // optional buttons on the right (publish, favourite, etc)
  "data-testid"?: string;
};

/**
 * Presentational header for the project page.
 * Keeps layout/styling here; you control logic in the page and pass rightActions.
 */
export default function ProjectHeader({
  projectName,
  createdAtISO,
  backHref,
  rightActions,
  "data-testid": dataTestId = "project-header",
}: Props) {
  return (
    <div
      className="mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur px-6 py-5 shadow-sm"
      data-testid={dataTestId}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-labelledby="project-title">
          <h1
            id="project-title"
            className="text-2xl font-semibold tracking-tight"
            data-testid="project-title"
          >
            {projectName}
          </h1>
          <p
            className="mt-1 text-sm text-slate-500"
            aria-live="polite"
            data-testid="project-created"
          >
            Created {new Date(createdAtISO).toLocaleString()}
          </p>
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

          {rightActions}
        </div>
      </div>
    </div>
  );
}
