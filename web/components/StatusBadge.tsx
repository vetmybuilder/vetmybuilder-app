export default function StatusBadge({ value }: { value: string }) {
  const v = (value || "").toLowerCase();
  const map: Record<string, string> = {
    live: "bg-green-900/30 text-green-200 border-green-700/50",
    pending: "bg-orange-900/30 text-orange-200 border-orange-700/50",
    draft: "bg-orange-900/30 text-orange-200 border-orange-700/50",
    archived: "bg-red-900/30 text-red-200 border-red-700/50", // <-- red
  };
  const cls = map[v] || "bg-zinc-800 text-zinc-200 border-zinc-700";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize ${cls}`}
    >
      {v || "unknown"}
    </span>
  );
}
