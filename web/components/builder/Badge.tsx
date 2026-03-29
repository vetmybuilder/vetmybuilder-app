// web/components/builder/Badge.tsx

import type { ReactNode } from "react";

type BadgeColor = "green" | "red" | "indigo" | "orange";

type BadgeProps = {
  children: ReactNode;
  color?: BadgeColor;
};

const shades: Record<BadgeColor, string> = {
  green: "bg-green-500/15 text-green-700 ring-1 ring-green-200",
  red: "bg-rose-500/15 text-rose-700 ring-1 ring-rose-200",
  indigo: "bg-indigo-500/15 text-indigo-700 ring-1 ring-indigo-200",
  orange: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-200",
};

export default function Badge({ children, color = "indigo" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${shades[color]}`}
    >
      {children}
    </span>
  );
}
