import { useEffect, useMemo, useState } from "react";
import { ALL_PROJECT_TYPES, suggestProjectTypes } from "@/types/projectTypes";

/**
 * Simple, offline suggester hook for the Create Project form.
 * - No API calls, no DB.
 * - Debounced filtering over the static catalogue.
 */
export function useProjectTypeSuggester(opts?: {
  defaultValue?: string;
  limit?: number;
  debounceMs?: number;
}) {
  const limit = opts?.limit ?? 8;
  const debounceMs = opts?.debounceMs ?? 120;

  const [value, setValue] = useState<string>(opts?.defaultValue ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Curated quick-pick chips (must exist in ALL_PROJECT_TYPES)
  const chips = useMemo<string[]>(
    () =>
      [
        "Kitchen Remodel (Full)",
        "Bathroom Remodel (Full)",
        "Roof Repair",
        "Driveway (Block/Tarmac/Resin)",
        "Garden Design & Build",
        "Loft Conversion (Dormer)",
        "Single-storey Extension",
        "Full Rewire",
      ].filter((t) => ALL_PROJECT_TYPES.includes(t)),
    []
  );

  // Debounced local filtering
  useEffect(() => {
    let t: any;
    setLoading(true);
    t = setTimeout(() => {
      const list = value.trim() ? suggestProjectTypes(value, limit) : chips; // show chips when empty
      setSuggestions(list);
      setLoading(false);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [value, limit, debounceMs, chips]);

  // Imperative helpers (optional)
  const pick = (label: string) => setValue(label);
  const clear = () => setValue("");

  return {
    value,
    setValue,
    suggestions,
    chips, // quick-picks to render as pills
    loading,
    pick,
    clear,
  };
}

/**
 * Utility: canonicalise a user-entered value to the closest catalogue item.
 * Returns the top suggestion or null if nothing sensible is found.
 */
export function canonicaliseProjectType(input: string): string | null {
  const q = (input || "").trim();
  if (!q) return null;
  const [first] = suggestProjectTypes(q, 1);
  return first ?? null;
}
