// web/lib/projectTypes.ts
// Single source of truth for project type suggestions (no DB needed).

export type ProjectTypeCategory = {
  category: string;
  types: string[];
};

export const PROJECT_TYPES: ProjectTypeCategory[] = [
  /* ===================== Insulation ===================== */
  {
    category: "Insulation",
    types: [
      "Cavity Wall Insulation",
      "External Wall Insulation",
      "Internal Wall Insulation",
      "Loft Insulation",
      "Room-in-Roof Insulation",
      "Floor Insulation",
      "Underfloor Insulation",
      "Pipe & Tank Lagging",
      "Garage Insulation",
      "Soundproofing",
      "Draught Proofing",
    ],
  },

  /* ===================== Bathroom ===================== */
  {
    category: "Bathroom",
    types: [
      "Bathroom Remodel (Full)",
      "Bathroom Refresh (Partial)",
      "New Bathroom Installation",
      "Shower Installation/Replacement",
      "Bath Installation/Replacement",
      "Wet Room Installation",
      "Toilet Installation/Replacement",
      "Sink & Vanity Installation",
      "Bathroom Tiling",
      "Shower Screen/Enclosure Fitting",
      "Extractor Fan Installation",
      "Heated Towel Rail Installation",
      "Underfloor Heating (Bathroom)",
      "Bathroom Ventilation Upgrade",
      "Bathroom Waterproofing",
    ],
  },

  /* ===================== Kitchen ===================== */
  {
    category: "Kitchen",
    types: [
      "Kitchen Remodel (Full)",
      "Kitchen Refresh (Partial)",
      "New Kitchen Installation",
      "Kitchen Design & Planning",
      "Cabinet Installation",
      "Cabinet Refacing/Respraying",
      "Worktop/Countertop Replacement",
      "Kitchen Tiling & Splashback",
      "Appliance Installation",
      "Extractor Hood Installation",
      "Kitchen Plumbing",
      "Kitchen Electrical Upgrade",
      "Kitchen Flooring",
      "Kitchen Island Build",
      "Pantry/Utility Fit-out",
    ],
  },

  /* ===================== Flooring ===================== */
  {
    category: "Flooring",
    types: [
      "Hardwood Floor Installation",
      "Hardwood Sanding & Refinishing",
      "Engineered Wood Installation",
      "Laminate Installation",
      "Vinyl Plank/LVT Installation",
      "Carpet Installation",
      "Carpet Replacement",
      "Tile Flooring",
      "Stone Flooring",
      "Cork Flooring",
      "Parquet Installation",
      "Subfloor Repair/Levelling",
      "Underfloor Heating (Whole House)",
      "Skirting Boards & Thresholds",
    ],
  },

  /* ===================== Roofing ===================== */
  {
    category: "Roofing",
    types: [
      "Roof Repair",
      "New Roof Installation",
      "Re-roofing",
      "Flat Roof Repair/Replacement",
      "Pitched Roof Repair/Replacement",
      "Slate Roof",
      "Tile Roof",
      "EPDM/Rubber Roof",
      "GRP/Fibreglass Roof",
      "Fascias & Soffits",
      "Guttering & Downpipes",
      "Leadwork & Flashing",
      "Roof Insulation",
      "Roof Windows / Velux",
      "Chimney Repair/Removal",
    ],
  },

  /* ===================== Windows & Doors ===================== */
  {
    category: "Windows & Doors",
    types: [
      "Window Replacement (uPVC)",
      "Window Replacement (Aluminium)",
      "Window Replacement (Timber)",
      "Sash Window Repair/Replacement",
      "Double/Triple Glazing Upgrade",
      "Front Door Replacement",
      "Patio/French/Bi-fold Door Installation",
      "Internal Door Hanging",
      "Door Frame & Architrave",
      "Garage Door Replacement",
      "Secondary Glazing",
      "Draught Proofing (Windows/Doors)",
    ],
  },

  /* ===================== Extensions & Conversions ===================== */
  {
    category: "Extensions & Conversions",
    types: [
      "Single-storey Extension",
      "Double-storey Extension",
      "Rear/Side Return Extension",
      "Wrap-around Extension",
      "Loft Conversion (Dormer)",
      "Loft Conversion (Hip-to-Gable)",
      "Loft Conversion (Mansard)",
      "Garage Conversion",
      "Basement Conversion",
      "Garden Room/Office",
      "Orangery/Conservatory",
      "Structural Openings & RSJs",
    ],
  },

  /* ===================== Electrical ===================== */
  {
    category: "Electrical",
    types: [
      "Full Rewire",
      "Partial Rewire",
      "Consumer Unit/Fuse Box Upgrade",
      "EICR (Electrical Safety Test)",
      "Additional Sockets & Circuits",
      "Lighting Installation (Interior)",
      "Outdoor Lighting",
      "Downlights/Spotlights",
      "EV Charger Installation",
      "Extractor Fan Wiring",
      "Smart Switches & Dimmers",
      "Data & Networking",
      "CCTV & Security Cameras",
      "Doorbell/Intercom",
    ],
  },

  /* ===================== Plumbing ===================== */
  {
    category: "Plumbing",
    types: [
      "Emergency Leak Repair",
      "General Plumbing Repairs",
      "New Pipework/Repiping",
      "Bathroom Plumbing",
      "Kitchen Plumbing",
      "Unvented Cylinder Installation",
      "Water Softener/Filter",
      "Outdoor Tap Installation",
      "Macerator/Saniflo Installation",
      "Drain Unblocking",
    ],
  },

  /* ===================== Heating & Cooling ===================== */
  {
    category: "Heating & Cooling",
    types: [
      "New Boiler Installation",
      "Boiler Service",
      "Boiler Repair",
      "Radiator Installation/Relocation",
      "Smart Thermostat Installation",
      "Underfloor Heating (Wet)",
      "Heat Pump (Air Source)",
      "Heat Pump (Ground Source)",
      "MVHR/Ventilation",
      "Air Conditioning Installation",
      "Flue & Chimney Liner",
    ],
  },

  /* ===================== Carpentry & Joinery ===================== */
  {
    category: "Carpentry & Joinery",
    types: [
      "Bespoke Wardrobes",
      "Alcove Units",
      "Media/TV Wall Unit",
      "Bookshelves & Storage",
      "Staircase Renovation",
      "Handrails & Balustrades",
      "Internal Door Hanging",
      "Skirting & Architraves",
      "Stud Walls & Partitioning",
      "Window Seats",
      "Kitchen Fitting (Carpentry)",
      "Shelving & Joinery Repairs",
    ],
  },

  /* ===================== Masonry & Structural ===================== */
  {
    category: "Masonry & Structural",
    types: [
      "Brickwork Repair/Pointing",
      "New Brick/Block Walls",
      "Lintel Replacement",
      "RSJ/Steel Beam Installation",
      "Chimney Rebuild/Removal",
      "Concrete Works",
      "Foundations & Footings",
      "Retaining Walls",
      "Stonework & Repointing",
      "Rendering (Cement)",
      "Monocouche/Coloured Render",
      "External Wall Insulation Render",
      "Pebble Dash Removal/Repair",
    ],
  },

  /* ===================== Plastering, Drylining & Tiling ===================== */
  {
    category: "Plastering & Tiling",
    types: [
      "Skim Plastering",
      "Drywall/Plasterboard",
      "Dot & Dab",
      "Ceiling Repair/Replacement",
      "Artex Removal",
      "Coving & Cornice",
      "Wall Tiling",
      "Floor Tiling",
      "Stone/Marble Tiling",
      "Tank & Waterproof (Wet areas)",
    ],
  },

  /* ===================== Painting & Decorating ===================== */
  {
    category: "Painting & Decorating",
    types: [
      "Interior Painting",
      "Exterior Painting",
      "Woodwork Painting",
      "Wallpaper Hanging",
      "Wallpaper Removal",
      "Spray Painting (Joinery)",
      "Decorative Finishes",
      "Surface Prep & Repairs",
    ],
  },

  /* ===================== Damp, Waterproofing & Repairs ===================== */
  {
    category: "Damp & Waterproofing",
    types: [
      "Rising Damp Treatment",
      "Penetrating Damp Treatment",
      "Basement Tanking",
      "Condensation Control",
      "Mould Remediation",
      "Gutter/Downpipe Repairs",
      "Exterior Waterproof Coatings",
    ],
  },

  /* ===================== Landscaping & Garden ===================== */
  {
    category: "Landscaping & Garden",
    types: [
      "Garden Design & Build",
      "Decking (Timber/Composite)",
      "Patio/Paving",
      "Driveway (Block/Tarmac/Resin)",
      "Artificial Grass",
      "Lawn & Turfing",
      "Fencing & Gates",
      "Garden Walls",
      "Pergola/Gazebo",
      "Shed/Base Installation",
      "Drainage & Soakaways",
      "Irrigation Systems",
      "Garden Lighting",
    ],
  },

  /* ===================== Exterior & Structure ===================== */
  {
    category: "Exterior & Structure",
    types: [
      "Siding/Cladding Installation",
      "House Repointing",
      "Exterior Repairs (General)",
      "Porch/Canopy Build",
      "Pathways & Steps",
      "External Stairs/Handrails",
      "Boundary Walls",
    ],
  },

  /* ===================== Smart Home & Security ===================== */
  {
    category: "Smart Home & Security",
    types: [
      "Smart Lighting",
      "Smart Heating Controls",
      "Whole-home Wi-Fi/Networking",
      "CCTV Installation",
      "Alarm System Installation",
      "Video Doorbell/Intercom",
      "Access Control & Smart Locks",
      "AV/Surround Sound Setup",
    ],
  },

  /* ===================== Accessibility & Safety ===================== */
  {
    category: "Accessibility & Safety",
    types: [
      "Grab Rails & Aids",
      "Walk-in Shower/Wet Room",
      "Widen Doorways/Thresholds",
      "Wheelchair Ramps",
      "Stairlift Installation",
      "Non-slip Flooring",
      "Fire Doors & Closers",
      "Smoke/Heat/CO Alarms",
    ],
  },

  /* ===================== Energy & Renewables ===================== */
  {
    category: "Energy & Renewables",
    types: [
      "Solar PV Installation",
      "Battery Storage",
      "Solar Thermal (Hot Water)",
      "Energy Audit & EPC Upgrades",
      "Smart Metering (Client-side)",
    ],
  },

  /* ===================== Outdoor Living ===================== */
  {
    category: "Outdoor Living",
    types: [
      "Outdoor Kitchen/BBQ",
      "Fire Pit/Chiminea",
      "Hot Tub Prep/Installation",
      "Garden Room Utilities",
      "Pond/Water Feature",
    ],
  },

  /* ===================== Repairs & Maintenance ===================== */
  {
    category: "Repairs & Maintenance",
    types: [
      "Handyman Tasks",
      "General Repairs",
      "Ceiling/Wall Repairs",
      "Small Plumbing Jobs",
      "Small Electrical Jobs",
      "Window/Door Repairs",
      "Gutter Cleaning/Repair",
      "Pressure Washing",
    ],
  },

  /* ===================== Pest, Cleaning & Waste ===================== */
  {
    category: "Pest, Cleaning & Waste",
    types: [
      "Pest Control",
      "End-of-Tenancy Clean",
      "Deep Clean (Kitchen/Bathroom)",
      "Mould Cleaning",
      "Builders’ Clean",
      "House Clearance",
      "Skip Hire/Rubbish Removal",
    ],
  },
];

