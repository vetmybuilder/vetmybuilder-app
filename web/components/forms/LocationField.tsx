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

/* ---------- Helpers ---------- */
function outwardFromPostcode(pc: string): string | null {
  const v = (pc || "").toUpperCase().trim();
  const m = v.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
  return m ? m[1] : null;
}

function looksLikePostcodeFragment(s: string) {
  const v = s.trim().toUpperCase();
  return /^[A-Z]{1,2}\d{0,2}[A-Z]?$/.test(v) || /\d/.test(v);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type PlaceSuggestion = {
  kind: "place";
  label: string; // "Chingford, London"
  primary: string; // "Chingford"
  sublabel?: string; // "London"
  latitude?: number;
  longitude?: number;
};

type PcSuggestion = {
  kind: "postcode";
  label: string; // "E4 7ER"
  postcode: string;
  outward: string | null;
};

type Suggestion = PlaceSuggestion | PcSuggestion;

export default function LocationField({
  id = "location",
  label = "Location",
  placeholder = "Type a UK postcode (e.g. E4 7ER) or a place (e.g. Chingford) — autocomplete supported",
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
  const [sug, setSug] = React.useState<Suggestion[]>([]);
  const debounced = useDebounced(query, 180);
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => setQuery(value), [value]);

  // Close popover on outside click
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Fetch suggestions (postcodes OR places)
  React.useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setSug([]);
      setErr(null);
      return;
    }

    setLoading(true);
    setErr(null);

    const doPostcodes = looksLikePostcodeFragment(q);
    const qNorm = norm(q);

    const run = async () => {
      try {
        if (doPostcodes) {
          // Postcode autocomplete
          const resp = await fetch(
            `https://api.postcodes.io/postcodes/${encodeURIComponent(
              q.toUpperCase()
            )}/autocomplete`
          );
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          const results: string[] = Array.isArray(data?.result)
            ? data.result
            : [];
          const list: Suggestion[] = results.slice(0, 12).map((pc) => ({
            kind: "postcode",
            label: pc,
            postcode: pc,
            outward: outwardFromPostcode(pc),
          }));
          setSug(list);
          setOpen(list.length > 0);
        } else {
          // Places search — ONLY include rows whose text contains the query
          const resp = await fetch(
            `https://api.postcodes.io/places?query=${encodeURIComponent(
              q
            )}&limit=50`
          );
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          const rows: any[] = Array.isArray(data?.result) ? data.result : [];

          const uniq = new Set<string>();
          const list: PlaceSuggestion[] = [];

          const getStrings = (obj: any): string[] =>
            Object.values(obj)
              .filter((v) => typeof v === "string" && v.trim())
              .map((v: any) => String(v).trim());

          for (const p of rows) {
            const strings = getStrings(p);
            // Filter out places that don't contain the query anywhere (normalized)
            const hasMatch = strings.some((s) => norm(s).includes(qNorm));
            if (!hasMatch) continue;

            // Pick the best "primary" match
            const scored = strings
              .map((s) => {
                const sNorm = norm(s);
                const exact = sNorm === qNorm ? 3 : 0;
                const starts = sNorm.startsWith(qNorm) ? 2 : 0;
                const contains = sNorm.includes(qNorm) ? 1 : 0;
                return { s, score: exact + starts + contains };
              })
              .sort((a, b) => b.score - a.score);

            const primary =
              scored[0]?.s ||
              p.name1 ||
              p.name ||
              p.locality ||
              p.town ||
              p.city ||
              p.district ||
              "Selected place";

            const area =
              p.region ||
              p.county ||
              p.admin_district ||
              p.admin_county ||
              p.country ||
              "";

            const label =
              area && norm(area) !== norm(primary)
                ? `${primary}, ${area}`
                : primary;

            const lon =
              p?.longitude ?? p?.location?.coordinates?.[0] ?? p?.x ?? p?.X;
            const lat =
              p?.latitude ?? p?.location?.coordinates?.[1] ?? p?.y ?? p?.Y;

            if (!uniq.has(label)) {
              uniq.add(label);
              list.push({
                kind: "place",
                label,
                primary: String(primary),
                sublabel: area || undefined,
                latitude: typeof lat === "number" ? lat : undefined,
                longitude: typeof lon === "number" ? lon : undefined,
              });
            }
          }

          // Sort again by (exact > starts-with > contains), then alphabetically
          const ranked = list
            .map((s) => {
              const pNorm = norm(s.primary);
              const exact = pNorm === qNorm ? 3 : 0;
              const starts = pNorm.startsWith(qNorm) ? 2 : 0;
              const contains = pNorm.includes(qNorm) ? 1 : 0;
              return { s, score: exact + starts + contains };
            })
            .sort((a, b) =>
              b.score === a.score
                ? a.s.primary.localeCompare(b.s.primary)
                : b.score - a.score
            )
            .map((x) => x.s)
            .slice(0, 12);

          setSug(ranked);
          setOpen(ranked.length > 0);
        }
      } catch {
        setSug([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [debounced]);

  async function fetchMeta(postcodeRaw: string): Promise<PostcodeMeta> {
    const pc = postcodeRaw.trim().toUpperCase();
    const resp = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`
    );
    if (!resp.ok) throw new Error(`Lookup failed ${resp.status}`);
    const data = await resp.json();
    const rec = data?.result;
    if (!rec) throw new Error("No result");
    const outward =
      String(rec.outcode || rec.outward_code || "").toUpperCase() || null;
    const incode = String(rec.incode || rec.inward_code || "");
    const sector =
      outward && incode ? `${outward} ${incode.slice(0, 1)}` : null;

    return {
      postcode: rec.postcode || pc,
      outward,
      sector,
      latitude: typeof rec.latitude === "number" ? rec.latitude : null,
      longitude: typeof rec.longitude === "number" ? rec.longitude : null,
      admin_district: rec.admin_district ?? null,
      region: rec.region ?? null,
      country: rec.country ?? null,
    };
  }

  async function resolvePlaceToMeta(s: PlaceSuggestion) {
    const { latitude, longitude } = s;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      throw new Error("Could not resolve place coordinates");
    }
    const resp = await fetch(
      `https://api.postcodes.io/postcodes?lon=${longitude}&lat=${latitude}&limit=1`
    );
    if (!resp.ok)
      throw new Error(`Nearest postcode lookup failed ${resp.status}`);
    const data = await resp.json();
    const pc: string | undefined = data?.result?.[0]?.postcode;
    if (!pc) throw new Error("No nearby postcode found");
    return fetchMeta(pc);
  }

  async function commitSuggestion(s: Suggestion) {
    try {
      setErr(null);
      const meta =
        s.kind === "postcode"
          ? await fetchMeta(s.postcode)
          : await resolvePlaceToMeta(s);
      onChange(meta.postcode, meta);
      setQuery(meta.postcode);
      setOpen(false);
      setSug([]);
    } catch (e: any) {
      setErr(e?.message || "Failed to resolve location");
    }
  }

  async function commitRawOrPlace(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (UK_POSTCODE_RE.test(v)) {
      try {
        const meta = await fetchMeta(v);
        onChange(meta.postcode, meta);
        setQuery(meta.postcode);
        setOpen(false);
        setSug([]);
        setErr(null);
      } catch (e: any) {
        setErr(e?.message || "Postcode not found");
      }
      return;
    }
    // Try place resolve
    try {
      const resp = await fetch(
        `https://api.postcodes.io/places?query=${encodeURIComponent(v)}&limit=1`
      );
      const data = await resp.json();
      const p = Array.isArray(data?.result) ? data.result[0] : null;
      if (!p) {
        setErr("No matching place or postcode");
        return;
      }
      const lon = p?.longitude ?? p?.location?.coordinates?.[0] ?? p?.x ?? p?.X;
      const lat = p?.latitude ?? p?.location?.coordinates?.[1] ?? p?.y ?? p?.Y;
      await commitSuggestion({
        kind: "place",
        label: v,
        primary: v,
        sublabel: p?.region || p?.county || p?.country || undefined,
        latitude: typeof lat === "number" ? lat : undefined,
        longitude: typeof lon === "number" ? lon : undefined,
      } as PlaceSuggestion);
    } catch {
      setErr("No matching place or postcode");
    }
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    onChange(v || "", null); // bubble raw value as they type
    setOpen(true);
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
              commitRawOrPlace(query);
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
          {sug.map((s, idx) => (
            <li
              key={`${s.kind}-${idx}-${"label" in s ? s.label : ""}`}
              role="option"
              tabIndex={0}
              className="px-3 py-2 cursor-pointer hover:bg-slate-50 focus:bg-slate-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitSuggestion(s)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSuggestion(s);
              }}
            >
              {s.kind === "place" ? (
                <div>
                  <div className="text-sm">{s.primary}</div>
                  {s.sublabel && (
                    <div className="text-[11px] text-slate-500">
                      {s.sublabel}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm">{s.label}</span>
                  {s.outward && (
                    <span className="ml-3 text-xs text-slate-500">
                      ({s.outward})
                    </span>
                  )}
                </div>
              )}
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
