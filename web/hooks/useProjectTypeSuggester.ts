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

  /**
   * Curated quick-pick chips:
   * These are the most common / most searched-for UK home improvement projects.
   * They MUST exist in ALL_PROJECT_TYPES.
   */
  const chips = useMemo<string[]>(
    () =>
      [
        "Kitchen Remodel (Full)",
        "Bathroom Remodel (Full)",
        "Roof Repair",
        "Loft Conversion (Dormer)",
        "Single-storey Extension",
        "Garden Design & Build",
        "Driveway (Block)",
        "Full Rewire",
        "Boiler Installation",
        "New Bathroom Installation",
        "New Kitchen Installation",
        "Plaster Skimming",
      ].filter((t) => ALL_PROJECT_TYPES.includes(t)),
    []
  );

  // Debounced local filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      const list = value.trim() ? suggestProjectTypes(value, limit) : chips;
      setSuggestions(list);
      setLoading(false);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [value, limit, debounceMs, chips]);

  // Imperative helpers
  const pick = (label: string) => setValue(label);
  const clear = () => setValue("");

  return {
    value,
    setValue,
    suggestions,
    chips,
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
