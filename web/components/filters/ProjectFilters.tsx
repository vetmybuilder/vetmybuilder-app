import * as React from "react";

type Status = "pending" | "live" | "completed" | "archived";

export type ProjectFiltersValue = {
  type: string; // "" means all
  status: string; // "" means all
};

type Props = {
  /** Distinct type labels from the current list/page */
  typeOptions: string[];
  /** Distinct statuses from the current list/page (order already handled by caller if desired) */
  statusOptions: Status[];
  /** All items of the current list page (used to compute counts) */
  items: Array<{ type?: string | null; status?: Status | null }>;
  /** Current selection */
  value: ProjectFiltersValue;
  /** Called whenever either filter changes */
  onChange: (next: ProjectFiltersValue) => void;
  className?: string;
};

/* ---------- tiny popover primitives (no deps) ---------- */
function useClickAway(onAway: () => void) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onAway();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onAway]);
  return ref;
}

const Menu: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => {
  const [open, setOpen] = React.useState(false);
  const ref = useClickAway(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border bg-white text-slate-900 border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
      >
        <span className="font-semibold">{label}</span>
        <svg
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path d="M5.5 7.5l4.5 4.5 4.5-4.5" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 mt-2 min-w-[220px] rounded-xl border border-slate-200 bg-white shadow-lg p-2 z-20"
          role="menu"
        >
          {React.Children.map(children, (c) =>
            React.isValidElement(c)
              ? React.cloneElement(c as any, { close: () => setOpen(false) })
              : c
          )}
        </div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{
  active?: boolean;
  label: string;
  count?: number;
  onClick?: () => void;
  /* injected by Menu */
  close?: () => void;
}> = ({ active, label, count, onClick, close }) => (
  <button
    type="button"
    onClick={() => {
      onClick?.();
      close?.();
    }}
    className={[
      "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg",
      active ? "bg-red-500 text-white" : "hover:bg-zinc-50 text-zinc-900",
    ].join(" ")}
    role="menuitem"
  >
    <span className="text-[14px]">{label}</span>
    {typeof count === "number" && (
      <span className={active ? "text-white/80" : "text-zinc-400"}>
        {count}
      </span>
    )}
  </button>
);

/* ---------- counts from current items ---------- */
function useCounts(items: Props["items"]) {
  return React.useMemo(() => {
    const type = new Map<string, number>();
    const status = new Map<Status, number>();
    for (const it of items) {
      const t = (it.type || "").toString();
      if (t) type.set(t, (type.get(t) || 0) + 1);
      const s = it.status as Status | null | undefined;
      if (s) status.set(s, (status.get(s) || 0) + 1);
    }
    return {
      typeCounts: Object.fromEntries(type) as Record<string, number>,
      statusCounts: Object.fromEntries(status) as Record<Status, number>,
    };
  }, [items]);
}

/* ---------- pretty status ---------- */
const prettyStatus = (s: Status) => s.charAt(0).toUpperCase() + s.slice(1);

/* ===================================================== */
export default function ProjectFilters({
  typeOptions,
  statusOptions,
  items,
  value,
  onChange,
  className,
}: Props) {
  const { typeCounts, statusCounts } = useCounts(items);

  return (
    <div className={["mb-4", className].filter(Boolean).join(" ")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-zinc-400 text-[15px] shrink-0">Filter by</span>

        {/* Type */}
        <Menu label={value.type ? `Type: ${value.type}` : "Type"}>
          <MenuItem
            active={!value.type}
            label="All types"
            count={items.length || undefined}
            onClick={() => onChange({ ...value, type: "" })}
          />
          <div className="my-1 h-px bg-slate-100" />
          {typeOptions.map((t) => (
            <MenuItem
              key={t}
              active={value.type === t}
              label={t}
              count={typeCounts[t] ?? 0}
              onClick={() =>
                onChange({ ...value, type: value.type === t ? "" : t })
              }
            />
          ))}
        </Menu>

        {/* Status */}
        <Menu
          label={
            value.status
              ? `Status: ${prettyStatus(value.status as Status)}`
              : "Status"
          }
        >
          <MenuItem
            active={!value.status}
            label="All statuses"
            count={items.length || undefined}
            onClick={() => onChange({ ...value, status: "" })}
          />
          <div className="my-1 h-px bg-slate-100" />
          {statusOptions.map((s) => (
            <MenuItem
              key={s}
              active={value.status === s}
              label={prettyStatus(s)}
              count={statusCounts[s] ?? 0}
              onClick={() =>
                onChange({ ...value, status: value.status === s ? "" : s })
              }
            />
          ))}
        </Menu>

        {(value.type || value.status) && (
          <button
            onClick={() => onChange({ type: "", status: "" })}
            className="ml-1 text-[13px] text-slate-600 hover:text-slate-900 underline"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
