// server/lib/matching/projectTradeMap.js
//
// Canonical mapping from a project's `type` string (one of the entries in
// web/types/projectTypes.ts ALL_PROJECT_TYPES) to the trade labels that
// can do the work (matching web/types/tradeTypes.ts TRADE_TYPES.label).
//
// The classifier seeds `recommended_trades` from this map so matching can
// be a simple set intersection against `tradesmen.trade_types`. No fuzzy
// matching, no string stemming, no false positives.
//
// Strategy: every project type belongs to a category. The category gets a
// default set of trades. Per-type overrides exist for niche cases where
// the category default is too broad (e.g. "Bathroom Tiling" really only
// needs Tilers + Bathroom Fitters, not Plumbers).
//
// Adding a new project type:
//   1) Add it to web/types/projectTypes.ts (the catalog frontend reads).
//   2) Make sure CATEGORY_TRADES below covers its category.
//   3) Optional: add a TYPE_TRADES override if the category default is
//      wrong for this specific type.
//
// All trade labels MUST match the `label` field in TRADE_TYPES (case-
// sensitive). A drift here silently kills matching - hence the test
// guard alongside this file.

// Default trades per category. Used when no per-type override exists.
const CATEGORY_TRADES = {
  "Accessibility & Safety": [
    "General Builder",
    "Carpenter / Joiner",
    "Plumber",
    "Electrician",
    "Bathroom Fitter",
    "Handyman",
    "Fire Safety",
  ],
  "Appliances": [
    "Plumber",
    "Electrician",
    "Gas Engineer",
    "Kitchen Fitter",
    "Handyman",
  ],
  "Bathroom": [
    "Bathroom Fitter",
    "Plumber",
    "Tiler",
    "General Builder",
    "Electrician",
  ],
  "Bedroom": [
    "General Builder",
    "Carpenter / Joiner",
    "Painter / Decorator",
    "Plasterer",
    "Electrician",
    "Flooring Specialist",
    "Carpet Fitter",
  ],
  "Building & Construction": [
    "General Builder",
    "Bricklayer",
    "Stonemason",
    "Groundworker",
    "Structural Engineer",
    "Extension Builder",
    "New Build",
    "Loft Conversion Specialist",
    "Garage Conversion",
    "Basement Conversion",
    "Damp Proofing",
  ],
  "Carpentry & Joinery": [
    "Carpenter / Joiner",
    "Cabinet Maker",
    "Kitchen Fitter",
    "Handyman",
  ],
  "Cleaning & Waste": [
    "Cleaning (Builders Clean)",
    "End of Tenancy Cleaning",
    "Deep / One-off Cleaning",
    "Regular / Domestic Cleaning",
    "Carpet & Upholstery Cleaning",
    "Oven Cleaning",
    "Window Cleaning",
    "Gutter Cleaning",
    "Pressure / Jet Washing",
    "Driveway & Patio Cleaning",
    "Roof / Moss Removal",
    "Commercial / Office Cleaning",
    "Bin Cleaning",
    "Chimney Sweeping",
    "Mould / Sanitisation Cleaning",
    "Solar Panel Cleaning",
    "Waste Removal / Skip Hire",
  ],
  "Damp & Waterproofing": [
    "Damp Proofing",
    "Timber Treatment",
    "General Builder",
  ],
  "Electrical": [
    "Electrician",
    "Security / Alarms / CCTV",
    "Smart Home / AV",
  ],
  "Energy & Renewables": [
    "Solar PV",
    "Solar Thermal",
    "Heat Pumps",
    "Heating Engineer",
    "Electrician",
  ],
  "Extensions & Conversions": [
    "Extension Builder",
    "Loft Conversion Specialist",
    "Garage Conversion",
    "Basement Conversion",
    "General Builder",
    "New Build",
    "Architect",
    "Structural Engineer",
  ],
  "Exterior & Structure": [
    "General Builder",
    "Bricklayer",
    "Stonemason",
    "Plasterer",
    "Roofer",
  ],
  "Fencing & Gates": [
    "Fencing",
    "Landscaper",
    "Carpenter / Joiner",
  ],
  "Flooring": [
    "Flooring Specialist",
    "Carpet Fitter",
    "Vinyl / LVT Fitter",
    "Tiler",
    "Wood Floor Sanding",
    "Underfloor Heating",
  ],
  "Heating & Cooling": [
    "Heating Engineer",
    "Boiler Installer",
    "Gas Engineer",
    "Plumber",
    "Air Conditioning",
    "Heat Pumps",
    "Underfloor Heating",
  ],
  "Insulation": [
    "Cavity Wall Insulation",
    "External Wall Insulation",
    "Internal Wall Insulation",
    "Loft Insulation",
    "Roof Insulation",
    "General Builder",
  ],
  "Kitchen": [
    "Kitchen Fitter",
    "Plumber",
    "Electrician",
    "Tiler",
    "Carpenter / Joiner",
    "Cabinet Maker",
    "Stone Worktops",
    "General Builder",
  ],
  "Landscaping & Garden": [
    "Landscaper",
    "Driveways / Paving",
    "Decking",
    "Fencing",
    "Garden Rooms / Offices",
  ],
  "Metalwork & Fabrication": [
    "Steel Fabrication",
    "Structural Engineer",
  ],
  "Painting & Decorating": [
    "Painter / Decorator",
    "Plasterer",
  ],
  "Pest Control": [
    // Pest Control isn't currently in TRADE_TYPES - homeowners posting
    // these projects will see an empty deck until a Pest Control trade
    // type is added to the catalog. Documented limitation.
  ],
  "Plumbing": [
    "Plumber",
    "Heating Engineer",
    "Drainage Specialist",
    "Gas Engineer",
  ],
  "Repairs & Maintenance": [
    "Handyman",
    "General Builder",
    "Electrician",
    "Plumber",
    "Carpenter / Joiner",
  ],
  "Roofing": [
    "Roofer",
    "Thatched Roofing",
    "Skylights / Rooflights",
    "Roof Insulation",
  ],
  "Smart Home & Security": [
    "Smart Home / AV",
    "Security / Alarms / CCTV",
    "Electrician",
  ],
  "Tiling & Plastering": [
    "Tiler",
    "Plasterer",
    "Dryliner / Partitions",
    "Suspended Ceilings",
  ],
  "Windows & Doors": [
    "Window / Door Fitter",
    "Glazier",
    "Sash Window Specialist",
    "Carpenter / Joiner",
    "Skylights / Rooflights",
  ],
};

