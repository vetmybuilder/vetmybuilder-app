// web/lib/projectTypes.ts
// Lightweight taxonomy + fuzzy/phonetic suggester for "Type of project"
// No deps. Safe to use in the browser and Node.

export type ProjectTypeEntry = {
  label: string;
  synonyms?: string[];
  buckets?: string[]; // optional grouping (kitchen, bathroom, roofing, gardens, general, etc.)
  active?: boolean;
  popularity?: number; // optional: can be used to weight frequent picks
};

export const PROJECT_TYPES: ProjectTypeEntry[] = [
  // ---- Kitchen
  {
    label: "Kitchen remodel",
    synonyms: [
      "kitchen renovation",
      "kitchen fitting",
      "kitchen installation",
      "kitchen install",
      "kitchen refit",
    ],
    buckets: ["kitchen"],
  },
  {
    label: "Worktop replacement",
    synonyms: ["worktop fit", "worktop change"],
    buckets: ["kitchen"],
  },
  {
    label: "Kitchen tiling",
    synonyms: ["splashback tiling"],
    buckets: ["kitchen", "tiling"],
  },

  // ---- Bathroom
  {
    label: "Bathroom refit",
    synonyms: ["bathroom renovation", "bathroom remodel", "new bathroom"],
    buckets: ["bathroom"],
  },
  {
    label: "Bathroom installation",
    synonyms: ["bathroom install"],
    buckets: ["bathroom"],
  },
  {
    label: "Bathroom fitting",
    synonyms: ["bathroom fitter"],
    buckets: ["bathroom"],
  },
  {
    label: "Shower install",
    synonyms: ["walk-in shower install", "shower enclosure install"],
    buckets: ["bathroom"],
  },
  {
    label: "Wet room installation",
    synonyms: ["wet room", "wetroom install"],
    buckets: ["bathroom"],
  },
  {
    label: "Bathroom tiling",
    synonyms: ["tiling", "wall tiling", "floor tiling"],
    buckets: ["bathroom", "tiling"],
  },

  // ---- Roofing
  {
    label: "Roofing",
    synonyms: [
      "roof repair",
      "roof replacement",
      "re-roof",
      "reroof",
      "roof leak",
    ],
    buckets: ["roofing"],
  },
  {
    label: "Flat roof install",
    synonyms: [
      "flat roof replacement",
      "felt roof",
      "EPDM roof",
      "rubber roof",
      "GRP roof",
      "fibreglass roof",
    ],
    buckets: ["roofing"],
  },
  {
    label: "Pitched roof (tile/slate)",
    synonyms: ["tile roof", "slate roof", "pitched roof replacement"],
    buckets: ["roofing"],
  },
  {
    label: "Fascias & soffits",
    synonyms: ["fascia replacement", "soffit replacement", "bargeboards"],
    buckets: ["roofing"],
  },
  {
    label: "Guttering install/repair",
    synonyms: ["gutter replacement", "gutter repair", "downpipe"],
    buckets: ["roofing"],
  },
  {
    label: "Chimney repair (roof)",
    synonyms: [
      "chimney repointing",
      "chimney flashing",
      "chimney removal (roof)",
    ],
    buckets: ["roofing"],
  },

  // ---- Driveways / Gardens
  {
    label: "Driveway / paving",
    synonyms: [
      "driveway",
      "paving",
      "block paving",
      "resin driveway",
      "tarmac driveway",
      "patio paving",
      "path paving",
    ],
    buckets: ["groundworks", "driveways"],
  },
  {
    label: "Patio install",
    synonyms: ["new patio", "patio laying", "stone patio"],
    buckets: ["gardens", "driveways"],
  },
  {
    label: "Garden landscaping",
    synonyms: [
      "landscaping",
      "garden design",
      "soft landscaping",
      "hard landscaping",
    ],
    buckets: ["gardens"],
  },
  {
    label: "Turfing / lawn",
    synonyms: ["new lawn", "turf install", "returfing"],
    buckets: ["gardens"],
  },
  {
    label: "Decking",
    synonyms: ["composite decking", "timber decking"],
    buckets: ["gardens"],
  },
  {
    label: "Garden fencing",
    synonyms: ["fence install", "fence replacement", "panel fencing"],
    buckets: ["gardens", "fencing"],
  },
  {
    label: "Garden lighting & power",
    synonyms: ["outdoor sockets", "garden lighting"],
    buckets: ["gardens", "electrical"],
  },
  {
    label: "Tree surgery",
    synonyms: ["tree removal", "tree pruning"],
    buckets: ["gardens"],
  },
  {
    label: "Irrigation",
    synonyms: ["sprinkler system", "drip irrigation"],
    buckets: ["gardens"],
  },

  // ---- General trades
  {
    label: "Plastering & skimming",
    synonyms: ["plastering", "skim walls"],
    buckets: ["general", "plastering"],
  },
  {
    label: "Painting & decorating",
    synonyms: ["decorating", "painting"],
    buckets: ["general", "decorating"],
  },
  {
    label: "Electrical rewire",
    synonyms: ["rewire"],
    buckets: ["general", "electrical"],
  },
  {
    label: "Boiler install",
    synonyms: ["boiler replacement", "new boiler"],
    buckets: ["general", "heating", "plumbing"],
  },
  {
    label: "Flooring",
    synonyms: ["laminate", "wood flooring", "vinyl", "engineered wood", "tile"],
    buckets: ["general", "flooring"],
  },
  {
    label: "Loft conversion",
    synonyms: ["attic conversion", "loft"],
    buckets: ["general", "structural"],
  },
  {
    label: "Single-storey extension",
    synonyms: ["rear extension", "side return", "extension"],
    buckets: ["general", "structural"],
  },
];

