// web/components/StatusBadge.tsx
type Props = {
  value: string;
};

export default function StatusBadge({ value }: Props) {
  const v = String(value || "").toLowerCase();

  // Pill + dot color mappings (light theme, high contrast)
  const tone =
    v === "live"
      ? {
          pill: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
          dot: "bg-emerald-500",
          label: "Live",
        }
      : v === "pending" || v === "draft"
      ? {
          pill: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200",
          dot: "bg-amber-500",
          label: v === "draft" ? "Draft" : "Pending",
        }
      : v === "archived"
      ? {
          pill: "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200",
          dot: "bg-rose-500",
          label: "Archived",
        }
      : {
          pill: "bg-zinc-100 text-zinc-800 ring-1 ring-inset ring-zinc-200",
          dot: "bg-zinc-400",
          label: v || "Unknown",
        };

  return (
    <span
      role="status"
      aria-label={`Status: ${tone.label}`}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${tone.pill}`}
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${tone.dot}`}
      />
      <span className="capitalize">{tone.label}</span>
    </span>
  );
}
