import * as React from "react";
import { TRADE_TYPES } from "@/types/tradeTypes";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  disabled?: boolean;
  columns?: 2 | 3 | 4; // grid columns on large screens
  hideFilter?: boolean; // hide the search input
  variant?: "grid" | "grouped"; // simple grid vs grouped view
  showPopular?: boolean; // (grouped) show Popular group
  maxPopular?: number; // (grouped) max popular items
};

export default function TradesCheckbox({
  value,
  onChange,
  label = "",
  disabled,
  columns = 3,
  hideFilter = false,
  variant = "grid",
  showPopular = true,
  maxPopular = 12,
}: Props) {
  const [filter, setFilter] = React.useState("");

  // Base list: active trades, alphabetized A→Z (case-insensitive)
  const all = React.useMemo(
    () =>
      TRADE_TYPES.filter((t) => t.active !== false)
        .slice()
        .sort((a, b) =>
          a.label.localeCompare(b.label, "en", { sensitivity: "base" })
        ),
    []
  );

  // Search over label, synonyms, buckets
  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        (t.synonyms || []).some((s) => s.toLowerCase().includes(q)) ||
        (t.buckets || "").toLowerCase().includes(q)
    );
  }, [all, filter]);

  const toggle = (label: string) => {
    if (disabled) return;
    const has = value.includes(label);
    onChange(has ? value.filter((x) => x !== label) : [...value, label]);
  };

  const selectGroup = (labels: string[], checked: boolean) => {
    if (disabled) return;
    const set = new Set(value);
    for (const l of labels) {
      if (checked) set.add(l);
      else set.delete(l);
    }
    onChange(Array.from(set));
  };

  /* ---------- Grid variant (alphabetical + search) ---------- */
  if (variant === "grid") {
    const gridCols =
      columns === 4
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        : columns === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

    return (
      <div>
        <label className="block text-sm font-medium mb-1">{label}</label>

        {!hideFilter && (
          <input
            type="text"
            className="input mb-3 w-full"
            placeholder="Search trades…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={disabled}
            aria-label="Search trades"
          />
        )}

        <div className={`grid gap-2 ${gridCols}`}>
          {filtered.map((t) => (
            <label
              key={t.label}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                className="checkbox"
                checked={value.includes(t.label)}
                onChange={() => toggle(t.label)}
                disabled={disabled}
              />
              <span className="text-sm">{t.label}</span>
            </label>
          ))}
        </div>

        {value.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Selected: {value.join(", ")}
          </p>
        )}
      </div>
    );
  }

  /* ---------- Grouped variant (kept alphabetical as well) ---------- */
  const byBucket = new Map<string, string[]>();
  for (const t of filtered) {
    const key = t.buckets || "Other";
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key)!.push(t.label);
  }
  // sort labels within each bucket
  for (const [k, arr] of byBucket) {
    byBucket.set(
      k,
      arr
        .slice()
        .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
    );
  }

  let popular: string[] = [];
  if (showPopular) {
    popular = [...all]
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, maxPopular)
      .map((t) => t.label)
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })); // alpha within Popular
  }

  const Group = ({ title, labels }: { title: string; labels: string[] }) => {
    const checkedCount = labels.filter((l) => value.includes(l)).length;
    const allChecked = checkedCount === labels.length && labels.length > 0;
    const noneChecked = checkedCount === 0;

    return (
      <details
        className="rounded-lg border border-slate-200 bg-white mb-2"
        open
      >
        <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none">
          <div className="flex items-center gap-3">
            <strong className="text-sm">{title}</strong>
            <span className="text-xs text-slate-500">
              {labels.length} • {checkedCount} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs link"
              onClick={(e) => {
                e.preventDefault();
                selectGroup(labels, true);
              }}
              disabled={allChecked || disabled}
            >
              Select all
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              className="text-xs link"
              onClick={(e) => {
                e.preventDefault();
                selectGroup(labels, false);
              }}
              disabled={noneChecked || disabled}
            >
              Clear
            </button>
          </div>
        </summary>
        <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {labels.map((label) => (
            <label
              key={label}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                className="checkbox"
                checked={value.includes(label)}
                onChange={() => toggle(label)}
                disabled={disabled}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </details>
    );
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>

      {!hideFilter && (
        <input
          type="text"
          className="input mb-3 w-full"
          placeholder="Search trades…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          disabled={disabled}
          aria-label="Search trades"
        />
      )}

      {showPopular && popular.length > 0 && (
        <Group title="Popular" labels={popular} />
      )}

      {Array.from(byBucket.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "en", { sensitivity: "base" }))
        .map(([bucket, labels]) => (
          <Group key={bucket} title={bucket} labels={labels} />
        ))}

      {value.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Selected: {value.join(", ")}
        </p>
      )}
    </div>
  );
}
