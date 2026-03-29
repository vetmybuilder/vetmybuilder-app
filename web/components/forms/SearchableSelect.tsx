import * as React from "react";
import { ChevronDown } from "lucide-react";

type SearchableSelectProps = {
  id: string;
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
  placeholder?: string;
  dataTestId?: string;

  // NEW: renders native <select> when set
  mode?: "search" | "select";
};

export default function SearchableSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
  dataTestId,
  mode = "search",
}: SearchableSelectProps) {
  // -------------------------
  // NATIVE SELECT MODE
  // -------------------------
  if (mode === "select") {
    return (
      <div className="flex flex-col gap-1 relative">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>

        <div className="relative">
          <select
            id={id}
            className="input w-full pr-10 appearance-none"
            value={value ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              onChange(next ? next : null);
            }}
            data-testid={dataTestId}
          >
            <option value="" disabled>
              {placeholder}
            </option>

            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          <span className="pointer-events-none absolute right-0 top-0 h-full px-3 flex items-center justify-center">
            <ChevronDown className="h-4 w-4 text-slate-600" />
          </span>
        </div>
      </div>
    );
  }

  // -------------------------
  // SEARCH DROPDOWN MODE (existing)
  // -------------------------
  const [query, setQuery] = React.useState<string>("");
  const [open, setOpen] = React.useState<boolean>(false);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return options;
    return options.filter((c) => c.toLowerCase().includes(q));
  }, [query, options]);

  function handleSelect(option: string) {
    onChange(option);
    setQuery(option);
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1 relative">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>

      <div className="relative">
        {/* Input */}
        <input
          id={id}
          className="input w-full pr-10"
          placeholder={placeholder}
          value={query || value || ""}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            if (!open) setOpen(true);
            if (!next) onChange(null);
          }}
          onClick={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
          data-testid={dataTestId}
        />

        {/* Clickable arrow button */}
        <button
          type="button"
          aria-label="Toggle dropdown"
          onMouseDown={(e) => {
            e.preventDefault(); // prevent input blur
            setOpen((prev) => !prev);
          }}
          className="absolute right-0 top-0 h-full px-3 flex items-center justify-center cursor-pointer"
        >
          <ChevronDown
            className={`h-4 w-4 text-slate-600 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Dropdown */}
        {open && filtered.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {filtered.map((option) => (
              <button
                key={option}
                type="button"
                className={`block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 ${
                  option === value ? "bg-slate-100 font-semibold" : ""
                }`}
                onMouseDown={() => handleSelect(option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
