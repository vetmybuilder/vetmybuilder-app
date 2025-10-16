import * as React from "react";

export type ProjectTabKey =
  | "mine"
  | "recommended"
  | "community"
  | "favourites"
  | "archived";

type Props = {
  value: ProjectTabKey;
  onChange: (v: ProjectTabKey) => void;
  className?: string;
};

const tabs: Array<{
  key: ProjectTabKey;
  label: string;
  // underline + active icon/text color
  color: string;
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  testId: string;
}> = [
  {
    key: "mine",
    label: "My Projects",
    color: "#22c55e", // green
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <path d="M3 10.5 12 4l9 6.5" strokeWidth="1.75" />
        <path d="M5 10v9h14v-9" strokeWidth="1.75" />
        <path d="M9 19v-5h6v5" strokeWidth="1.75" />
      </svg>
    ),
    testId: "tab-my-projects",
  },
  {
    key: "recommended",
    label: "My Recommendations",
    color: "#6366f1", // indigo
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <path d="m5 13 4 4L19 7" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
    testId: "tab-my-recommendations",
  },
  {
    key: "community",
    label: "Community Projects",
    color: "#d334c6ff", // emerald
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
        <path d="M3 12h18M12 3v18" strokeWidth="1.75" />
      </svg>
    ),
    testId: "tab-community-projects",
  },
  {
    key: "favourites",
    label: "Favourites",
    color: "#f59e0b", // amber (yellowish)
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
        <path d="M12 21s-6.5-4.2-8.7-7.1C1 11.2 2 7.5 5.5 6.8A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 6.5-1.2c3.5.7 4.5 4.4 2.2 7.1C18.4 16.8 12 21 12 21z" />
      </svg>
    ),
    testId: "tab-favourites",
  },
  {
    key: "archived",
    label: "Archived",
    color: "#ef4444", // red
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <rect x="3" y="5" width="18" height="4" rx="1.5" strokeWidth="1.75" />
        <path d="M6 9v10h12V9" strokeWidth="1.75" />
        <path d="M10 13h4" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
    testId: "tab-archived",
  },
];

export default function ProjectTabs({
  value,
  onChange,
  className = "",
}: Props) {
  return (
    <div
      className={`w-full flex items-center justify-center gap-6 sm:gap-8 mb-4 ${className}`}
      role="tablist"
      aria-label="Projects tabs"
      data-testid="projects-tabs"
    >
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            data-testid={t.testId}
            className={[
              // base container
              "relative select-none inline-flex items-center gap-3",
              "rounded-xl px-4 sm:px-5 py-2.5",
              "bg-white/70 hover:bg-white transition",
              "border border-transparent", // <- no colored borders
              "shadow-sm hover:shadow",
              "text-slate-600",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-300",
              active ? "text-slate-900" : "",
            ].join(" ")}
            style={
              active
                ? {
                    // tint icon/text when active
                    color: t.color,
                  }
                : undefined
            }
            title={t.label}
          >
            <t.Icon className="h-5 w-5" aria-hidden />
            <span className="font-medium whitespace-nowrap">{t.label}</span>

            {/* colored underline when active (no border around the tab) */}
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
