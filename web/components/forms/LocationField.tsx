import * as React from "react";
import PilotBlockSheet from "@/components/PilotBlockSheet";

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
  /** Present only when the user picked a borough row. When set, the caller
   * should treat this as a whole-borough selection and ignore the postcode
   * fields (which will be empty strings). */
  borough?: { name: string; outwardCodes: string[] };
};

export type LocationFieldProps = {
  id?: string;
  label?: string; // when falsy, no label is rendered
  placeholder?: string;
  value: string;
  onChange: (value: string, meta?: PostcodeMeta | null) => void;
  dataTestId?: string;
  className?: string;
  /** Optional helper text under the field explaining why you ask for a postcode */
  reasonText?: string;
  /** Called with the user-facing display label (e.g. "Chingford, London") */
  onDisplayChange?: (display: string) => void;
  /** Validation error message; sets aria-invalid on the input */
  error?: string;
  /**
   * When true, restrict autocomplete + selection to outward codes that
   * the admin has enabled in the pilot launch areas (/api/pilot/areas).
   * Selecting an unsupported postcode shows a "not in pilot" message and
   * does NOT commit the selection. Used by the new-job wizard so a user
   * typing SW10 sees a friendly message instead of a successful pick.
   */
  pilotOnly?: boolean;
  /**
   * Fires whenever the internal pilot-area error message changes. Lets
   * the parent wizard disable its Continue button when the field is
   * showing a "not in pilot" warning, so the user can't blow past the
   * gate and hit a 400 on submit.
   */
  onPilotErrChange?: (err: string | null) => void;
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
  placeholder = "Postcode or place (e.g. E4 7ER, Chingford)",
  value,
  onChange,
  dataTestId,
  className = "",
  reasonText = "We use your postcode to match you with nearby tradespeople and improve local recommendations. We never share your full address.",
  onDisplayChange,
  error,
  pilotOnly = false,
  onPilotErrChange,
}: LocationFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(value);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [sug, setSug] = React.useState<Suggestion[]>([]);
  const [boroughResults, setBoroughResults] = React.useState<
    Array<{ name: string; outwardCodes: string[] }>
  >([]);
  const debounced = useDebounced(query, 180);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const hasInteracted = React.useRef(false);
  // Track the display label chosen by the user (e.g. "Chingford, London")
  // so that external value syncs don't overwrite it with the outward code.
  const displayLabel = React.useRef<string | null>(null);

  // Pilot launch areas - only loaded when pilotOnly is true. Used to
  // validate a picked postcode against the enabled borough set via
  // postcodes.io's admin_district field (already on the meta we get back
  // from fetchMeta). enabledBoroughs stays null while loading so we
  // don't briefly block all picks on mount.
  const [enabledBoroughs, setEnabledBoroughs] = React.useState<Set<string> | null>(null);

  // Cache outward → admin_district lookups so the per-keystroke filter
  // doesn't re-hit postcodes.io for the same outward repeatedly.
  const outwardDistrictsCache = React.useRef<Map<string, string[]>>(new Map());
  const [pilotErr, setPilotErr] = React.useState<string | null>(null);

  // Bubble pilot-area validity to the parent wizard so it can disable
  // its Continue button. Wrapping setPilotErr would require touching ~10
  // call sites; an effect on the state value is cleaner.
  React.useEffect(() => {
    onPilotErrChange?.(pilotErr);
  }, [pilotErr, onPilotErrChange]);

  React.useEffect(() => {
    if (!pilotOnly) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/pilot/areas");
        if (!r.ok) return;
        const data = await r.json();
        if (!alive) return;
        const list = Array.isArray(data?.boroughs) ? data.boroughs : [];
        setEnabledBoroughs(new Set(list.map((b: { name: string }) => b.name)));
      } catch {
        // Non-fatal - we let picks through if the pilot lookup fails;
        // server-side validation is the gate.
      }
    })();
    return () => {
      alive = false;
    };
  }, [pilotOnly]);

  /** Resolve outward → admin_district list via postcodes.io, with cache. */
  async function fetchOutwardDistricts(outward: string): Promise<string[]> {
    const key = outward.toUpperCase();
    const cached = outwardDistrictsCache.current.get(key);
    if (cached) return cached;
    try {
      const r = await fetch(
        `https://api.postcodes.io/outcodes/${encodeURIComponent(key)}`,
      );
      if (!r.ok) return [];
      const data = await r.json();
      const districts = Array.isArray(data?.result?.admin_district)
        ? data.result.admin_district.filter(Boolean)
        : [];
      outwardDistrictsCache.current.set(key, districts);
      return districts;
    } catch {
      return [];
    }
  }

  /** Decide whether a district list intersects the enabled set. */
  function districtsInPilot(districts: string[]): boolean {
    if (!pilotOnly) return true;
    if (!enabledBoroughs) return true; // still loading - don't block
    return districts.some((d) => enabledBoroughs.has(d));
  }

  function pilotBlockMessage(): string {
    const names = enabledBoroughs ? Array.from(enabledBoroughs) : [];
    if (names.length === 0) {
      return "We're not yet accepting jobs in this area. Check back soon.";
    }
    if (names.length === 1) {
      return `We're piloting in ${names[0]}. We'll be opening up more areas soon.`;
    }
    const last = names[names.length - 1];
    const head = names.slice(0, -1).join(", ");
    return `We're piloting in ${head} and ${last}. We'll be opening up more areas soon.`;
  }

  React.useEffect(() => {
    // Sync external value changes without triggering the dropdown,
    // but preserve the display label if we just committed a place selection.
    if (displayLabel.current) return;
    setQuery(value);
  }, [value]);

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
          const all: Suggestion[] = results.slice(0, 12).map((pc) => ({
            kind: "postcode",
            label: pc,
            postcode: pc,
            outward: outwardFromPostcode(pc),
          }));

          // Pilot mode: keep results whose outward resolves (via
          // postcodes.io) to an enabled borough. Lookups are cached so we
          // hit one /outcodes call per unique outward in the result set.
          let list: Suggestion[] = all;
          if (pilotOnly && enabledBoroughs) {
            const uniqueOutwards = Array.from(
              new Set(
                all
                  .map((s) => (s.kind === "postcode" ? s.outward : null))
                  .filter(Boolean) as string[],
              ),
            );
            const districtMap = new Map<string, string[]>();
            await Promise.all(
              uniqueOutwards.map(async (o) => {
                districtMap.set(o, await fetchOutwardDistricts(o));
              }),
            );
            list = all.filter((s) => {
              const o = s.kind === "postcode" ? s.outward : null;
              if (!o) return false;
              return districtsInPilot(districtMap.get(o) || []);
            });
          }

          setSug(list);
          if (hasInteracted.current) setOpen(list.length > 0);

          // Immediate feedback: if pilot mode filtered every result out,
          // surface the block message as the user types.
          if (pilotOnly && enabledBoroughs) {
            if (all.length > 0 && list.length === 0) {
              setPilotErr(pilotBlockMessage());
            } else if (list.length > 0) {
              setPilotErr(null);
            }
          }
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
            const hasMatch = strings.some((s) => norm(s).includes(qNorm));
            if (!hasMatch) continue;

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
          if (hasInteracted.current && ranked.length > 0) setOpen(true);
        }
      } catch {
        setSug([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, pilotOnly, enabledBoroughs]);

  // Tracks the last query we auto-committed so we don't re-fire on the
  // same value over and over. Onkey strokes push the raw text up via
  // onChange (meta=null), so we can't dedup by comparing against `value`.
  const lastAutoCommitRef = React.useRef<string>("");

  // Live pilot check + auto-commit on the typed query. Fires when:
  //   (a) The typed text is a complete UK postcode → fetchMeta and
  //       commit it automatically (no Enter or pick required). Means
  //       the user can just type "E4 0AW" and have Continue enable.
  //   (b) The typed text contains a recognisable outward → look up
  //       admin_districts via /outcodes; if outside pilot, surface the
  //       block sheet (covers "N20" or "N20 0AA" typed without picking).
  React.useEffect(() => {
    const q = (debounced || "").trim();
    const qUpper = q.toUpperCase();

    // Auto-commit a complete postcode regardless of pilot mode.
    if (UK_POSTCODE_RE.test(q) && qUpper !== lastAutoCommitRef.current) {
      let alive = true;
      (async () => {
        try {
          const meta = await fetchMeta(q);
          if (!alive) return;
          // Pilot enforcement is best-effort on the client. We only block
          // when we have actually loaded the enabled-borough set AND it
          // says no. If the pilot fetch failed (enabledBoroughs is null),
          // we let the commit through - the server gate at POST time is
          // the source of truth, so a rare out-of-pilot postcode will
          // get rejected there with the same friendly message.
          if (
            pilotOnly &&
            enabledBoroughs &&
            (!meta.admin_district ||
              !enabledBoroughs.has(meta.admin_district))
          ) {
            setPilotErr(pilotBlockMessage());
            return;
          }
          setPilotErr(null);
          lastAutoCommitRef.current = qUpper;
          onChange(qUpper, meta);
        } catch {
          /* user might still be typing - swallow */
        }
      })();
      return () => {
        alive = false;
      };
    }

    // Pilot-only sheet trigger when the typed text has a recognisable
    // outward but no full postcode yet (e.g. "N20" or "SW10").
    if (!pilotOnly || !enabledBoroughs) return;
    const outward = outwardFromPostcode(q);
    if (!outward) return;

    let alive = true;
    (async () => {
      const districts = await fetchOutwardDistricts(outward);
      if (!alive) return;
      if (districts.length === 0) return; // unknown outward - ignore
      const inPilot = districts.some((d) => enabledBoroughs.has(d));
      if (!inPilot) setPilotErr(pilotBlockMessage());
      else setPilotErr(null);
    })();
    return () => {
      alive = false;
    };
    // pilotBlockMessage / fetchOutwardDistricts / fetchMeta close over enabledBoroughs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, pilotOnly, enabledBoroughs]);

  // Fetch borough suggestions (reuse same debounced query; skip if looks like a postcode fragment)
  React.useEffect(() => {
    const q = (debounced || "").trim();
    if (q.length < 2 || /^[a-z]{1,2}\d/i.test(q)) {
      setBoroughResults([]);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const r = await fetch(
          `/api/boroughs/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!r.ok) return;
        const data = await r.json();
        if (Array.isArray(data)) {
          // In pilot mode, hide boroughs that aren't enabled.
          const filtered =
            pilotOnly && enabledBoroughs
              ? data.filter((b: { name: string }) => enabledBoroughs.has(b.name))
              : data;
          setBoroughResults(filtered);
          if (filtered.length > 0) setOpen(true);
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") setBoroughResults([]);
      }
    })();
    return () => controller.abort();
  }, [debounced, pilotOnly, enabledBoroughs]);

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
      setPilotErr(null);
      const meta =
        s.kind === "postcode"
          ? await fetchMeta(s.postcode)
          : await resolvePlaceToMeta(s);

      // Pilot-area gate. meta.admin_district comes straight from
      // postcodes.io's /postcodes lookup - the canonical source for the
      // borough this postcode belongs to.
      // Pilot enforcement is best-effort on the client. Only block when
      // we've actually loaded the enabled-borough set AND it rejects this
      // district. If the pilot list isn't loaded, let the pick through -
      // the server gate at POST time will catch any genuinely out-of-pilot
      // postcode with the same message.
      if (
        pilotOnly &&
        enabledBoroughs &&
        (!meta.admin_district || !enabledBoroughs.has(meta.admin_district))
      ) {
        setPilotErr(pilotBlockMessage());
        return;
      }

      hasInteracted.current = false; // prevent value-sync re-triggering the dropdown
      const displayValue = s.kind === "place" ? s.label : meta.postcode;
      displayLabel.current = s.kind === "place" ? displayValue : null;
      onChange(meta.outward || meta.postcode, meta);
      onDisplayChange?.(displayValue);
      setQuery(displayValue);
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
        if (
          pilotOnly &&
          enabledBoroughs &&
          (!meta.admin_district || !enabledBoroughs.has(meta.admin_district))
        ) {
          setPilotErr(pilotBlockMessage());
          return;
        }
        hasInteracted.current = false;
        displayLabel.current = null;
        onChange(meta.outward || meta.postcode, meta);
        onDisplayChange?.(meta.postcode);
        setQuery(meta.postcode);
        setOpen(false);
        setSug([]);
        setErr(null);
        setPilotErr(null);
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

  // Dismissing the pilot-block UI also clears the input. Otherwise the
  // user could close the sheet, leave an out-of-pilot postcode in the
  // field, and click Continue (which gates only on text presence). By
  // resetting we force them to enter a fresh value, which re-runs the
  // pilot check from scratch.
  function dismissPilotBlock() {
    setPilotErr(null);
    setQuery("");
    setSug([]);
    setBoroughResults([]);
    setOpen(false);
    displayLabel.current = null;
    lastAutoCommitRef.current = "";
    onChange("", null);
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    hasInteracted.current = true;
    displayLabel.current = null;
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
      {label ? (
        <label htmlFor={id} className="text-xs text-slate-500 block mb-1">
          {label}
        </label>
      ) : null}

      <div className="relative">
        <input
          id={id}
          className={`input pr-9${error ? " border-red-500" : ""}`}
          placeholder={placeholder}
          value={query}
          onChange={onInput}
          onFocus={() => { hasInteracted.current = true; setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRawOrPlace(query);
            }
            if (e.key === "Escape") {
              // Reset hasInteracted so the in-flight async fetch doesn't re-open
              hasInteracted.current = false;
              setOpen(false);
              setSug([]);
            }
          }}
          aria-invalid={error ? "true" : undefined}
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

      {open && (sug.length > 0 || boroughResults.length > 0) && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-60 overflow-auto"
        >
          {boroughResults.map((b) => (
            <li key={`borough-${b.name}`} role="option">
              <button
                type="button"
                // Match the postcode/sector suggestion behaviour: prevent
                // the input from blurring before our onClick can run, so
                // the dropdown isn't dismissed first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  // Pass the borough name as the displayed value so the
                  // input shows "Waltham Forest" (and the parent stores it
                  // as form.location) instead of going blank.
                  onChange(b.name, {
                    postcode: "",
                    outward: null,
                    sector: null,
                    borough: { name: b.name, outwardCodes: b.outwardCodes },
                  });
                  setBoroughResults([]);
                  setOpen(false);
                  setSug([]);
                }}
                className="w-full text-left px-3 py-2 hover:bg-zinc-50 flex items-center gap-2"
                data-testid={`borough-option-${b.name}`}
              >
                <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5">
                  Borough
                </span>
                <span className="flex-1">
                  <span className="block text-sm text-zinc-900">{b.name}</span>
                  <span className="block text-xs text-zinc-500">
                    {b.outwardCodes.length} postcodes covered
                  </span>
                </span>
              </button>
            </li>
          ))}
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

      {reasonText ? (
        <p id={hintId} className="mt-1 text-[11px] text-slate-500">
          {reasonText}
        </p>
      ) : null}

      {/* Desktop pilot-block message - inline panel under the field.
          Mobile uses the bottom sheet below. */}
      {pilotErr && (
        <div
          className="hidden md:flex mt-2 items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5"
          role="status"
          data-testid="pilot-block-inline"
        >
          <span aria-hidden className="text-base shrink-0">📍</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-extrabold text-amber-900 leading-tight">
              Not in our area yet
            </div>
            <p className="mt-0.5 text-[12px] text-amber-900/80 leading-snug">
              {pilotErr}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissPilotBlock}
            className="ml-1 -mt-0.5 text-amber-700 hover:text-amber-900 font-bold text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* iOS-style bottom sheet - mobile only (md:hidden inside the
          component itself). */}
      <PilotBlockSheet
        open={!!pilotErr}
        message={pilotErr || ""}
        onClose={dismissPilotBlock}
      />
    </div>
  );
}
