// web/components/TradePicker.tsx
// Reusable trade-type chip picker with search and bucket filters.
import { useMemo, useState } from "react";
import { Check, Wrench } from "lucide-react";
import { TRADE_TYPES, type TradeType } from "@/types/tradeTypes";

type Props = {
  selected: string[];
  onChange: (trades: string[]) => void;
};

const toggle = (arr: string[], item: string) => {
  const s = new Set(arr);
  s.has(item) ? s.delete(item) : s.add(item);
  return Array.from(s).sort((a, b) => a.localeCompare(b));
};

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

export default function TradePicker({ selected, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState("");

  const activeTypes = useMemo(
    () => TRADE_TYPES.filter((t) => t.active !== false),
    []
  );

  const buckets = useMemo(() => {
    const list = uniq(activeTypes.map((t) => t.buckets || "").filter(Boolean));
    const idx = list.indexOf("Insulation");
    if (idx > -1) {
      const [ins] = list.splice(idx, 1);
      list.unshift(ins);
    }
    return list;
  }, [activeTypes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (t: TradeType) => {
      if (bucket && (t.buckets || "") !== bucket) return false;
      if (!q) return true;
      if (t.label.toLowerCase().includes(q)) return true;
      return (t.synonyms || []).some((s) => s.toLowerCase().includes(q));
    };
    return activeTypes
      .filter(matches)
      .sort(
        (a, b) =>
          (b.popularity ?? 0) - (a.popularity ?? 0) ||
          a.label.localeCompare(b.label)
      );
  }, [activeTypes, bucket, query]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Wrench className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-bold text-zinc-800">Choose your trades</h2>
          {selected.length > 0 && (
            <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
              {selected.length}
            </span>
          )}
          {selected.length > 0 && (
            <button
              type="button"
              className="ml-auto text-xs text-zinc-400 hover:text-red-500 transition-colors"
              onClick={() => onChange([])}
              data-testid="btn-clear-trades"
            >
              Clear all
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-400 ml-6">
          Pick everything you genuinely offer — helps us match you to the right projects.
        </p>
      </div>

      <input
        type="search"
        className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm placeholder:text-zinc-400 focus:border-red-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-400/20 transition-colors"
        placeholder="Search trades… e.g., electrician, tiler, loft (synonyms supported)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="input-trades-search"
      />

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setBucket("")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            bucket === ""
              ? "bg-zinc-900 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
          data-testid="bucket-all"
        >
          All
        </button>
        {buckets.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBucket(b === bucket ? "" : b)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              bucket === b
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
            data-testid={`bucket-${b}`}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/50">
        <div className="max-h-72 overflow-y-auto p-4" data-testid="trades-list">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-400">No matches{query ? ` for "${query}"` : ""}.</p>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="selected-trades">
              {filtered.map((t) => {
                const label = t.label;
                const checked = selected.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onChange(toggle(selected, label))}
                    aria-pressed={checked}
                    aria-label={label}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                      checked
                        ? "bg-red-500 text-white shadow-sm shadow-red-500/30 scale-[1.02]"
                        : "bg-white text-zinc-600 border border-zinc-200 hover:border-red-300 hover:text-red-500"
                    }`}
                  >
                    {checked && <Check className="h-3.5 w-3.5 shrink-0" />}
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
