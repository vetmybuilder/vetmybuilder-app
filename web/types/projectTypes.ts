// web/lib/projectTypes.ts
// Ultra-expanded project type catalogue for VetMyBuilder
// Clean, alphabetised, UK-optimised, SEO-friendly

export type ProjectTypeCategory = {
  category: string;
  types: string[];
};

export const PROJECT_TYPES: ProjectTypeCategory[] = [
  /* ===================== Accessibility & Safety ===================== */
  {
    category: "Accessibility & Safety",
    types: [
      "Accessible Bathroom Adaptation",
      "Accessible Bedroom Adaptation",
      "Accessible Kitchen Adaptation",
      "Fire Door Installation",
      "Fire Risk Assessment",
      "Grab Rails & Aids",
      "Handrail Installation",
      "Non-slip Flooring",
      "Smoke/Heat/CO Alarm Installation",
      "Stairlift Installation",
      "Wheelchair Ramps",
      "Widen Doorways/Thresholds",
      "Walk-in Bath Installation",
      "Walk-in Shower/Wet Room",
    ],
  },

  /* ===================== Appliances (Kitchen & Laundry) ===================== */
  {
    category: "Appliances",
    types: [
      "Cooker/Oven Installation",
      "Dishwasher Installation",
      "Extractor Hood Installation",
      "Fridge/Freezer Installation",
      "Gas Appliance Installation",
      "Induction Hob Installation",
      "Microwave Housing/Fitting",
      "Tumble Dryer Installation",
      "Washer/Dryer Installation",
      "Water Softener/Filter Installation",
    ],
  },

  /* ===================== Bathroom ===================== */
  {
    category: "Bathroom",
    types: [
      "Bathroom Design & Planning",
      "Bathroom Plumbing",
      "Bathroom Refresh (Partial)",
      "Bathroom Remodel (Full)",
      "Bathroom Ventilation Upgrade",
      "Bathroom Waterproofing",
      "Bath Installation/Replacement",
      "Extractor Fan Installation",
      "Heated Towel Rail Installation",
      "New Bathroom Installation",
      "Shower Installation/Replacement",
      "Shower Enclosure Installation",
      "Sink & Vanity Installation",
      "Toilet Installation/Replacement",
      "Underfloor Heating (Bathroom)",
      "Wet Room Installation",
      "Bathroom Tiling",
      "Bathroom Flooring",
    ],
  },

  /* ===================== Bedroom ===================== */
  {
    category: "Bedroom",
    types: [
      "Bedroom Design & Planning",
      "Bedroom Refurbishment (Full)",
      "Bedroom Refresh (Partial)",
      "Bedroom Redecoration",
      "Bedroom Flooring Installation",
      "Bedroom Carpet Fitting",
      "Bedroom Laminate/LVT Installation",
      "Bedroom Wood Floor Sanding/Restoration",
      "Bedroom Painting",
      "Bedroom Wallpapering",
      "Bedroom Plastering/Skimming",
      "Bedroom Ceiling Repair",
      "Bedroom Lighting Installation",
      "Bedroom Additional Sockets",
      "Bedroom Radiator Installation/Replacement",
      "Bedroom Radiator Relocation",
      "Bedroom Underfloor Heating",
      "Bedroom Insulation Upgrade",
      "Bedroom Soundproofing",
      "Fitted Wardrobes (Bedroom)",
      "Built-in Storage (Bedroom)",
      "Bespoke Wardrobes (Bedroom)",
      "Alcove Units (Bedroom)",
      "Shelving Installation (Bedroom)",
      "Bedroom Door Installation/Replacement",
      "Bedroom Internal Door Hanging",
      "Bedroom Window Replacement",
      "Bedroom Triple Glazing Upgrade",
      "Bedroom Blinds/Curtains Installation",
    ],
  },

  /* ===================== Building & General Construction ===================== */
  {
    category: "Building & Construction",
    types: [
      "Basement Dig-Out",
      "Basement Conversion",
      "Blockwork Construction",
      "Brickwork Repair",
      "Building Regulations Consultation",
      "Concrete Foundations",
      "Concrete Slab Pouring",
      "Damp Proof Course Installation",
      "Demolition (Internal/External)",
      "Doorway/Wall Opening (RSJ Installation)",
      "Drylining & Partition Walls",
      "Garage Conversion",
      "General Building Work",
      "House Extension (Planning & Build)",
      "Internal Wall Removal",
      "Loft Conversion (Dormer)",
      "Loft Conversion (Hip-to-Gable)",
      "Loft Conversion (Mansard)",
      "Masonry Repair",
      "New Build House",
      "New Internal Walls/Studwork",
      "Property Refurbishment (Full)",
      "Retaining Wall Construction",
      "RSJ/Steel Beam Installation",
      "Underpinning",
      "Wrap-around Extension",
    ],
  },

  /* ===================== Carpentry & Joinery ===================== */
  {
    category: "Carpentry & Joinery",
    types: [
      "Alcove Units",
      "Bespoke Cabinetry",
      "Bespoke Wardrobes",
      "Bookshelves & Storage",
      "Decking (Timber/Composite)",
      "Door Frame & Architrave",
      "Fitted Wardrobes",
      "Handrails & Balustrades",
      "Internal Door Hanging",
      "Joinery Repairs",
      "Kitchen Fitting (Carpentry)",
      "Media/TV Wall Unit",
      "Skirting Boards",
      "Staircase Build/Renovation",
      "Stud Walls & Partitioning",
      "Window Seats",
      "Shelving Installation",
    ],
  },

  /* ===================== Cleaning & Waste ===================== */
  {
    category: "Cleaning & Waste",
    types: [
      "Builders’ Clean",
      "Carpet Cleaning",
      "Commercial Bin Cleaning",
      "Deep Clean (Kitchen/Bathroom)",
      "Domestic Bin Cleaning",
      "End-of-Tenancy Cleaning",
      "Gutter Cleaning",
      "House Clearance",
      "Mould Cleaning",
      "Oven Cleaning",
      "Pressure Washing",
      "Rubbish Removal",
      "Skip Hire",
    ],
  },

  /* ===================== Damp, Waterproofing & Mould ===================== */
  {
    category: "Damp & Waterproofing",
    types: [
      "Basement Tanking",
      "Condensation Control",
      "Damp Inspection",
      "Damp Proof Course",
      "Exterior Waterproof Coatings",
      "Mould Remediation",
      "Penetrating Damp Treatment",
      "Rising Damp Treatment",
      "Waterproofing (General)",
    ],
  },

  /* ===================== Electrical ===================== */
  {
    category: "Electrical",
    types: [
      "Additional Sockets",
      "CCTV & Security Cameras",
      "Consumer Unit/Fuse Box Upgrade",
      "Data & Networking",
      "Doorbell/Intercom Installation",
      "Downlights/Spotlights",
      "EICR (Electrical Safety Test)",
      "EV Charger Installation",
      "Exterior Lighting",
      "Full Rewire",
      "Lighting Installation (Interior)",
      "Partial Rewire",
      "Smart Switch Installation",
      "Underfloor Heating (Electric)",
      "Extractor Fan Wiring",
    ],
  },

  /* ===================== Energy & Renewables ===================== */
  {
    category: "Energy & Renewables",
    types: [
      "Battery Storage Installation",
      "Energy Audit/EPC Upgrade",
      "Heat Pump (Air Source)",
      "Heat Pump (Ground Source)",
      "MVHR/Ventilation System",
      "Smart Metering (Client-side)",
      "Solar PV Installation",
      "Solar Thermal (Hot Water)",
    ],
  },

  /* ===================== Extensions & Conversions ===================== */
  {
    category: "Extensions & Conversions",
    types: [
      "Basement Conversion",
      "Double-storey Extension",
      "Garage Conversion",
      "Garden Room/Annexe",
      "Loft Conversion (Dormer)",
      "Loft Conversion (Hip-to-Gable)",
      "Loft Conversion (Mansard)",
      "Orangery/Conservatory",
      "Rear/Side Return Extension",
      "Single-storey Extension",
      "Structural Openings",
      "Wrap-around Extension",
    ],
  },

  /* ===================== Exterior & Structure ===================== */
  {
    category: "Exterior & Structure",
    types: [
      "Boundary Walls",
      "Cladding Installation",
      "Exterior Repairs",
      "Exterior Stairs/Handrails",
      "House Repointing",
      "Monocouche/Coloured Render",
      "Pathways & Steps",
      "Pebble Dash Removal",
      "Porch/Canopy Build",
      "Rendering (Cement)",
      "Siding/Cladding",
    ],
  },

  /* ===================== Fencing & Gates ===================== */
  {
    category: "Fencing & Gates",
    types: [
      "Fence Repair",
      "Fence Replacement",
      "Garden Gate Installation",
      "Security Fencing",
      "Timber Fence Installation",
      "Composite Fence Installation",
      "Panel Fence Installation",
      "Post & Rail Installation",
      "Picket Fencing",
    ],
  },

  /* ===================== Flooring ===================== */
  {
    category: "Flooring",
    types: [
      "Carpet Fitting",
      "Carpet Removal",
      "Cork Flooring",
      "Engineered Wood Installation",
      "Floor Levelling",
      "Floor Sanding & Refinishing",
      "Laminate Installation",
      "Parquet Installation",
      "Stone Flooring",
      "Subfloor Repair",
      "Tile Flooring",
      "Underfloor Heating (Whole House)",
      "Vinyl/LVT Installation",
      "Wood Floor Restoration",
    ],
  },

  /* ===================== Gardening & Landscaping ===================== */
  {
    category: "Landscaping & Garden",
    types: [
      "Artificial Grass Installation",
      "Decking (Timber/Composite)",
      "Drainage & Soakaways",
      "Driveway (Block)",
      "Driveway (Resin)",
      "Driveway (Tarmac)",
      "Fence/Gate Installation",
      "Garden Clearance",
      "Garden Design & Build",
      "Garden Drainage",
      "Garden Irrigation System",
      "Garden Lighting",
      "Garden Paths",
      "Garden Turfing",
      "Garden Wall Construction",
      "Gazebo/Pergola Installation",
      "Patio/Paving",
      "Planting & Soft Landscaping",
      "Pond/Water Feature",
      "Retaining Walls (Garden)",
      "Shed/Base Installation",
    ],
  },

  /* ===================== Heating & Cooling ===================== */
  {
    category: "Heating & Cooling",
    types: [
      "Air Conditioning Installation",
      "Boiler Installation",
      "Boiler Repair",
      "Boiler Service",
      "Flue & Chimney Liner",
      "Heat Pump Installation",
      "Radiator Installation",
      "Radiator Relocation",
      "Smart Thermostat Installation",
      "Underfloor Heating (Wet)",
    ],
  },

  /* ===================== Insulation ===================== */
  {
    category: "Insulation",
    types: [
      "Cavity Wall Insulation",
      "Draught Proofing",
      "External Wall Insulation",
      "Floor Insulation",
      "Garage Insulation",
      "Internal Wall Insulation",
      "Loft Insulation",
      "Pipe & Tank Lagging",
      "Room-in-Roof Insulation",
      "Soundproofing",
      "Underfloor Insulation",
    ],
  },

  /* ===================== Kitchen ===================== */
  {
    category: "Kitchen",
    types: [
      "Appliance Installation",
      "Cabinet Installation",
      "Cabinet Refacing/Respraying",
      "Extractor Hood Installation",
      "Kitchen Design & Planning",
      "Kitchen Electrical Upgrade",
      "Kitchen Flooring",
      "Kitchen Island Build",
      "Kitchen Plumbing",
      "Kitchen Refresh (Partial)",
      "Kitchen Remodel (Full)",
      "Kitchen Tiling & Splashback",
      "New Kitchen Installation",
      "Pantry/Utility Fit-out",
      "Worktop/Countertop Replacement",
    ],
  },

  /* ===================== Metalwork & Fabrication ===================== */
  {
    category: "Metalwork & Fabrication",
    types: [
      "Balustrade Fabrication",
      "Custom Metal Gates",
      "Fabricated Steel Supports",
      "Handrails (Metal)",
      "Metal Welding Repairs",
      "Security Grilles",
      "Steel Staircases",
    ],
  },

  /* ===================== Painting & Decorating ===================== */
  {
    category: "Painting & Decorating",
    types: [
      "Decorative Finishes",
      "Exterior Painting",
      "Interior Painting",
      "Spray Painting (Joinery)",
      "Surface Prep & Repairs",
      "Wallpaper Hanging",
      "Wallpaper Removal",
      "Woodwork Painting",
    ],
  },

  /* ===================== Pest Control ===================== */
  {
    category: "Pest Control",
    types: [
      "Bed Bug Treatment",
      "Bird Proofing",
      "Flea Treatment",
      "Mouse/Rat Control",
      "Pest Inspection",
      "Wasp Nest Removal",
    ],
  },

  /* ===================== Plumbing ===================== */
  {
    category: "Plumbing",
    types: [
      "Bathroom Plumbing",
      "Blocked Drain",
      "Emergency Leak Repair",
      "General Plumbing Repairs",
      "Kitchen Plumbing",
      "Macerator/Saniflo Installation",
      "New Pipework/Repiping",
      "Outdoor Tap Installation",
      "Unvented Cylinder Installation",
      "Water Softener Installation",
    ],
  },

  /* ===================== Repairs & Maintenance ===================== */
  {
    category: "Repairs & Maintenance",
    types: [
      "Ceiling Repairs",
      "Door Repairs",
      "General Repairs",
      "Gutter Repairs",
      "Handyman Tasks",
      "Small Electrical Jobs",
      "Small Plumbing Jobs",
      "Wall Repairs",
      "Window Repairs",
    ],
  },

  /* ===================== Roofing ===================== */
  {
    category: "Roofing",
    types: [
      "Chimney Repair/Removal",
      "EPDM/Rubber Roof",
      "Fascias & Soffits",
      "Flat Roof Repair/Replacement",
      "GRP/Fibreglass Roof",
      "Guttering & Downpipes",
      "Leadwork & Flashing",
      "New Roof Installation",
      "Pitched Roof Repair/Replacement",
      "Re-roofing",
      "Roof Insulation",
      "Roof Repair",
      "Roof Tiling",
      "Roof Windows / Velux",
      "Slate Roof",
      "Tile Roof",
    ],
  },

  /* ===================== Smart Home & Security ===================== */
  {
    category: "Smart Home & Security",
    types: [
      "Access Control & Smart Locks",
      "Alarm System Installation",
      "AV/Surround Sound Setup",
      "CCTV Installation",
      "Smart Heating Controls",
      "Smart Lighting",
      "Video Doorbell/Intercom",
      "Whole-home Wi-Fi/Networking",
    ],
  },

  /* ===================== Tiling & Plastering ===================== */
  {
    category: "Tiling & Plastering",
    types: [
      "Artex Removal",
      "Ceiling Repair/Replacement",
      "Coving & Cornice",
      "Drywall/Plasterboard",
      "Dot & Dab",
      "Floor Tiling",
      "Plaster Skimming",
      "Stone/Marble Tiling",
      "Tank & Waterproof (Wet Areas)",
      "Wall Tiling",
    ],
  },

  /* ===================== Windows & Doors ===================== */
  {
    category: "Windows & Doors",
    types: [
      "Bi-fold Door Installation",
      "Door Frame Repair",
      "Front Door Replacement",
      "Garage Door Replacement",
      "Internal Door Hanging",
      "Patio/French Door Installation",
      "Sash Window Repair/Replacement",
      "Secondary Glazing",
      "Triple Glazing Upgrade",
      "Window Replacement (uPVC)",
      "Window Replacement (Aluminium)",
      "Window Replacement (Timber)",
      "Window Repair",
    ],
  },
];

/** Flat list */
export const ALL_PROJECT_TYPES: string[] = PROJECT_TYPES.flatMap(
  (c) => c.types,
);

/** Normalise */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();

/** Suggest */
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

/** Quick picks */
export const QUICK_PICKS: string[] = ALL_PROJECT_TYPES.slice(0, 12);

/** Canonicalise */
export function toCanonicalType(input: string): string {
  const s = norm(input);
  if (!s) return "";
  const exact = ALL_PROJECT_TYPES.find((t) => norm(t) === s);
  if (exact) return exact;
  const starts = ALL_PROJECT_TYPES.find((t) => norm(t).startsWith(s));
  if (starts) return starts;
  const inc = ALL_PROJECT_TYPES.find((t) => norm(t).includes(s));
  if (inc) return inc;
  return String(input).replace(
    /\w\S*/g,
    (w) => w[0].toUpperCase() + w.slice(1).toLowerCase(),
  );
}