// ---------- tiny text utils (normalize → stem → tokenise) ----------
function normalize(s: string) {
  return s.trim().replace(/\s+/g, " ");
}
function stem(w: string) {
  return w
    .toLowerCase()
    .replace(/(ing|ers?|ed|ly|es|s)$/i, "")
    .replace(/-/g, "");
}
function tokenise(s: string) {
  return s
    .toLowerCase()
    .split(/[\s/()&,+-]+/)
    .filter(Boolean)
    .map(stem);
}

// ---------- phonetic + trigram helpers ----------
function soundex(s: string) {
  const a = s.toUpperCase().replace(/[^A-Z]/g, "");
  if (!a) return "";
  const map: Record<string, number> = {
    B: 1,
    F: 1,
    P: 1,
    V: 1,
    C: 2,
    G: 2,
    J: 2,
    K: 2,
    Q: 2,
    S: 2,
    X: 2,
    Z: 2,
    D: 3,
    T: 3,
    L: 4,
    M: 5,
    N: 5,
    R: 6,
  };
  const first = a[0];
  const codes: string[] = [first];
  for (let i = 1; i < a.length; i++) {
    const c = String(map[a[i]] || 0);
    if (c !== codes[codes.length - 1]) codes.push(c);
  }
  return (codes.join("").replace(/0/g, "") + "000").slice(0, 4);
}

function trigramSet(s: string) {
  const t = `  ${s.toLowerCase()}  `;
  const set = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}
function trigramJaccard(a: string, b: string) {
  const A = trigramSet(a),
    B = trigramSet(b);
  let inter = 0;
  A.forEach((x) => {
    if (B.has(x)) inter++;
  });
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

// ---------- capped Levenshtein (fast) ----------
function editDistance(a: string, b: string, cap = 2) {
  a = stem(a);
  b = stem(b);
  const n = a.length,
    m = b.length;
  if (!n) return Math.min(m, cap + 1);
  if (!m) return Math.min(n, cap + 1);
  if (Math.abs(n - m) > cap) return cap + 1;
  const prev = new Array(m + 1),
    cur = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    for (let j = 0; j <= m; j++) prev[j] = cur[j];
  }
  return Math.min(cur[m], cap + 1);
}

// ---------- public helpers ----------
export function toCanonicalType(input: string): string {
  const lower = input.toLowerCase();
  const found = PROJECT_TYPES.find(
    (t) =>
      t.label.toLowerCase() === lower ||
      (t.synonyms || []).some((s) => s.toLowerCase() === lower)
  );
  return found ? found.label : normalize(input);
}