// Per-type overrides where the category default is wrong or too broad.
// Keep this map small - if you find yourself adding 10+ overrides for one
// category, the category default is the thing that needs revising.
const TYPE_TRADES = {
  // Bathroom: tiling is only Tiler + Bathroom Fitter, not Plumber/Electrician.
  "Bathroom Tiling": ["Tiler", "Bathroom Fitter"],
  "Bathroom Flooring": ["Flooring Specialist", "Tiler", "Vinyl / LVT Fitter", "Bathroom Fitter"],
  // Bathroom plumbing - just plumbers.
  "Bathroom Plumbing": ["Plumber"],
  // Kitchen: tiling/flooring don't need plumber/electrician.
  "Kitchen Tiling & Splashback": ["Tiler", "Kitchen Fitter"],
  "Kitchen Flooring": ["Flooring Specialist", "Tiler", "Vinyl / LVT Fitter"],
  "Kitchen Plumbing": ["Plumber"],
  "Kitchen Electrical Upgrade": ["Electrician"],
  "Worktop/Countertop Replacement": ["Stone Worktops", "Kitchen Fitter", "Carpenter / Joiner"],
  // Heating sub-types
  "Boiler Installation": ["Boiler Installer", "Heating Engineer", "Gas Engineer"],
  "Boiler Repair": ["Boiler Installer", "Heating Engineer", "Gas Engineer"],
  "Boiler Service": ["Boiler Installer", "Heating Engineer", "Gas Engineer"],
  // Energy
  "Solar PV Installation": ["Solar PV", "Electrician"],
  "Solar Thermal (Hot Water)": ["Solar Thermal", "Plumber"],
  "Heat Pump (Air Source)": ["Heat Pumps", "Heating Engineer"],
  "Heat Pump (Ground Source)": ["Heat Pumps", "Heating Engineer", "Groundworker"],
};

