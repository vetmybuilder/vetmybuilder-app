import * as React from "react";

export type ProjectTabKey =
  | "mine"
  | "archived" // keep in type so URLs & parent can use it
  | "recommended"
  | "completed" // My Completed Projects
  | "completedCommunity"; // Completed Community Projects

type Props = {
  value: ProjectTabKey;
  onChange: (v: ProjectTabKey) => void;
  className?: string;
  orientation?: "horizontal" | "vertical"; // NEW
};

// NOTE: 'archived' is DELIBERATELY OMITTED in this visible list.
// The page can still handle ?tab=archived, but the pill won't be shown.
const tabs: Array<{
  key: Exclude<ProjectTabKey, "archived">;
  label: string;
  color: string; // underline/indicator + active icon/text color
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  testId: string;
}> = [
  {
    key: "mine",
    label: "My Projects",
    color: "#22c55e", // green
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <path d="M9 7V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" strokeWidth="1.75" />
        <rect x="3.5" y="7" width="17" height="11" rx="2" strokeWidth="1.75" />
        <path d="M3.5 11.5h17" strokeWidth="1.75" />
        <path d="M11.25 11.5v2.5h1.5v-2.5" strokeWidth="1.75" />
      </svg>
    ),
    testId: "tab-my-projects",
  },
  {
    key: "completed",
    label: "My Completed Projects",
    color: "#0ea5e9", // sky
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <path
          d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z"
          strokeWidth="1.75"
        />
        <path
          d="M8.5 12.5l2.5 2.5 4.5-5"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
    testId: "tab-my-completed-projects",
  },
  {
    key: "completedCommunity",
    label: "Completed Community Projects",
    color: "#10b981", // emerald
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <circle cx="8" cy="10" r="2.5" strokeWidth="1.75" />
        <circle cx="16" cy="10" r="2.5" strokeWidth="1.75" />
        <path
          d="M4.5 17c.6-2 2.8-3.5 5.5-3.5S15 15 15.5 17"
          strokeWidth="1.75"
        />
        <rect
          x="15.5"
          y="4"
          width="5"
          height="4"
          rx="0.75"
          strokeWidth="1.75"
        />
        <path
          d="M16.5 6l1.2 1.2L20 5"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
    testId: "tab-completed-community-projects",
  },
];

export default function ProjectTabs({
  value,
  onChange,
  className = "",
  orientation = "horizontal",
}: Props) {
  const isVertical = orientation === "vertical";

  // base container
  const containerClasses = isVertical
    ? "w-full flex flex-col items-stretch gap-3"
    : "w-full flex items-center justify-center gap-6 sm:gap-8 mb-4";

  return (
    <div
      className={[containerClasses, className].join(" ")}
      role="tablist"
      aria-label="Projects tabs"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      data-testid="projects-tabs"
    >
      {tabs.map((t) => {
        const active = value === t.key;
        const commonBtn =
          "relative select-none inline-flex items-center gap-3 rounded-2xl px-5 py-3 bg-white/90 hover:bg-white transition border border-slate-200 shadow-sm hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-300";
        const horizActiveUnderline = active ? (
          <span
            aria-hidden
            className="absolute left-6 right-6 -bottom-1 h-1 rounded-full"
            style={{ backgroundColor: t.color }}
          />
        ) : null;

        const vertActiveIndicator = active ? (
          <span
            aria-hidden
            className="absolute left-2 top-2 bottom-2 w-1.5 rounded-full"
            style={{ backgroundColor: t.color }}
          />
        ) : null;

        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            data-testid={t.testId}
            className={[
              commonBtn,
              isVertical ? "w-full justify-start pl-7" : "",
              active ? "text-slate-900" : "text-slate-600",
            ].join(" ")}
            style={active ? { color: t.color } : undefined}
            title={t.label}
          >
            {isVertical ? vertActiveIndicator : horizActiveUnderline}
            <t.Icon className="h-5 w-5" aria-hidden />
            <span className="font-medium whitespace-nowrap">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
