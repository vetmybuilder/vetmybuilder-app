// web/components/filters/ProjectTypeChecklist.tsx
//
// Left-sidebar filter for /projects. One checkbox per PROJECT_TYPES
// category (e.g. "Insulation"). Checking a category selects every leaf
// type beneath it, so a job whose `type` is "External Wall Insulation"
// shows when "Insulation" is checked.
import * as React from "react";
import { Search, X } from "lucide-react";
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

  const hasFilters = selectedTypes.length > 0;

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
        <p
          className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-700"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Filter
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={() => onChangeTypes([])}
            className="text-[11.5px] font-semibold text-slate-500 hover:text-slate-900 underline"
            data-testid="projects-filter-reset"
          >
            Reset
          </button>
        )}
      </div>

      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500 mb-2">
          Type
        </p>

        <div className="relative mb-2">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search types"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-7 py-1.5 text-[12.5px] text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
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

        <div className="space-y-1.5 max-h-[65vh] overflow-y-auto pr-1 -mr-1">
          {visibleCategories.map((cat) => {
            const checked = isCategoryChecked(cat.category);
            return (
              <label
                key={cat.category}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCategory(cat.category, cat.types)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  data-testid={`projects-filter-category-${cat.category}`}
                />
                <span className="text-[13px] text-indigo-600 group-hover:text-indigo-800 flex-1 leading-snug">
                  {cat.category}
                </span>
              </label>
            );
          })}
          {visibleCategories.length === 0 && (
            <p className="text-[12px] text-slate-400 italic py-2">
              No types match "{query}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