// Project type → category. Mirrors web/types/projectTypes.ts. Kept here so
// the server doesn't need to import the TS catalog. If you add a project
// type to the frontend catalog, add it here too (or accept that matching
// will fall back to "no category found" → empty trade list → zero deck).
const TYPE_TO_CATEGORY = {
  // Accessibility & Safety
  "Accessible Bathroom Adaptation": "Accessibility & Safety",
  "Accessible Bedroom Adaptation": "Accessibility & Safety",
  "Accessible Kitchen Adaptation": "Accessibility & Safety",
  "Fire Door Installation": "Accessibility & Safety",
  "Fire Risk Assessment": "Accessibility & Safety",
  "Grab Rails & Aids": "Accessibility & Safety",
  "Handrail Installation": "Accessibility & Safety",
  "Non-slip Flooring": "Accessibility & Safety",
  "Smoke/Heat/CO Alarm Installation": "Accessibility & Safety",
  "Stairlift Installation": "Accessibility & Safety",
  "Wheelchair Ramps": "Accessibility & Safety",
  "Widen Doorways/Thresholds": "Accessibility & Safety",
  "Walk-in Bath Installation": "Accessibility & Safety",
  "Walk-in Shower/Wet Room": "Accessibility & Safety",

  // Appliances
  "Cooker/Oven Installation": "Appliances",
  "Dishwasher Installation": "Appliances",
  "Extractor Hood Installation": "Appliances",
  "Fridge/Freezer Installation": "Appliances",
  "Gas Appliance Installation": "Appliances",
  "Induction Hob Installation": "Appliances",
  "Microwave Housing/Fitting": "Appliances",
  "Tumble Dryer Installation": "Appliances",
  "Washer/Dryer Installation": "Appliances",
  "Water Softener/Filter Installation": "Appliances",

  // Bathroom
  "Bathroom Design & Planning": "Bathroom",
  "Bathroom Plumbing": "Bathroom",
  "Bathroom Refresh (Partial)": "Bathroom",
  "Bathroom Remodel (Full)": "Bathroom",
  "Bathroom Ventilation Upgrade": "Bathroom",
  "Bathroom Waterproofing": "Bathroom",
  "Bath Installation/Replacement": "Bathroom",
  "Extractor Fan Installation": "Bathroom",
  "Heated Towel Rail Installation": "Bathroom",
  "New Bathroom Installation": "Bathroom",
  "Shower Installation/Replacement": "Bathroom",
  "Shower Enclosure Installation": "Bathroom",
  "Sink & Vanity Installation": "Bathroom",
  "Toilet Installation/Replacement": "Bathroom",
  "Underfloor Heating (Bathroom)": "Bathroom",
  "Wet Room Installation": "Bathroom",
  "Bathroom Tiling": "Bathroom",
  "Bathroom Flooring": "Bathroom",

  // Bedroom
  "Bedroom Design & Planning": "Bedroom",
  "Bedroom Refurbishment (Full)": "Bedroom",
  "Bedroom Refresh (Partial)": "Bedroom",
  "Bedroom Redecoration": "Bedroom",
  "Bedroom Flooring Installation": "Bedroom",
  "Bedroom Carpet Fitting": "Bedroom",
  "Bedroom Laminate/LVT Installation": "Bedroom",
  "Bedroom Wood Floor Sanding/Restoration": "Bedroom",
  "Bedroom Painting": "Bedroom",
  "Bedroom Wallpapering": "Bedroom",
  "Bedroom Plastering/Skimming": "Bedroom",
  "Bedroom Ceiling Repair": "Bedroom",
  "Bedroom Lighting Installation": "Bedroom",
  "Bedroom Additional Sockets": "Bedroom",
  "Bedroom Radiator Installation/Replacement": "Bedroom",
  "Bedroom Radiator Relocation": "Bedroom",
  "Bedroom Underfloor Heating": "Bedroom",
  "Bedroom Insulation Upgrade": "Bedroom",
  "Bedroom Soundproofing": "Bedroom",
  "Fitted Wardrobes (Bedroom)": "Bedroom",
  "Built-in Storage (Bedroom)": "Bedroom",
  "Bespoke Wardrobes (Bedroom)": "Bedroom",
  "Alcove Units (Bedroom)": "Bedroom",
  "Shelving Installation (Bedroom)": "Bedroom",
  "Bedroom Door Installation/Replacement": "Bedroom",
  "Bedroom Internal Door Hanging": "Bedroom",
  "Bedroom Window Replacement": "Bedroom",
  "Bedroom Triple Glazing Upgrade": "Bedroom",
  "Bedroom Blinds/Curtains Installation": "Bedroom",

  // Building & Construction
  "Basement Dig-Out": "Building & Construction",
  "Basement Conversion": "Building & Construction",
  "Blockwork Construction": "Building & Construction",
  "Brickwork Repair": "Building & Construction",
  "Building Regulations Consultation": "Building & Construction",
  "Concrete Foundations": "Building & Construction",
  "Concrete Slab Pouring": "Building & Construction",
  "Damp Proof Course Installation": "Building & Construction",
  "Demolition (Internal/External)": "Building & Construction",
  "Doorway/Wall Opening (RSJ Installation)": "Building & Construction",
  "Drylining & Partition Walls": "Building & Construction",
  "Garage Conversion": "Building & Construction",
  "General Building Work": "Building & Construction",
  "House Extension (Planning & Build)": "Building & Construction",
  "Internal Wall Removal": "Building & Construction",
  "Loft Conversion (Dormer)": "Building & Construction",
  "Loft Conversion (Hip-to-Gable)": "Building & Construction",
  "Loft Conversion (Mansard)": "Building & Construction",
  "Masonry Repair": "Building & Construction",
  "New Build House": "Building & Construction",
  "New Internal Walls/Studwork": "Building & Construction",
  "Property Refurbishment (Full)": "Building & Construction",
  "Retaining Wall Construction": "Building & Construction",
  "RSJ/Steel Beam Installation": "Building & Construction",
  "Underpinning": "Building & Construction",
  "Wrap-around Extension": "Building & Construction",

  // Carpentry & Joinery
  "Alcove Units": "Carpentry & Joinery",
  "Bespoke Cabinetry": "Carpentry & Joinery",
  "Bespoke Wardrobes": "Carpentry & Joinery",
  "Bookshelves & Storage": "Carpentry & Joinery",
  "Decking (Timber/Composite)": "Carpentry & Joinery",
  "Door Frame & Architrave": "Carpentry & Joinery",
  "Fitted Wardrobes": "Carpentry & Joinery",
  "Handrails & Balustrades": "Carpentry & Joinery",
  "Internal Door Hanging": "Carpentry & Joinery",
  "Joinery Repairs": "Carpentry & Joinery",
  "Kitchen Fitting (Carpentry)": "Carpentry & Joinery",
  "Media/TV Wall Unit": "Carpentry & Joinery",
  "Skirting Boards": "Carpentry & Joinery",
  "Staircase Build/Renovation": "Carpentry & Joinery",
  "Stud Walls & Partitioning": "Carpentry & Joinery",
  "Window Seats": "Carpentry & Joinery",
  "Shelving Installation": "Carpentry & Joinery",

  // Cleaning & Waste
  "Builders’ Clean": "Cleaning & Waste",
  "Carpet Cleaning": "Cleaning & Waste",
  "Deep Clean (Kitchen/Bathroom)": "Cleaning & Waste",
  "End-of-Tenancy Cleaning": "Cleaning & Waste",
  "Gutter Cleaning": "Cleaning & Waste",
  "House Clearance": "Cleaning & Waste",
  "Mould Cleaning": "Cleaning & Waste",
  "Oven Cleaning": "Cleaning & Waste",
  "Pressure Washing": "Cleaning & Waste",
  "Rubbish Removal": "Cleaning & Waste",
  "Skip Hire": "Cleaning & Waste",

  // Damp & Waterproofing
  "Basement Tanking": "Damp & Waterproofing",
  "Condensation Control": "Damp & Waterproofing",
  "Damp Inspection": "Damp & Waterproofing",
  "Damp Proof Course": "Damp & Waterproofing",
  "Exterior Waterproof Coatings": "Damp & Waterproofing",
  "Mould Remediation": "Damp & Waterproofing",
  "Penetrating Damp Treatment": "Damp & Waterproofing",
  "Rising Damp Treatment": "Damp & Waterproofing",
  "Waterproofing (General)": "Damp & Waterproofing",

  // Electrical
  "Additional Sockets": "Electrical",
  "CCTV & Security Cameras": "Electrical",
  "Consumer Unit/Fuse Box Upgrade": "Electrical",
  "Data & Networking": "Electrical",
  "Doorbell/Intercom Installation": "Electrical",
  "Downlights/Spotlights": "Electrical",
  "EICR (Electrical Safety Test)": "Electrical",
  "EV Charger Installation": "Electrical",
  "Exterior Lighting": "Electrical",
  "Full Rewire": "Electrical",
  "Lighting Installation (Interior)": "Electrical",
  "Partial Rewire": "Electrical",
  "Smart Switch Installation": "Electrical",
  "Underfloor Heating (Electric)": "Electrical",
  "Extractor Fan Wiring": "Electrical",

  // Energy & Renewables
  "Battery Storage Installation": "Energy & Renewables",
  "Energy Audit/EPC Upgrade": "Energy & Renewables",
  "Heat Pump (Air Source)": "Energy & Renewables",
  "Heat Pump (Ground Source)": "Energy & Renewables",
  "MVHR/Ventilation System": "Energy & Renewables",
  "Smart Metering (Client-side)": "Energy & Renewables",
  "Solar PV Installation": "Energy & Renewables",
  "Solar Thermal (Hot Water)": "Energy & Renewables",

  // Extensions & Conversions
  "Double-storey Extension": "Extensions & Conversions",
  "Garden Room/Annexe": "Extensions & Conversions",
  "Orangery/Conservatory": "Extensions & Conversions",
  "Rear/Side Return Extension": "Extensions & Conversions",
  "Single-storey Extension": "Extensions & Conversions",
  "Structural Openings": "Extensions & Conversions",

  // Exterior & Structure
  "Boundary Walls": "Exterior & Structure",
  "Cladding Installation": "Exterior & Structure",
  "Exterior Repairs": "Exterior & Structure",
  "Exterior Stairs/Handrails": "Exterior & Structure",
  "House Repointing": "Exterior & Structure",
  "Monocouche/Coloured Render": "Exterior & Structure",
  "Pathways & Steps": "Exterior & Structure",
  "Pebble Dash Removal": "Exterior & Structure",
  "Porch/Canopy Build": "Exterior & Structure",
  "Rendering (Cement)": "Exterior & Structure",
  "Siding/Cladding": "Exterior & Structure",

  // Fencing & Gates
  "Fence Repair": "Fencing & Gates",
  "Fence Replacement": "Fencing & Gates",
  "Garden Gate Installation": "Fencing & Gates",
  "Security Fencing": "Fencing & Gates",
  "Timber Fence Installation": "Fencing & Gates",
  "Composite Fence Installation": "Fencing & Gates",
  "Panel Fence Installation": "Fencing & Gates",
  "Post & Rail Installation": "Fencing & Gates",
  "Picket Fencing": "Fencing & Gates",

  // Flooring
  "Carpet Fitting": "Flooring",
  "Carpet Removal": "Flooring",
  "Cork Flooring": "Flooring",
  "Engineered Wood Installation": "Flooring",
  "Floor Levelling": "Flooring",
  "Floor Sanding & Refinishing": "Flooring",
  "Laminate Installation": "Flooring",
  "Parquet Installation": "Flooring",
  "Stone Flooring": "Flooring",
  "Subfloor Repair": "Flooring",
  "Tile Flooring": "Flooring",
  "Underfloor Heating (Whole House)": "Flooring",
  "Vinyl/LVT Installation": "Flooring",
  "Wood Floor Restoration": "Flooring",

  // Landscaping & Garden
  "Artificial Grass Installation": "Landscaping & Garden",
  "Drainage & Soakaways": "Landscaping & Garden",
  "Driveway (Block)": "Landscaping & Garden",
  "Driveway (Resin)": "Landscaping & Garden",
  "Driveway (Tarmac)": "Landscaping & Garden",
  "Fence/Gate Installation": "Landscaping & Garden",
  "Garden Clearance": "Landscaping & Garden",
  "Garden Design & Build": "Landscaping & Garden",
  "Garden Drainage": "Landscaping & Garden",
  "Garden Irrigation System": "Landscaping & Garden",
  "Garden Lighting": "Landscaping & Garden",
  "Garden Paths": "Landscaping & Garden",
  "Garden Turfing": "Landscaping & Garden",
  "Garden Wall Construction": "Landscaping & Garden",
  "Gazebo/Pergola Installation": "Landscaping & Garden",
  "Patio/Paving": "Landscaping & Garden",
  "Planting & Soft Landscaping": "Landscaping & Garden",
  "Pond/Water Feature": "Landscaping & Garden",
  "Retaining Walls (Garden)": "Landscaping & Garden",
  "Shed/Base Installation": "Landscaping & Garden",

  // Heating & Cooling
  "Air Conditioning Installation": "Heating & Cooling",
  "Boiler Installation": "Heating & Cooling",
  "Boiler Repair": "Heating & Cooling",
  "Boiler Service": "Heating & Cooling",
  "Flue & Chimney Liner": "Heating & Cooling",
  "Heat Pump Installation": "Heating & Cooling",
  "Radiator Installation": "Heating & Cooling",
  "Radiator Relocation": "Heating & Cooling",
  "Smart Thermostat Installation": "Heating & Cooling",
  "Underfloor Heating (Wet)": "Heating & Cooling",

  // Insulation
  "Cavity Wall Insulation": "Insulation",
  "Draught Proofing": "Insulation",
  "External Wall Insulation": "Insulation",
  "Floor Insulation": "Insulation",
  "Garage Insulation": "Insulation",
  "Internal Wall Insulation": "Insulation",
  "Loft Insulation": "Insulation",
  "Pipe & Tank Lagging": "Insulation",
  "Room-in-Roof Insulation": "Insulation",
  "Soundproofing": "Insulation",
  "Underfloor Insulation": "Insulation",

  // Kitchen
  "Appliance Installation": "Kitchen",
  "Cabinet Installation": "Kitchen",
  "Cabinet Refacing/Respraying": "Kitchen",
  "Kitchen Design & Planning": "Kitchen",
  "Kitchen Electrical Upgrade": "Kitchen",
  "Kitchen Flooring": "Kitchen",
  "Kitchen Island Build": "Kitchen",
  "Kitchen Plumbing": "Kitchen",
  "Kitchen Refresh (Partial)": "Kitchen",
  "Kitchen Remodel (Full)": "Kitchen",
  "Kitchen Tiling & Splashback": "Kitchen",
  "New Kitchen Installation": "Kitchen",
  "Pantry/Utility Fit-out": "Kitchen",
  "Worktop/Countertop Replacement": "Kitchen",

  // Metalwork & Fabrication
  "Balustrade Fabrication": "Metalwork & Fabrication",
  "Custom Metal Gates": "Metalwork & Fabrication",
  "Fabricated Steel Supports": "Metalwork & Fabrication",
  "Handrails (Metal)": "Metalwork & Fabrication",
  "Metal Welding Repairs": "Metalwork & Fabrication",
  "Security Grilles": "Metalwork & Fabrication",
  "Steel Staircases": "Metalwork & Fabrication",

  // Painting & Decorating
  "Decorative Finishes": "Painting & Decorating",
  "Exterior Painting": "Painting & Decorating",
  "Interior Painting": "Painting & Decorating",
  "Spray Painting (Joinery)": "Painting & Decorating",
  "Surface Prep & Repairs": "Painting & Decorating",
  "Wallpaper Hanging": "Painting & Decorating",
  "Wallpaper Removal": "Painting & Decorating",
  "Woodwork Painting": "Painting & Decorating",

  // Pest Control
  "Bed Bug Treatment": "Pest Control",
  "Bird Proofing": "Pest Control",
  "Flea Treatment": "Pest Control",
  "Mouse/Rat Control": "Pest Control",
  "Pest Inspection": "Pest Control",
  "Wasp Nest Removal": "Pest Control",

  // Plumbing
  "Blocked Drain": "Plumbing",
  "Emergency Leak Repair": "Plumbing",
  "General Plumbing Repairs": "Plumbing",
  "Macerator/Saniflo Installation": "Plumbing",
  "New Pipework/Repiping": "Plumbing",
  "Outdoor Tap Installation": "Plumbing",
  "Unvented Cylinder Installation": "Plumbing",
  "Water Softener Installation": "Plumbing",

  // Repairs & Maintenance
  "Ceiling Repairs": "Repairs & Maintenance",
  "Door Repairs": "Repairs & Maintenance",
  "General Repairs": "Repairs & Maintenance",
  "Gutter Repairs": "Repairs & Maintenance",
  "Handyman Tasks": "Repairs & Maintenance",
  "Small Electrical Jobs": "Repairs & Maintenance",
  "Small Plumbing Jobs": "Repairs & Maintenance",
  "Wall Repairs": "Repairs & Maintenance",
  "Window Repairs": "Repairs & Maintenance",

  // Roofing
  "Chimney Repair/Removal": "Roofing",
  "EPDM/Rubber Roof": "Roofing",
  "Fascias & Soffits": "Roofing",
  "Flat Roof Repair/Replacement": "Roofing",
  "GRP/Fibreglass Roof": "Roofing",
  "Guttering & Downpipes": "Roofing",
  "Leadwork & Flashing": "Roofing",
  "New Roof Installation": "Roofing",
  "Pitched Roof Repair/Replacement": "Roofing",
  "Re-roofing": "Roofing",
  "Roof Repair": "Roofing",
  "Roof Tiling": "Roofing",
  "Roof Windows / Velux": "Roofing",
  "Slate Roof": "Roofing",
  "Tile Roof": "Roofing",
  "Roof Insulation": "Roofing",

  // Smart Home & Security
  "Access Control & Smart Locks": "Smart Home & Security",
  "Alarm System Installation": "Smart Home & Security",
  "AV/Surround Sound Setup": "Smart Home & Security",
  "CCTV Installation": "Smart Home & Security",
  "Smart Heating Controls": "Smart Home & Security",
  "Smart Lighting": "Smart Home & Security",
  "Video Doorbell/Intercom": "Smart Home & Security",
  "Whole-home Wi-Fi/Networking": "Smart Home & Security",

  // Tiling & Plastering
  "Artex Removal": "Tiling & Plastering",
  "Ceiling Repair/Replacement": "Tiling & Plastering",
  "Coving & Cornice": "Tiling & Plastering",
  "Drywall/Plasterboard": "Tiling & Plastering",
  "Dot & Dab": "Tiling & Plastering",
  "Floor Tiling": "Tiling & Plastering",
  "Plaster Skimming": "Tiling & Plastering",
  "Stone/Marble Tiling": "Tiling & Plastering",
  "Tank & Waterproof (Wet Areas)": "Tiling & Plastering",
  "Wall Tiling": "Tiling & Plastering",

  // Windows & Doors
  "Bi-fold Door Installation": "Windows & Doors",
  "Door Frame Repair": "Windows & Doors",
  "Front Door Replacement": "Windows & Doors",
  "Garage Door Replacement": "Windows & Doors",
  "Patio/French Door Installation": "Windows & Doors",
  "Sash Window Repair/Replacement": "Windows & Doors",
  "Secondary Glazing": "Windows & Doors",
  "Triple Glazing Upgrade": "Windows & Doors",
  "Window Replacement (uPVC)": "Windows & Doors",
  "Window Replacement (Aluminium)": "Windows & Doors",
  "Window Replacement (Timber)": "Windows & Doors",
  "Window Repair": "Windows & Doors",
};

