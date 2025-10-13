// web/components/StatusBadge.tsx
type Size = "xs" | "sm" | "md";

type Props = {
  value: string;
  size?: Size; // control badge sizing
  className?: string; // optional extra classes
};

export default function StatusBadge({
  value,
  size = "md",
  className = "",
}: Props) {
  const v = String(value || "").toLowerCase();

  // Pill + dot color mappings (light theme, high contrast)
  const isLive = v === "live";
  const tone = isLive
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

  // Size styles
  const sizeCls =
    size === "xs"
      ? "text-[10px] px-2 py-0.5"
      : size === "sm"
      ? "text-xs px-2.5 py-0.5"
      : "text-sm px-3 py-1"; // md (default)

  const dotCls =
    size === "xs" ? "h-1.5 w-1.5" : size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";

  // Blink the dot only when live (uses Tailwind's built-in animate-pulse)
  const dotAnim = isLive ? "animate-pulse" : "";

  return (
    <span
      role="status"
      aria-label={`Status: ${tone.label}`}
      className={`inline-flex items-center gap-2 rounded-full font-medium ${sizeCls} ${tone.pill} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`${dotCls} rounded-full ${tone.dot} ${dotAnim}`}
      />
      <span className="capitalize">{tone.label}</span>
    </span>
  );
}