export function allTypeStrings(): string[] {
  return Array.from(
    new Set(PROJECT_TYPES.flatMap((t) => [t.label, ...(t.synonyms || [])]))
  );
}

function scoreCandidate(candidate: string, q: string) {
  if (!q) return 0;
  const qTokens = tokenise(q).join(" ");
  const cTokens = tokenise(candidate).join(" ");

  const includes = cTokens.includes(qTokens) ? 1 : 0; // direct substring after stemming
  const ed = Math.min(...tokenise(candidate).map((t) => editDistance(t, q, 2))); // typo distance
  const tri = trigramJaccard(candidate, q); // 0..1 for shape similarity
  const snd = soundex(candidate) === soundex(q) ? 1 : 0; // phonetic

  // Higher is better. Weighting tuned for short user queries.
  return includes * 3 + (2 - Math.min(ed, 2)) + tri * 2 + snd * 1;
}

/**
 * Suggest canonical labels for a user query.
 * - Returns canonical labels (synonyms mapped to their label)
 * - Order: best score first, deduped
 */
export function suggestProjectTypes(query: string, limit = 8): string[] {
  const lib = allTypeStrings();
  if (!query) {
    // default surfacing (you can reorder based on popularity later)
    const defaults = [
      "Kitchen remodel",
      "Bathroom refit",
      "Roofing",
      "Driveway / paving",
      "Garden landscaping",
      "Loft conversion",
      "Single-storey extension",
      "Electrical rewire",
    ];
    return defaults.slice(0, limit);
  }

  const scored = lib
    .map((s) => ({ s, score: scoreCandidate(s, query) }))
    .filter((x) => x.score > 0.5) // confidence floor; still allow empty result
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);

  // Map to canonical labels and dedupe while preserving order
  const canonSet = new Set<string>();
  const result: string[] = [];
  for (const s of scored) {
    const label = toCanonicalType(s);
    if (!canonSet.has(label)) {
      canonSet.add(label);
      result.push(label);
      if (result.length >= limit) break;
    }
  }

  // Strong fallback if nothing scored
  if (result.length === 0) {
    return [
      "Roofing",
      "Driveway / paving",
      "Garden landscaping",
      "Kitchen remodel",
    ].slice(0, limit);
  }
  return result;
}

/** Optional: build a friendly auto name if you generate names later */
export function buildAutoName(
  type: string,
  location?: string,
  propertyType?: string
) {
  const t = toCanonicalType(type) || "Project";
  const parts: string[] = [t];
  if (location) parts.push(`in ${location}`);
  if (propertyType) parts.push(`(${propertyType})`);
  return parts.join(" ");
}

export type ScoredSuggestion = { label: string; score: number };

export function suggestProjectTypesWithScores(
  query: string,
  limit = 8
): ScoredSuggestion[] {
  const lib = allTypeStrings();

  if (!query) {
    return suggestProjectTypes("")
      .slice(0, limit)
      .map((label) => ({ label, score: 1 }));
  }

  const scoredRaw = lib
    .map((s) => {
      // reuse same ingredients as suggestProjectTypes
      const qTokens = tokenise(query).join(" ");
      const cTokens = tokenise(s).join(" ");
      const includes = cTokens.includes(qTokens) ? 1 : 0;
      const ed = Math.min(...tokenise(s).map((t) => editDistance(t, query, 2)));
      const tri = trigramJaccard(s, query);
      const snd = soundex(s) === soundex(query) ? 1 : 0;
      const score = includes * 3 + (2 - Math.min(ed, 2)) + tri * 2 + snd * 1;
      return { str: s, score };
    })
    .filter((x) => x.score > 0.5)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: ScoredSuggestion[] = [];
  for (const { str, score } of scoredRaw) {
    const label = toCanonicalType(str);
    if (!seen.has(label)) {
      seen.add(label);
      out.push({ label, score });
      if (out.length >= limit) break;
    }
  }

  if (out.length === 0) {
    return [
      "Roofing",
      "Driveway / paving",
      "Garden landscaping",
      "Kitchen remodel",
    ]
      .slice(0, limit)
      .map((label) => ({ label, score: 0.6 }));
  }

  return out;
}
