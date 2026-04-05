// web/components/StatPill.tsx
import * as React from "react";

type StatPillProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  testId?: string;
};

export default function StatPill({ icon, label, value, testId }: StatPillProps) {
  return (
    <div
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
    >
      <span className="flex items-center">{icon}</span>
      <span className="font-bold text-zinc-800">{value}</span>
      <span className="text-zinc-400">{label}</span>
    </div>
  );
}
