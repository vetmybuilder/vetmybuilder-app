// web/components/vendor-register/Step2Trades.tsx
import { useMemo, useState } from "react";
import { TRADE_TYPES, type TradeType } from "@/types/tradeTypes";

type Props = {
  tradeTypes: string[];
  setTradeTypes: (v: string[]) => void;
  onWorkPhotos: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
  onNext: (e: React.FormEvent) => void;
  err?: string | null;
};

const toggle = (arr: string[], item: string) => {
  const s = new Set(arr);
  s.has(item) ? s.delete(item) : s.add(item);
  return Array.from(s).sort((a, b) => a.localeCompare(b));
};
const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

export default function Step2Trades({
  tradeTypes,
  setTradeTypes,
  onWorkPhotos,
  onBack,
  onNext,
  err,
}: Props) {
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<string>("");

  const activeTypes = useMemo(
    () => TRADE_TYPES.filter((t) => t.active !== false),
    []
  );

  // Buckets: promote “Insulation” first if present
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

  const clearOne = (label: string) =>
    setTradeTypes(tradeTypes.filter((t) => t !== label));
  const clearAll = () => setTradeTypes([]);

  return (
    <form className="card grid gap-6" onSubmit={onNext} data-testid="step-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium mb-1">Choose your trades</h2>
          <p className="text-sm text-slate-600">
            Pick everything you genuinely offer—this helps us match you to the
            right projects.
          </p>
        </div>
        {tradeTypes.length > 0 && (
          <button
            type="button"
            className="text-sm text-slate-600 hover:text-slate-900"
            onClick={clearAll}
            data-testid="btn-clear-trades"
            aria-label="Clear all selected trades"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <div className="grid gap-3">
        <input
          type="search"
          className="h-11 w-full rounded-2xl border border-slate-300 bg-white px-4 text-[15px] leading-6 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Search trades… e.g., electrician, tiler, loft (synonyms supported)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="input-trades-search"
          aria-label="Search trades"
        />

        {/* Buckets (wrap, neutral) */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBucket("")}
            className={`px-3 py-1.5 rounded-2xl text-sm ring-1 ${
              bucket === ""
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            }`}
            data-testid="bucket-all"
          >
            All
          </button>
          {buckets.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={`px-3 py-1.5 rounded-2xl text-sm ring-1 ${
                bucket === b
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
              }`}
              data-testid={`bucket-${b}`}
            >
              {b}
            </button>
          ))}
        </div>

        {/* Selected — minimal chips */}
        {tradeTypes.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="selected-trades"
          >
            {tradeTypes.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
              >
                {t}
                <button
                  type="button"
                  onClick={() => clearOne(t)}
                  className="rounded-full p-0.5 text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  aria-label={`Remove ${t}`}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Results list */}
      <div className="rounded-2xl border border-slate-200">
        <div className="max-h-80 overflow-auto p-3" data-testid="trades-list">
          {filtered.length === 0 ? (
            <p className="px-1 py-2 text-sm text-slate-500">
              No matches{query ? ` for “${query}”` : ""}.
            </p>
          ) : (
            <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
              {filtered.map((t) => {
                const label = t.label;
                const checked = tradeTypes.includes(label);
                return (
                  <li key={label}>
                    <label className="inline-flex select-none items-center gap-3 text-[15px] leading-6 text-slate-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={checked}
                        onChange={() =>
                          setTradeTypes(toggle(tradeTypes, label))
                        }
                        aria-checked={checked}
                        aria-label={label}
                      />
                      <span>{label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Work photos */}
      <div data-testid="work-photos">
        <label className="text-sm font-medium block mb-1">
          Pictures of your work
        </label>
        <p className="text-xs text-slate-500 mb-2">
          Adding recent photos helps you rank better and increases your chances
          of being hired.
        </p>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onWorkPhotos}
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700 file:hover:bg-indigo-100"
        />
      </div>

      {err && (
        <p className="text-sm text-red-600" role="alert">
          {err}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-2xl px-4 py-2 text-sm bg-white ring-1 ring-slate-200 hover:bg-slate-50"
          onClick={onBack}
          data-testid="btn-back"
        >
          Back
        </button>
        <button
          className="rounded-2xl px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800"
          data-testid="btn-continue"
        >
          Next
        </button>
      </div>
    </form>
  );
}