/** Flat list of all type labels (useful for quick dropdowns) */
export const ALL_PROJECT_TYPES: string[] = PROJECT_TYPES.flatMap(
  (c) => c.types
);

/** Normalise for comparisons */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();

/**
 * Very small client-side suggester.
 * - Scores: startsWith > token-substring > plain substring
 * - Returns unique labels (no duplicates) capped by `limit`
 */
export function suggestProjectTypes(query: string, limit = 8): string[] {
  const q = norm(query);
  if (!q) return ALL_PROJECT_TYPES.slice(0, limit);

  const scored: Array<{ v: string; s: number }> = [];

  for (const v of ALL_PROJECT_TYPES) {
    const n = norm(v);
    if (!n) continue;

    let s = -1;
    if (n.startsWith(q)) s = 3;
    else if (n.split(" ").some((t) => t.startsWith(q))) s = 2;
    else if (n.includes(q)) s = 1;

    if (s > 0) scored.push({ v, s });
  }

  scored.sort((a, b) => b.s - a.s || a.v.localeCompare(b.v));
  const out: string[] = [];
  for (const { v } of scored) {
    if (!out.includes(v)) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

export default PROJECT_TYPES;


// Quick defaults the UI can show (feel free to tweak the count)
export const QUICK_PICKS: string[] = ALL_PROJECT_TYPES.slice(0, 12);

// Normalise for comparisons (reuse your local `norm` if it's already defined)
const _norm =
  typeof norm === "function"
    ? norm
    : (s: string) =>
        s
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
          .trim();

/** Canonicalise a user-entered label to the closest known type */
export function toCanonicalType(input: string): string {
  const s = _norm(input);
  if (!s) return "";
  const exact = ALL_PROJECT_TYPES.find((t) => _norm(t) === s);
  if (exact) return exact;
  const starts = ALL_PROJECT_TYPES.find((t) => _norm(t).startsWith(s));
  if (starts) return starts;
  const inc = ALL_PROJECT_TYPES.find((t) => _norm(t).includes(s));
  if (inc) return inc;
  // Title-case fallback so the name still looks decent
  return String(input).replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

type Scored = { label: string; score: number };

/** Suggestions with scores (used for lightweight analytics) */
export function suggestProjectTypesWithScores(query: string, limit = 8): Scored[] {
  const q = _norm(query);
  if (!q) return QUICK_PICKS.map((label) => ({ label, score: 0 }));

  const scored: Scored[] = [];
  for (const label of ALL_PROJECT_TYPES) {
    const n = _norm(label);
    let score = 0;
    if (n === q) score = 3; // exact
    else if (n.startsWith(q)) score = 2; // prefix
    else if (n.split(" ").some((t) => t.startsWith(q))) score = 1.6; // token prefix
    else if (n.includes(q)) score = 1.2; // substring
    if (score > 0) scored.push({ label, score });
  }
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored.slice(0, limit);
}

/** Build a friendly auto name for a project */
export function buildAutoName(type: string, location: string, propertyType: string): string {
  const t = toCanonicalType(type);
  const loc = (location || "").trim();
  const prop = (propertyType || "").trim();
  return [t, loc, prop ? `· ${prop}` : ""].filter(Boolean).join(" ");
}
