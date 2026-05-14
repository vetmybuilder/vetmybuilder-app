// web/components/filters/ProjectTypeChecklist.tsx
//
// Left-sidebar filter for /projects. Rendered as a vertical pill list:
// each PROJECT_TYPES category is a full-width pill the homeowner can
// toggle. Selected pills fill indigo with a small check on the right;
// unselected pills stay white with a slate border. Multi-select.
// Checking a category selects every leaf type beneath it, so a job
// whose `type` is "External Wall Insulation" shows when "Insulation"
// is checked.
import * as React from "react";
import { Search, X, Check } from "lucide-react";
import { PROJECT_TYPES } from "@/types/projectTypes";

type Props = {
  /** Selected leaf types — empty means "all". A category is considered
   *  checked iff every leaf type beneath it is in this set. */
  selectedTypes: string[];
  onChangeTypes: (next: string[]) => void;
  className?: string;
};

export default function ProjectTypeChecklist({
  selectedTypes,
  onChangeTypes,
  className,
}: Props) {
  const selectedSet = React.useMemo(() => new Set(selectedTypes), [selectedTypes]);

  // A category is "checked" iff its category name is in the selection.
  // Toggling on adds the category name AND every leaf type below it,
  // so the page-level filter — which does `selectedSet.has(p.type)` —
  // matches both legacy rows (p.type === "Plumbing") and rows that
  // store a leaf (p.type === "Boiler Repair").
  const isCategoryChecked = (category: string) => selectedSet.has(category);

  const toggleCategory = (category: string, catTypes: string[]) => {
    if (isCategoryChecked(category)) {
      const remove = new Set([category, ...catTypes]);
      onChangeTypes(selectedTypes.filter((t) => !remove.has(t)));
    } else {
      const merged = new Set(selectedTypes);
      merged.add(category);
      for (const t of catTypes) merged.add(t);
      onChangeTypes(Array.from(merged));
    }
  };

  const selectedCount = React.useMemo(
    () =>
      PROJECT_TYPES.filter((c) => isCategoryChecked(c.category)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTypes],
  );
  const hasFilters = selectedCount > 0;

  const [query, setQuery] = React.useState("");
  const visibleCategories = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROJECT_TYPES;
    return PROJECT_TYPES.filter((cat) =>
      cat.category.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className={className} data-testid="projects-filter-checklist">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-extrabold text-slate-900">Type</h3>
        {hasFilters && (
          <button
            type="button"
            onClick={() => onChangeTypes([])}
            className="text-[12px] font-bold text-indigo-600 hover:text-indigo-700"
            data-testid="projects-filter-reset"
          >
            Clear ({selectedCount})
          </button>
        )}
      </div>

      {/* Active-filter chips. Each one shows what's currently selected
          and lets the homeowner remove a single category without
          touching the main pill list below. Mirrors the chip pattern
          on /projects/new so the two surfaces feel like one system. */}
      {hasFilters && (
        <div
          className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-slate-100"
          data-testid="projects-filter-active-chips"
        >
          {PROJECT_TYPES.filter((c) => isCategoryChecked(c.category)).map(
            (cat) => (
              <span
                key={cat.category}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 pl-2.5 pr-1 py-0.5 text-[11px] font-bold"
                data-testid={`projects-filter-chip-${cat.category}`}
              >
                <span className="truncate max-w-[160px]">{cat.category}</span>
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.category, cat.types)}
                  aria-label={`Remove ${cat.category} filter`}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ),
          )}
        </div>
      )}

      <div className="relative mb-3">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search types"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-indigo-400 focus:outline-none transition-colors"
          data-testid="projects-filter-search"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 max-h-[65vh] overflow-y-auto pr-1 -mr-1">
        {visibleCategories.map((cat) => {
          const isOn = isCategoryChecked(cat.category);
          return (
            <button
              key={cat.category}
              type="button"
              onClick={() => toggleCategory(cat.category, cat.types)}
              aria-pressed={isOn}
              data-testid={`projects-filter-category-${cat.category}`}
              className={`w-full inline-flex items-center justify-between gap-2 rounded-full px-4 py-2 text-[13px] font-bold transition-all border text-left ${
                isOn
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/25"
                  : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-700"
              }`}
            >
              <span className="truncate">{cat.category}</span>
              {isOn && (
                <span
                  aria-hidden
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/25 shrink-0"
                >
                  <Check className="w-2.5 h-2.5" />
                </span>
              )}
            </button>
          );
        })}
        {visibleCategories.length === 0 && (
          <p className="text-[12px] text-slate-400 italic py-2">
            No types match "{query}"
          </p>
        )}
      </div>
    </div>
  );
}
