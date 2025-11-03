// web/types/tradeTypes.ts

export type TradeType = {
  label: string;
  synonyms?: string[];
  buckets?: string; // optional grouping (e.g., "Heating", "Structure")
  popularity?: number; // used for sorting if you like
  active?: boolean; // default true
};

export const TRADE_TYPES: TradeType[] = [
  // --- Core building ---
  {
    label: "General Builder",
    synonyms: ["Builder"],
    buckets: "Structure",
    popularity: 90,
  },
  {
    label: "Carpenter / Joiner",
    synonyms: ["Carpenter", "Joiner"],
    buckets: "Interiors",
    popularity: 85,
  },
  { label: "Bricklayer", buckets: "Structure", popularity: 70 },
  {
    label: "Roofer",
    synonyms: ["Roofing"],
    buckets: "Exterior",
    popularity: 80,
  },
  { label: "Plasterer", buckets: "Interiors", popularity: 75 },
  {
    label: "Painter / Decorator",
    synonyms: ["Decorator"],
    buckets: "Finishes",
    popularity: 88,
  },
  { label: "Plumber", buckets: "Plumbing", popularity: 90 },
  { label: "Electrician", buckets: "Electrical", popularity: 95 },
  {
    label: "Gas Engineer",
    synonyms: ["Gas Safe"],
    buckets: "Heating",
    popularity: 82,
  },
  { label: "Tiler", buckets: "Finishes", popularity: 68 },
  {
    label: "Flooring Specialist",
    synonyms: ["Floor Fitter"],
    buckets: "Finishes",
    popularity: 70,
  },
  { label: "Kitchen Fitter", buckets: "Interiors", popularity: 78 },
  { label: "Bathroom Fitter", buckets: "Interiors", popularity: 78 },
  {
    label: "Window / Door Fitter",
    synonyms: ["UPVC", "Aluminium Windows", "Doors"],
    buckets: "Exterior",
    popularity: 72,
  },
  { label: "Glazier", buckets: "Exterior", popularity: 55 },

  // --- Conversions & extensions ---
  { label: "Loft Conversion Specialist", buckets: "Structure", popularity: 65 },
  { label: "Extension Builder", buckets: "Structure", popularity: 77 },
  { label: "Garage Conversion", buckets: "Structure", popularity: 55 },
  { label: "Basement Conversion", buckets: "Structure", popularity: 40 },
  { label: "New Build", buckets: "Structure", popularity: 50 },

  // --- Exterior & groundwork ---
  { label: "Landscaper", buckets: "Exterior", popularity: 76 },
  { label: "Driveways / Paving", buckets: "Exterior", popularity: 66 },
  { label: "Fencing", buckets: "Exterior", popularity: 64 },
  { label: "Decking", buckets: "Exterior", popularity: 58 },
  {
    label: "Garden Rooms / Offices",
    synonyms: ["Outbuildings"],
    buckets: "Exterior",
    popularity: 60,
  },
  { label: "Groundworker", buckets: "Structure", popularity: 50 },
  { label: "Drainage Specialist", buckets: "Structure", popularity: 48 },
  { label: "Scaffolder", buckets: "Support", popularity: 45 },
  { label: "Steel Fabrication", buckets: "Structure", popularity: 44 },
  { label: "Stonemason", buckets: "Structure", popularity: 30 },
  { label: "Thatched Roofing", buckets: "Exterior", popularity: 15 },
  { label: "Asbestos Removal", buckets: "Specialist", popularity: 20 },

  // --- Heating, cooling, renewables ---
  { label: "Heating Engineer", buckets: "Heating", popularity: 80 },
  { label: "Boiler Installer", buckets: "Heating", popularity: 78 },
  { label: "Air Conditioning", buckets: "HVAC", popularity: 52 },
  {
    label: "Heat Pumps",
    synonyms: ["ASHP", "GSHP"],
    buckets: "Renewables",
    popularity: 50,
  },
  { label: "Solar PV", buckets: "Renewables", popularity: 62 },
  { label: "Solar Thermal", buckets: "Renewables", popularity: 35 },
  { label: "Underfloor Heating", buckets: "Heating", popularity: 57 },

  // --- Insulation, energy, damp ---
  {
    label: "External Wall Insulation",
    synonyms: ["EWI"],
    buckets: "Energy",
    popularity: 60,
  },
  {
    label: "Internal Wall Insulation",
    synonyms: ["IWI"],
    buckets: "Energy",
    popularity: 40,
  },
  { label: "Cavity Wall Insulation", buckets: "Energy", popularity: 45 },
  { label: "Loft Insulation", buckets: "Energy", popularity: 58 },
  { label: "Roof Insulation", buckets: "Energy", popularity: 44 },
  { label: "Damp Proofing", buckets: "Specialist", popularity: 56 },
  { label: "Timber Treatment", buckets: "Specialist", popularity: 34 },

  // --- Interiors & finishes (extra) ---
  { label: "Cabinet Maker", buckets: "Interiors", popularity: 40 },
  {
    label: "Dryliner / Partitions",
    synonyms: ["Dryliner", "Partition"],
    buckets: "Interiors",
    popularity: 42,
  },
  { label: "Suspended Ceilings", buckets: "Interiors", popularity: 28 },
  { label: "Skylights / Rooflights", buckets: "Exterior", popularity: 38 },
  { label: "Sash Window Specialist", buckets: "Exterior", popularity: 26 },
  { label: "Shutters / Blinds", buckets: "Finishes", popularity: 30 },
  { label: "Curtains / Soft Furnishings", buckets: "Finishes", popularity: 22 },
  { label: "Carpet Fitter", buckets: "Finishes", popularity: 48 },
  { label: "Vinyl / LVT Fitter", buckets: "Finishes", popularity: 45 },
  { label: "Wood Floor Sanding", buckets: "Finishes", popularity: 33 },
  { label: "Stone Worktops", buckets: "Interiors", popularity: 25 },

  // --- Specialist services ---
  {
    label: "Smart Home / AV",
    synonyms: ["Home Automation", "AV"],
    buckets: "Electrical",
    popularity: 34,
  },
  { label: "Security / Alarms / CCTV", buckets: "Electrical", popularity: 52 },
  { label: "Fire Safety", buckets: "Specialist", popularity: 30 },
  { label: "Sprinklers", buckets: "Specialist", popularity: 18 },
  { label: "Swimming Pools", buckets: "Specialist", popularity: 12 },
  { label: "Sauna / Steam", buckets: "Specialist", popularity: 10 },
  { label: "Handyman", buckets: "General", popularity: 70 },
  { label: "Cleaning (Builders Clean)", buckets: "Support", popularity: 36 },
  { label: "Waste Removal / Skip Hire", buckets: "Support", popularity: 46 },

  // --- Compliance & design ---
  { label: "Architect", buckets: "Professional", popularity: 55 },
  { label: "Structural Engineer", buckets: "Professional", popularity: 50 },
  { label: "Party Wall Surveyor", buckets: "Professional", popularity: 25 },
  {
    label: "Building Control (Approved Inspector)",
    buckets: "Professional",
    popularity: 20,
  },
];

// Convenience: flat list of active labels
export const ALL_TRADE_LABELS = TRADE_TYPES.filter(
  (t) => t.active !== false
).map((t) => t.label);
