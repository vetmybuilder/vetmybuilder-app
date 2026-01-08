import * as React from "react";

type Props = {
  id: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  getSuggestions: (query: string) => string[]; // pure + fast
  quickPicks?: string[];
  onQuickPick?: (v: string) => void;
  ariaLabel?: string;
  className?: string;
  "data-testid"?: string;
};

export default function AutoCompleteInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  onEnter,
  getSuggestions,
  quickPicks = [],
  onQuickPick,
  ariaLabel,
  className = "input",
  "data-testid": dataTestId,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<number>(-1);
  const [query, setQuery] = React.useState<string>(value);

  const listId = `${id}-listbox`;
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => setQuery(value), [value]);

  const suggestions = React.useMemo(() => {
    const uniq = Array.from(new Set(getSuggestions(query || "")));
    return uniq.slice(0, 8);
  }, [query, getSuggestions]);

  const commit = (v: string) => {
    onChange(v);
    setQuery(v);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && suggestions[active]) {
        commit(suggestions[active]);
      } else {
        commit(query);
        onEnter?.();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  const highlight = (s: string, q: string) => {
    if (!q) return s;
    const i = s.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return s;
    return (
      <>
        {s.slice(0, i)}
        <mark className="bg-yellow-100">{s.slice(i, i + q.length)}</mark>
        {s.slice(i + q.length)}
      </>
    );
  };

  return (
    <div className="relative">
      {quickPicks.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {quickPicks.slice(0, 8).map((qp, i) => (
            <button
              key={qp}
              type="button"
              className="px-3 py-1 border rounded-full text-sm hover:bg-gray-50"
              onClick={() => {
                onQuickPick?.(qp);
                commit(qp);
              }}
              data-testid={`${dataTestId}-quickpick-${i}`}
              aria-label={`Quick pick ${qp}`}
            >
              {qp}
            </button>
          ))}
        </div>
      )}

      {label && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}

      <input
        id={id}
        ref={inputRef}
        className={className}
        placeholder={placeholder}
        aria-label={ariaLabel || label}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          active >= 0 ? `${id}-option-${active}` : undefined
        }
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        data-testid={dataTestId}
      />

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white shadow"
          data-testid={`${dataTestId}-suggestions`}
        >
          {suggestions.map((s, i) => (
            <li
              key={s + i}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === active ? "bg-gray-100" : "bg-white"
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(s)}
              data-testid={`${dataTestId}-option-${i}`}
            >
              {highlight(s, query)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
