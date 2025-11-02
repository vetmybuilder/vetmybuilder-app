import * as React from "react";

type Opt = string | { label: string; value: string };

type Props = {
  id?: string;
  label?: string; // visible label (optional)
  value: string | null;
  onChange: (next: string) => void;
  options: Opt[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
  ariaLabel?: string; // if no visible label
};

function normalizeOptions(options: Opt[]) {
  return options.map((o) =>
    typeof o === "string" ? { label: o, value: o } : o
  );
}

export default function Select({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className = "",
  "data-testid": testId,
  ariaLabel,
}: Props) {
  const opts = React.useMemo(() => normalizeOptions(options), [options]);

  const selectedIndex = React.useMemo(
    () => opts.findIndex((o) => String(o.value) === String(value ?? "")),
    [opts, value]
  );

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);

  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(
    selectedIndex >= 0 ? selectedIndex : 0
  );

  React.useEffect(() => {
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
  }, [selectedIndex, open]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || listRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    }
    function onDocKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [open]);

  function commit(index: number) {
    const next = opts[index];
    if (!next) return;
    onChange(String(next.value));
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onButtonKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => {
        if (e.key === "ArrowDown") return Math.min(opts.length - 1, h + 1);
        if (e.key === "ArrowUp") return Math.max(0, h - 1);
        return h;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(opts.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlight(opts.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(highlight);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  const selectedLabel = selectedIndex >= 0 ? opts[selectedIndex].label : "";

  const btnId = id ? `${id}-button` : undefined;
  const listId = id ? `${id}-listbox` : undefined;

  return (
    <div className={className} data-testid={testId}>
      {label && (
        <label htmlFor={btnId} className="text-xs text-slate-500 block mb-1">
          {label}
        </label>
      )}

      <div className="relative">
        <button
          id={btnId}
          ref={buttonRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={!label ? ariaLabel || "Select" : undefined}
          onClick={() => !disabled && setOpen((v) => !v)}
          onKeyDown={onButtonKeyDown}
          className={`input w-full text-left flex items-center justify-between ${
            disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <span
            className={`truncate ${!selectedLabel ? "text-slate-400" : ""}`}
          >
            {selectedLabel || placeholder}
          </span>
          <svg
            className="ml-2 h-4 w-4 shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" />
          </svg>
        </button>

        {open && (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={btnId}
            onKeyDown={onListKeyDown}
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg focus:outline-none"
          >
            {opts.map((o, i) => {
              const isSelected = i === selectedIndex;
              const isActive = i === highlight;
              return (
                <li
                  key={`${o.value}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`px-3 py-2 text-sm cursor-pointer ${
                    isActive ? "bg-indigo-50" : ""
                  } ${isSelected ? "font-medium" : ""}`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    // prevent blur before click
                    e.preventDefault();
                  }}
                  onClick={() => commit(i)}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{o.label}</span>
                    {isSelected && (
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                </li>
              );
            })}
            {opts.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">No options</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
