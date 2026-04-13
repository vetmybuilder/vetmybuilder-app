// web/components/ProjectTabs.tsx
import * as React from "react";

export type ProjectTabKey =
  | "mine"
  | "recommended"
  | "completed"
  | "completedCommunity";

type Props = {
  value: ProjectTabKey;
  onChange: (v: ProjectTabKey) => void;
  className?: string;
  orientation?: "horizontal" | "vertical";
};

const tabs: Array<{
  key: ProjectTabKey;
  label: string;
  color: string; // accent for active underline
  testId: string;
}> = [
  {
    key: "mine",
    label: "My Jobs",
    color: "#2563eb",
    testId: "tab-my-projects",
  },
  {
    key: "completed",
    label: "My Completed Projects",
    color: "#0ea5e9",
    testId: "tab-my-completed-projects",
  },
  {
    key: "completedCommunity",
    label: "Completed Community Projects",
    color: "#10b981",
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

  const containerClasses = isVertical
    ? "flex flex-col gap-3"
    : "flex items-center justify-center gap-8";

  const handleTabClick = (next: ProjectTabKey) => {
    // Prevent re-firing onChange when clicking the already-active tab
    // (avoids double fetch / flicker in parent when tab state is derived from URL).
    if (next === value) return;
    onChange(next);
  };

  return (
    <div
      role="tablist"
      aria-label="Projects tabs"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      data-testid="projects-tabs"
      className={`${containerClasses} ${className}`}
    >
      {tabs.map((t) => {
        const active = value === t.key;

        const base =
          "group relative inline-flex items-center justify-center select-none " +
          "text-[11px] sm:text-xs font-semibold tracking-[0.18em] uppercase " +
          "transition-colors duration-150";

        const colorClasses = active
          ? "text-slate-900"
          : "text-slate-500 hover:text-slate-900";

        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={t.testId}
            onClick={() => handleTabClick(t.key)}
            className={`${base} ${colorClasses}`}
            title={t.label}
          >
            <span>{t.label.toUpperCase()}</span>

            {/* hover underline */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] rounded-full
                         opacity-0 group-hover:opacity-60 transition-opacity duration-150"
              style={{ backgroundColor: t.color }}
            />

            {/* active underline */}
            {active && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] rounded-full"
                style={{ backgroundColor: t.color }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
