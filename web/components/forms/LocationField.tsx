import * as React from "react";

/** UK postcode regex (loose, case-insensitive) */
const UK_POSTCODE_RE =
  /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2})$/i;

type PostcodeMeta = {
  postcode: string;
  outward?: string | null; // e.g. "E4"
  sector?: string | null; // e.g. "E4 7"
  latitude?: number | null;
  longitude?: number | null;
  admin_district?: string | null;
  region?: string | null;
  country?: string | null;
};

export type LocationFieldProps = {
  id?: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string, meta?: PostcodeMeta | null) => void;
  dataTestId?: string;
  className?: string;
  /** Optional helper text under the field explaining why you ask for a postcode */
  reasonText?: string;
};

function useDebounced<T>(value: T, delay = 200) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function LocationField({
  id = "location",
  label = "Location",
  placeholder = "Type a UK postcode (e.g. E4 7ER) — autocomplete supported",
  value,
  onChange,
  dataTestId,
  className = "",
  reasonText = "We use your postcode to match you with nearby tradespeople and improve local recommendations. We never share your full address.",
}: LocationFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(value);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [sug, setSug] = React.useState<string[]>([]);
  const debounced = useDebounced(query, 180);
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  // Close popover on outside click
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Fetch suggestions while typing
  React.useEffect(() => {
    const q = debounced.trim().toUpperCase();
    if (!q) {
      setSug([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);

    fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(q)}/autocomplete`
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const results: string[] = Array.isArray(j?.result) ? j.result : [];
        setSug(results.slice(0, 12));
        setOpen(results.length > 0);
      })
      .catch(() => {
        setSug([]);
      })
      .finally(() => setLoading(false));
  }, [debounced]);

  async function fetchMeta(postcodeRaw: string) {
    const pc = postcodeRaw.trim().toUpperCase();
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`
    );
    if (!res.ok) throw new Error(`Lookup failed ${res.status}`);
    const j = await res.json();
    const r = j?.result;
    if (!r) throw new Error("No result");
    const outward =
      String(r.outcode || r.outward_code || "").toUpperCase() || null;
    const incode = String(r.incode || r.inward_code || "");
    const sector =
      outward && incode ? `${outward} ${incode.slice(0, 1)}` : null;

    const meta: PostcodeMeta = {
      postcode: r.postcode || pc,
      outward,
      sector,
      latitude: typeof r.latitude === "number" ? r.latitude : null,
      longitude: typeof r.longitude === "number" ? r.longitude : null,
      admin_district: r.admin_district ?? null,
      region: r.region ?? null,
      country: r.country ?? null,
    };
    return meta;
  }

  async function commitSelection(pc: string) {
    try {
      setErr(null);
      const meta = await fetchMeta(pc);
      onChange(meta.postcode, meta);
      setQuery(meta.postcode);
      setOpen(false);
      setSug([]);
    } catch (e: any) {
      setErr(e?.message || "Failed to validate postcode");
    }
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    onChange(v || "", null);
    setOpen(true);
  }

  function onBlurValidate() {
    const raw = query.trim();
    if (!raw) return;
    if (!UK_POSTCODE_RE.test(raw)) {
      setErr("That doesn’t look like a UK postcode");
      return;
    }
    commitSelection(raw).catch(() => {
      setErr("Postcode not found");
    });
  }

  const hintId = `${id}-hint`;

  return (
    <div
      className={`relative ${className}`}
      ref={boxRef}
      data-testid={dataTestId}
    >
      <label htmlFor={id} className="text-xs text-slate-500 block mb-1">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          className="input pr-9"
          placeholder={placeholder}
          value={query}
          onChange={onInput}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onBlurValidate();
            }
          }}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-describedby={reasonText ? hintId : undefined}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
          {loading ? (
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M10 18l6-6-6-6v12z" />
            </svg>
          )}
        </div>
      </div>

      {open && sug.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-60 overflow-auto"
        >
          {sug.map((pc) => (
            <li
              key={pc}
              role="option"
              tabIndex={0}
              className="px-3 py-2 cursor-pointer hover:bg-slate-50 focus:bg-slate-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitSelection(pc)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSelection(pc);
              }}
            >
              {pc}
            </li>
          ))}
        </ul>
      )}

      {err && <p className="mt-1 text-xs text-amber-600">{err}</p>}

      {reasonText && (
        <p id={hintId} className="mt-1 text-[11px] text-slate-500">
          {reasonText}
        </p>
      )}
    </div>
  );
}