function normalise(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

// Token sets per known project type, for the fuzzy fallback below. Built
// once on module load.
const TYPE_TOKENS = new Map();
for (const type of Object.keys(TYPE_TO_CATEGORY)) {
  const tokens = new Set(normalise(type).split(/\s+/).filter(Boolean));
  TYPE_TOKENS.set(type, tokens);
}

/**
 * Returns the canonical trade labels capable of doing the given project
 * type. Per-type override wins over category default. Falls back to a
 * fuzzy lookup when the input isn't an exact PROJECT_TYPES entry (the
 * homeowner may have typed freeform text, or an older catalog version
 * used different wording). Returns an empty array only when there's no
 * usable match - the caller should treat that as "no taxonomy hit; let
 * the LLM/stub recommend_trades stand."
 *
 * @param {string} projectType  The project's `type` column value.
 * @returns {string[]}
 */
function getTradesForProjectType(projectType) {
  if (!projectType || typeof projectType !== "string") return [];
  const trimmed = projectType.trim();
  if (!trimmed) return [];

  // Exact match (fast path).
  const override = TYPE_TRADES[trimmed];
  if (override) return [...override];
  const category = TYPE_TO_CATEGORY[trimmed];
  if (category) {
    const fromCategory = CATEGORY_TRADES[category];
    if (fromCategory) return [...fromCategory];
  }

  // Fuzzy fallback: pick the catalog entry whose token set has the
  // largest overlap with the input. "Wet Room Conversion" (not in the
  // catalog) finds "Wet Room Installation" (is in the catalog) via
  // overlap on {wet, room}.
  const inputTokens = new Set(normalise(trimmed).split(/\s+/).filter(Boolean));
  if (inputTokens.size === 0) return [];
  let bestType = null;
  let bestScore = 0;
  for (const [knownType, tokens] of TYPE_TOKENS) {
    let score = 0;
    for (const t of inputTokens) if (tokens.has(t)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestType = knownType;
    }
  }
  if (!bestType || bestScore === 0) return [];
  // Recurse with the matched canonical type to get its trades.
  return getTradesForProjectType(bestType);
}

module.exports = {
  CATEGORY_TRADES,
  TYPE_TRADES,
  TYPE_TO_CATEGORY,
  getTradesForProjectType,
};
