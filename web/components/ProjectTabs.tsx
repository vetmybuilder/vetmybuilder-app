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
};

// NOTE: 'archived' is DELIBERATELY OMITTED in this visible list.
// The page can still handle ?tab=archived, but the pill won't be shown.
const tabs: Array<{
  key: Exclude<ProjectTabKey, "archived">;
  label: string;
  color: string; // underline + active icon/text color
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  testId: string;
}> = [
  // My Projects — toolbox
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

  // My Recommendations — people/collection
  {
    key: "recommended",
    label: "My Recommendations",
    color: "#6366f1", // indigo
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <circle cx="8" cy="9" r="2.5" strokeWidth="1.75" />
        <circle cx="16" cy="9" r="2.5" strokeWidth="1.75" />
        <path
          d="M4.5 15c.7-2 2.9-3.5 5.5-3.5S14.8 13 15.5 15"
          strokeWidth="1.75"
        />
        <circle cx="12" cy="6.5" r="1.8" strokeWidth="1.5" />
        <path d="M10.2 11c.4-1.4 1.7-2.3 3.3-2.3" strokeWidth="1.5" />
      </svg>
    ),
    testId: "tab-my-recommendations",
  },

  // My Completed Projects
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

  // Completed Community Projects
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
        <rect x="15.5" y="4" width="5" height="4" rx="0.75" strokeWidth="1.75" />
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

export default function ProjectTabs({ value, onChange, className = "" }: Props) {
  return (
    <div
      className={`w-full flex items-center justify-center gap-6 sm:gap-8 mb-4 ${className}`}
      role="tablist"
      aria-label="Projects tabs"
      data-testid="projects-tabs"
    >
      {tabs.map((t) => {
        const active = value === t.key; // If value === 'archived', no pill is highlighted (by design)
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            data-testid={t.testId}
            className={[
              "relative select-none inline-flex items-center gap-3",
              "rounded-xl px-4 sm:px-5 py-2.5",
              "bg-white/70 hover:bg-white transition",
              "border border-transparent",
              "shadow-sm hover:shadow",
              active ? "text-slate-900" : "text-slate-600",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-300",
            ].join(" ")}
            style={active ? { color: t.color } : undefined}
            title={t.label}
          >
            <t.Icon className="h-5 w-5" aria-hidden />
            <span className="font-medium whitespace-nowrap">{t.label}</span>
            {active && (
              <span
                aria-hidden
                className="absolute left-6 right-6 -bottom-1 h-1 rounded-full"
                style={{ backgroundColor: t.color }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
