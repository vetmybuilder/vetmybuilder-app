#!/usr/bin/env node
/**
 * Seed ~100 lifelike "ghost" tradesperson profiles whose chats and match
 * notifications all funnel to a single master operator. Used on staging
 * so friends-and-family testers see a populated marketplace without us
 * needing 100 real trade testers.
 *
 * Production never runs this script. Ghost rows are tagged is_seed=1 and
 * master_uid=<master> so we can wipe + regenerate them without touching
 * real data.
 *
 * Usage:
 *   MASTER_UID=<firebase-uid> node scripts/seed-ghost-trades.js
 *   node scripts/seed-ghost-trades.js --master=<firebase-uid> --count=100
 *
 * The script will:
 *   1. Wipe ghosts that already belong to MASTER_UID (is_seed=1).
 *   2. Insert N new tradesmen rows + tradesmen_photos + user_roles.
 *   3. Print a summary of what was created.
 */

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const { logger } = require("../server/lib/logger");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

// Per-trade ghost count. Default 30 means every canonical trade label
// gets at least 30 dedicated ghosts as its primary trade, plus extras
// from other trades' secondaries - so any project surfaces 30-60+
// matching ghosts.
const PER_TRADE = Number.isFinite(Number(args.perTrade))
  ? Number(args.perTrade)
  : Number.isFinite(Number(args.count))
    ? Number(args.count)
    : 30;
const MASTER_UID = args.master || process.env.MASTER_UID;
const DB_NAME = args.db || process.env.MYSQL_DATABASE || "vetmybuilder";

if (!MASTER_UID) {
  console.error(
    "ERROR: MASTER_UID is required (env var or --master=<uid>).\n" +
      "       This is the Firebase uid of the operator who will receive\n" +
      "       all chat notifications + replies for the seeded ghosts.",
  );
  process.exit(1);
}

const TAG = "[seed-ghost-trades]";

// ---------- helpers ----------
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const sample = (arr, k) => {
  const copy = [...arr];
  const out = [];
  while (out.length < Math.min(k, arr.length) && copy.length) {
    out.push(copy.splice(rand(0, copy.length - 1), 1)[0]);
  }
  return out;
};
const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const nowSql = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};
const ghostUid = () => `ghost_${crypto.randomBytes(11).toString("hex")}`;
const uuidv4 = () => crypto.randomUUID();

// ---------- canonical pools (DERIVED) ----------
//
// Single source of truth = web/types/trades.data.json. We derive both
// ALL_TRADES (the flat label list) and BUCKETS (bucket → labels[]) from
// it, so adding a new trade means editing only that one file. The
// drift-guard test in tests/server/matching/tradeCatalog.spec.ts will
// fail if anything here gets out of sync.
//
// EXTRA_BUCKET_ADJACENCIES adds cross-bucket ghosts for trades that
// commonly span specialties (a Plumber-primary ghost reasonably also
// lists Heating Engineer as a secondary). Without it, secondary picks
// are strictly within the same bucket per the catalog.
const TRADE_CATALOG = require("../web/types/trades.data.json");

// Filter to trades that serve at least one currently-live project category.
// Source of truth: the same DEFAULT_ENABLED_CATEGORIES set used by the
// pilot project-type gate, x-referenced against CATEGORY_TRADES.
// When you flip a new category live in admin, update DEFAULT_ENABLED_CATEGORIES
// in server/lib/pilotProjectTypes.js and re-run this seed - the trade list
// here picks up the change automatically.
const {
  DEFAULT_ENABLED_CATEGORIES,
} = require("../server/lib/pilotProjectTypes");
const {
  CATEGORY_TRADES,
} = require("../server/lib/matching/projectTradeMap");

const LIVE_TRADES = (() => {
  const trades = new Set();
  for (const cat of DEFAULT_ENABLED_CATEGORIES) {
    for (const t of CATEGORY_TRADES[cat] || []) trades.add(t);
  }
  return trades;
})();

const ALL_TRADES = TRADE_CATALOG
  .filter((t) => t.active !== false)
  .map((t) => t.label)
  .filter((label) => LIVE_TRADES.has(label))
  .sort();

const BUCKETS = (() => {
  const out = {};
  for (const t of TRADE_CATALOG) {
    if (t.active === false) continue;
    if (!t.buckets) continue;
    (out[t.buckets] ||= []).push(t.label);
  }
  return out;
})();

const EXTRA_BUCKET_ADJACENCIES = {
  Plumbing: ["Heating", "HVAC"],
  Heating: ["Plumbing"],
  HVAC: ["Heating"],
  Renewables: ["Heating"],
  Insulation: ["Structure"],
};

// Cross-bucket label additions for trades that naturally span specialties
// the bucket model can't capture. Keyed by primary trade label, value is
// a list of canonical labels added to its secondary-pool. Used to keep
// Plumber-primary ghosts surfacing Bathroom Fitter / Drainage etc. even
// though those live in other buckets per the catalog.
const EXTRA_TRADE_LINKS = {
  "Plumber": ["Bathroom Fitter", "Drainage Specialist", "Boiler Installer", "Heating Engineer"],
  "Heating Engineer": ["Plumber", "Boiler Installer", "Gas Engineer"],
  "Bathroom Fitter": ["Plumber", "Tiler", "Electrician"],
  "Kitchen Fitter": ["Carpenter / Joiner", "Tiler", "Electrician", "Plumber"],
  "Electrician": ["Security / Alarms / CCTV", "Smart Home / AV"],
  "Roofer": ["Gutter Cleaning", "Roof / Moss Removal", "Skylights / Rooflights"],
  "Extension Builder": ["General Builder", "Bricklayer", "Groundworker", "Structural Engineer"],
  "Loft Conversion Specialist": ["Carpenter / Joiner", "Plasterer", "Electrician"],
};

// Reverse lookup: trade label -> the buckets it belongs to. Many trades
// span 2-3 buckets (e.g. Heating Engineer is in Plumbing, Heating, HVAC).
const TRADE_BUCKETS = (() => {
  const out = {};
  for (const [bucket, trades] of Object.entries(BUCKETS)) {
    for (const t of trades) {
      (out[t] ||= []).push(bucket);
    }
  }
  return out;
})();

// Pick 2 secondary trades for a ghost whose primary is `trade`. Pulled
// from the buckets the primary belongs to (plus the EXTRA_BUCKET_ADJACENCIES
// for cross-bucket overlaps like Plumbing<>Heating), so they read as natural
// upsell ("we also do X") rather than a random hodgepodge.
function pickSecondaries(trade) {
  const myBuckets = new Set(TRADE_BUCKETS[trade] || []);
  for (const b of [...myBuckets]) {
    for (const adj of EXTRA_BUCKET_ADJACENCIES[b] || []) myBuckets.add(adj);
  }
  const candidates = new Set();
  for (const b of myBuckets) {
    for (const t of BUCKETS[b] || []) candidates.add(t);
  }
  for (const t of EXTRA_TRADE_LINKS[trade] || []) candidates.add(t);
  candidates.delete(trade);
  // Drop secondaries whose trade is not in the live launch set so ghost
  // profiles don't display "we also do <category-that's-coming-soon>".
  for (const t of [...candidates]) {
    if (!LIVE_TRADES.has(t)) candidates.delete(t);
  }
  // Previously this sprinkled "General Builder" + "Handyman" into
  // every ghost's secondary list as "broadly common upsells". That
  // made every project that recommended General Builder (e.g. EWI,
  // extensions, structural work) pull in unrelated specialists -
  // Kitchen Fitters, Sprinklers, Swimming Pools, Curtains, etc -
  // because they all carried "General Builder" as a secondary. The
  // bucket + adjacency map already produces realistic, on-trade
  // upsells, so we no longer force a global cross-bucket link.
  return sample([...candidates], 2);
}

// London postcodes clustered around Waltham Forest (Chris's launch area)
// plus a wider east + north spread so the deck doesn't feel claustrophobic.
const POSTCODES = [
  "E4", "E5", "E7", "E8", "E9", "E10", "E11", "E12", "E15", "E17", "E18",
  "N1", "N4", "N7", "N15", "N16", "N17", "N22",
  "IG1", "IG2", "IG3", "IG5", "IG8", "IG9", "IG10",
  "RM6", "RM8",
];

// Borough labels paired with their typical postcode prefixes - used in
// company names so a few read like local trade names ("Walthamstow
// Plumbing & Heating") rather than every name being surname-led.
const AREA_NAMES = [
  "Walthamstow", "Chingford", "Leyton", "Leytonstone", "Highams Park",
  "Wanstead", "Snaresbrook", "Woodford", "Hackney", "Stoke Newington",
  "Tottenham", "Hornsey", "Crouch End", "Edmonton", "Enfield", "Ilford",
  "Wood Green", "Stratford", "Forest Gate",
];

const LAST_NAMES = [
  "Doherty", "Brennan", "Khan", "Patel", "Singh", "Murphy", "Walsh",
  "Reilly", "Wright", "Hughes", "Mitchell", "Carter", "Edwards",
  "Roberts", "Phillips", "Thompson", "Begum", "Ali", "Hussain",
  "Ahmed", "Iqbal", "Choudhury", "O'Brien", "Connolly", "Nowak",
  "Kowalski", "Nguyen", "Tran", "Adeyemi", "Okafor", "Mensah",
  "Okonkwo", "Stone", "Fletcher", "Lawson", "Marsh", "Hayes",
];

const FIRST_NAMES = [
  "Sam", "Tom", "Joe", "Dan", "Mark", "Paul", "James", "Ryan",
  "Sean", "Adam", "Matt", "Chris", "Dave", "Mike", "Ben", "Liam",
  "Aaron", "Ahmed", "Imran", "Raj", "Asif", "Junaid",
];

const NAME_PATTERNS = [
  ({ surname, area, trade }) => `${surname} ${tradeNoun(trade)} Ltd`,
  ({ surname, area, trade }) => `${surname} & Sons ${tradeNoun(trade)}`,
  ({ surname, area, trade }) => `${area} ${tradeNoun(trade)}`,
  ({ surname, area, trade }) => `${area} ${tradeNoun(trade)} Co.`,
  ({ surname, area, trade }) => `${area} ${tradeNoun(trade)} Services`,
  ({ surname, area, trade }) => `${surname} ${tradeNoun(trade)} & Co.`,
  ({ surname, area, trade }) => `${tradeNoun(trade)} by ${surname}`,
  ({ surname, area, trade }) => `North-East ${tradeNoun(trade)} Ltd`,
];

// Convert canonical trade label to a noun that reads naturally in a
// company name. Don't say "Painter / Decorator Ltd" - say "Decorating".
const TRADE_NOUN = {
  "Air Conditioning": "Air Conditioning",
  "Architect": "Architects",
  "Asbestos Removal": "Asbestos Removal",
  "Basement Conversion": "Basement Conversions",
  "Bathroom Fitter": "Bathrooms",
  "Boiler Installer": "Boilers",
  "Bricklayer": "Brickwork",
  "Building Control (Approved Inspector)": "Building Control",
  "Cabinet Maker": "Cabinetry",
  "Carpenter / Joiner": "Joinery",
  "Carpet Fitter": "Carpets",
  "Cavity Wall Insulation": "Cavity Wall Insulation",
  "Cleaning (Builders Clean)": "Builders Cleans",
  "Curtains / Soft Furnishings": "Curtains & Blinds",
  "Damp Proofing": "Damp Proofing",
  "Decking": "Decking",
  "Drainage Specialist": "Drainage",
  "Driveways / Paving": "Driveways & Paving",
  "Dryliner / Partitions": "Drylining",
  "Electrician": "Electrical",
  "External Wall Insulation": "External Wall Insulation",
  "Extension Builder": "Extensions",
  "Fencing": "Fencing",
  "Fire Safety": "Fire Safety",
  "Flooring Specialist": "Flooring",
  "Garage Conversion": "Garage Conversions",
  "Garden Rooms / Offices": "Garden Rooms",
  "Gas Engineer": "Gas & Heating",
  "General Builder": "Building",
  "Glazier": "Glazing",
  "Groundworker": "Groundworks",
  "Handyman": "Handyman Services",
  "Heat Pumps": "Heat Pumps",
  "Heating Engineer": "Heating",
  "Internal Wall Insulation": "Internal Wall Insulation",
  "Kitchen Fitter": "Kitchens",
  "Landscaper": "Landscaping",
  "Loft Conversion Specialist": "Lofts",
  "Loft Insulation": "Loft Insulation",
  "New Build": "New Build",
  "Painter / Decorator": "Decorating",
  "Party Wall Surveyor": "Party Wall Surveys",
  "Plasterer": "Plastering",
  "Plumber": "Plumbing",
  "Roof Insulation": "Roof Insulation",
  "Roofer": "Roofing",
  "Sash Window Specialist": "Sash Windows",
  "Sauna / Steam": "Saunas & Steam",
  "Scaffolder": "Scaffolding",
  "Security / Alarms / CCTV": "Security & Alarms",
  "Shutters / Blinds": "Shutters & Blinds",
  "Skylights / Rooflights": "Skylights",
  "Smart Home / AV": "Smart Home & AV",
  "Solar PV": "Solar PV",
  "Solar Thermal": "Solar Thermal",
  "Sprinklers": "Sprinkler Systems",
  "Steel Fabrication": "Steel Fabrication",
  "Stone Worktops": "Stone Worktops",
  "Stonemason": "Stonemasonry",
  "Structural Engineer": "Structural Engineering",
  "Suspended Ceilings": "Suspended Ceilings",
  "Swimming Pools": "Swimming Pools",
  "Thatched Roofing": "Thatched Roofing",
  "Tiler": "Tiling",
  "Timber Treatment": "Timber Treatment",
  "Underfloor Heating": "Underfloor Heating",
  "Vinyl / LVT Fitter": "Vinyl & LVT",
  "Waste Removal / Skip Hire": "Waste Removal",
  "Window / Door Fitter": "Windows and doors",
  "Wood Floor Sanding": "Wood Floor Restoration",
};
function tradeNoun(trade) {
  return TRADE_NOUN[trade] || trade;
}

const BIO_SNIPPETS = [
  "Family-run business with over {years} years of experience across {area} and surrounding boroughs.",
  "{years}+ years on the tools, fully insured, free quotes within 48 hours.",
  "Local {trade_lower} based in {area}. Most jobs completed within the week.",
  "Clean, tidy work backed by a 12-month workmanship guarantee.",
  "{area}-based since {since}. We take pride in turning up on time and clearing up properly.",
  "Reliable, friendly, no-nonsense. We'll talk you through the work before we start.",
];

function makeBio({ trade, area, years, since }) {
  const snippets = sample(BIO_SNIPPETS, rand(2, 3));
  return snippets
    .map((s) =>
      s
        .replace("{years}", years)
        .replace("{area}", area)
        .replace("{trade_lower}", trade.toLowerCase())
        .replace("{since}", since),
    )
    .join(" ");
}

// Loremflickr keyword per trade. The seed script uses this to fetch a
// trade-themed Flickr photo per ghost: same trade keyword, unique
// `lock` seed per ghost (and per portfolio slot) so every card on the
// preview matches grid renders a DIFFERENT photo of plumbing /
// roofing / electrical work etc. Keywords are kept short and common
// so Flickr's tag pool has lots of matching photos to draw from -
// rare specialisations fall back to a broader parent (e.g. Stonemason
// → masonry, Sash Window Specialist → window). Whenever a tag returns
// nothing, loremflickr serves a generic fallback photo, so coverage
// is best-effort but always renders something.
const TRADE_KEYWORD = {
  "Air Conditioning": "air-conditioning",
  "Architect": "architect",
  "Asbestos Removal": "demolition",
  "Basement Conversion": "basement",
  "Bathroom Fitter": "bathroom",
  "Bin Cleaning": "bin",
  "Boiler Installer": "boiler",
  "Bricklayer": "bricklayer",
  "Building Control (Approved Inspector)": "construction-inspector",
  "Cabinet Maker": "cabinet,wood",
  "Carpenter / Joiner": "carpenter",
  "Carpet & Upholstery Cleaning": "carpet,cleaning",
  "Carpet Fitter": "carpet",
  "Cavity Wall Insulation": "insulation",
  "Chimney Sweeping": "chimney",
  "Cleaning (Builders Clean)": "cleaning",
  "Commercial / Office Cleaning": "office-cleaning",
  "Commercial Bin Cleaning": "bin",
  "Curtains / Soft Furnishings": "curtains",
  "Damp Proofing": "damp,wall",
  "Decking": "deck,garden",
  "Deep / One-off Cleaning": "cleaning",
  "Domestic Bin Cleaning": "bin",
  "Drainage Specialist": "drain",
  "Driveway & Patio Cleaning": "driveway,cleaning",
  "Driveways / Paving": "driveway",
  "Dryliner / Partitions": "drywall",
  "Electrician": "electrician",
  "End of Tenancy Cleaning": "cleaning",
  "Extension Builder": "house-extension",
  "External Wall Insulation": "insulation",
  "Fencing": "fence",
  "Fire Safety": "fire-alarm",
  "Flooring Specialist": "flooring",
  "Garage Conversion": "garage",
  "Garden Rooms / Offices": "garden-room",
  "Gas Engineer": "boiler",
  "General Builder": "builder",
  "Glazier": "window-glass",
  "Groundworker": "construction-site",
  "Gutter Cleaning": "gutter",
  "Handyman": "handyman",
  "Heat Pumps": "heat-pump",
  "Heating Engineer": "heating",
  "Internal Wall Insulation": "insulation",
  "Kitchen Fitter": "kitchen",
  "Landscaper": "landscaping",
  "Loft Conversion Specialist": "loft",
  "Loft Insulation": "insulation",
  "Mould / Sanitisation Cleaning": "mould,wall",
  "New Build": "construction",
  "Oven Cleaning": "oven,cleaning",
  "Painter / Decorator": "painter",
  "Party Wall Surveyor": "surveyor",
  "Plasterer": "plasterer",
  "Plumber": "plumber",
  "Pressure / Jet Washing": "pressure-washing",
  "Regular / Domestic Cleaning": "cleaning",
  "Roof / Moss Removal": "roof",
  "Roof Insulation": "insulation",
  "Roofer": "roofer",
  "Sash Window Specialist": "window",
  "Sauna / Steam": "sauna",
  "Scaffolder": "scaffolding",
  "Security / Alarms / CCTV": "cctv",
  "Shutters / Blinds": "blinds",
  "Skylights / Rooflights": "skylight",
  "Smart Home / AV": "smart-home",
  "Solar Panel Cleaning": "solar-panel",
  "Solar PV": "solar-panel",
  "Solar Thermal": "solar-panel",
  "Sprinklers": "sprinkler",
  "Steel Fabrication": "steel,welding",
  "Stone Worktops": "kitchen-worktop",
  "Stonemason": "masonry",
  "Structural Engineer": "engineer,construction",
  "Suspended Ceilings": "ceiling",
  "Swimming Pools": "swimming-pool",
  "Thatched Roofing": "thatched-roof",
  "Tiler": "tiler",
  "Timber Treatment": "timber",
  "Underfloor Heating": "underfloor-heating",
  "Vinyl / LVT Fitter": "flooring",
  "Waste Removal / Skip Hire": "skip",
  "Window / Door Fitter": "window",
  "Window Cleaning": "window-cleaning",
  "Wood Floor Sanding": "wood-floor",
};

// Local-fallback job-image slug per trade. Used only when an explicit
// override or test mode pins images to the offline set. Kept in sync
// with web/public/job-images/{slug}.jpg.
const TRADE_TO_CATEGORY_SLUG = {
  "Air Conditioning": "heating-and-cooling",
  "Architect": "building-and-construction",
  "Asbestos Removal": "cleaning-and-waste",
  "Basement Conversion": "extensions-and-conversions",
  "Bathroom Fitter": "bathroom",
  "Bin Cleaning": "cleaning-and-waste",
  "Boiler Installer": "heating-and-cooling",
  "Bricklayer": "building-and-construction",
  "Building Control (Approved Inspector)": "building-and-construction",
  "Cabinet Maker": "carpentry-and-joinery",
  "Carpenter / Joiner": "carpentry-and-joinery",
  "Carpet & Upholstery Cleaning": "cleaning-and-waste",
  "Carpet Fitter": "flooring",
  "Cavity Wall Insulation": "insulation",
  "Chimney Sweeping": "cleaning-and-waste",
  "Cleaning (Builders Clean)": "cleaning-and-waste",
  "Commercial / Office Cleaning": "cleaning-and-waste",
  "Commercial Bin Cleaning": "cleaning-and-waste",
  "Curtains / Soft Furnishings": "bedroom",
  "Damp Proofing": "damp-and-waterproofing",
  "Decking": "landscaping-and-garden",
  "Deep / One-off Cleaning": "cleaning-and-waste",
  "Domestic Bin Cleaning": "cleaning-and-waste",
  "Drainage Specialist": "plumbing",
  "Driveway & Patio Cleaning": "cleaning-and-waste",
  "Driveways / Paving": "exterior-and-structure",
  "Dryliner / Partitions": "tiling-and-plastering",
  "Electrician": "electrical",
  "End of Tenancy Cleaning": "cleaning-and-waste",
  "Extension Builder": "extensions-and-conversions",
  "External Wall Insulation": "insulation",
  "Fencing": "fencing-and-gates",
  "Fire Safety": "accessibility-and-safety",
  "Flooring Specialist": "flooring",
  "Garage Conversion": "extensions-and-conversions",
  "Garden Rooms / Offices": "extensions-and-conversions",
  "Gas Engineer": "heating-and-cooling",
  "General Builder": "building-and-construction",
  "Glazier": "windows",
  "Groundworker": "exterior-and-structure",
  "Gutter Cleaning": "cleaning-and-waste",
  "Handyman": "repairs-and-maintenance",
  "Heat Pumps": "energy-and-renewables",
  "Heating Engineer": "heating-and-cooling",
  "Internal Wall Insulation": "insulation",
  "Kitchen Fitter": "kitchen",
  "Landscaper": "landscaping-and-garden",
  "Loft Conversion Specialist": "extensions-and-conversions",
  "Loft Insulation": "insulation",
  "Mould / Sanitisation Cleaning": "damp-and-waterproofing",
  "New Build": "building-and-construction",
  "Oven Cleaning": "cleaning-and-waste",
  "Painter / Decorator": "painting-and-decorating",
  "Party Wall Surveyor": "building-and-construction",
  "Plasterer": "tiling-and-plastering",
  "Plumber": "plumbing",
  "Pressure / Jet Washing": "cleaning-and-waste",
  "Regular / Domestic Cleaning": "cleaning-and-waste",
  "Roof / Moss Removal": "roofing",
  "Roof Insulation": "insulation",
  "Roofer": "roofing",
  "Sash Window Specialist": "windows",
  "Sauna / Steam": "bathroom",
  "Scaffolder": "repairs-and-maintenance",
  "Security / Alarms / CCTV": "smart-home-and-security",
  "Shutters / Blinds": "windows",
  "Skylights / Rooflights": "windows",
  "Smart Home / AV": "smart-home-and-security",
  "Solar Panel Cleaning": "cleaning-and-waste",
  "Solar PV": "energy-and-renewables",
  "Solar Thermal": "energy-and-renewables",
  "Sprinklers": "landscaping-and-garden",
  "Steel Fabrication": "metalwork-and-fabrication",
  "Stone Worktops": "kitchen",
  "Stonemason": "exterior-and-structure",
  "Structural Engineer": "building-and-construction",
  "Suspended Ceilings": "tiling-and-plastering",
  "Swimming Pools": "landscaping-and-garden",
  "Thatched Roofing": "roofing",
  "Tiler": "tiling-and-plastering",
  "Timber Treatment": "damp-and-waterproofing",
  "Underfloor Heating": "heating-and-cooling",
  "Vinyl / LVT Fitter": "flooring",
  "Waste Removal / Skip Hire": "cleaning-and-waste",
  "Window / Door Fitter": "windows",
  "Window Cleaning": "cleaning-and-waste",
  "Wood Floor Sanding": "flooring",
};

// Returns a trade-themed photo URL. Uses loremflickr.com which serves
// Creative-Commons Flickr photos matching a tag, with a deterministic
// `lock` seed so the same (trade, lock) pair always yields the same
// photo (stable across reseeds + page reloads). Different `lock`
// values per ghost / per portfolio slot guarantee the preview-matches
// grid shows three DIFFERENT photos instead of the same category
// hero. Local `/job-images/{slug}.jpg` stays as the documented
// fallback when loremflickr fails to load on the client.
function tradeImageUrl(trade, lock) {
  const keyword = TRADE_KEYWORD[trade] || "tradesman";
  return `https://loremflickr.com/800/800/${encodeURIComponent(keyword)}?lock=${lock}`;
}

// ---------- main ----------
async function main() {
  const TOTAL = ALL_TRADES.length * PER_TRADE;
  logger.info(
    `${TAG} starting - master_uid=${MASTER_UID} per_trade=${PER_TRADE} ` +
      `trades=${ALL_TRADES.length} total=${TOTAL} db=${DB_NAME}`,
  );

  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: DB_NAME,
    multipleStatements: true,
  });

  try {
    // ---- 1. Wipe existing ghosts owned by this master ----
    const [oldRows] = await conn.execute(
      "SELECT user_id FROM tradesmen WHERE master_uid = ? AND is_seed = 1",
      [MASTER_UID],
    );
    const oldUids = oldRows.map((r) => r.user_id);
    if (oldUids.length) {
      const ph = oldUids.map(() => "?").join(",");
      // Order matters: clear rows that REFERENCE the soon-to-be-
      // deleted tradesmen FIRST so we don't leave orphan FKs / dead
      // foreign IDs in the inbox. Previously we only cleared
      // tradesmen_photos + tradesmen + user_roles, which left
      // dangling swipe_interest rows (and their chat_messages /
      // favourite_tradesmen / recommendations) pointing at UIDs that
      // no longer existed - those surfaced in homeowners' Messages
      // tab as "?" avatar + "Tradesperson" rows.
      const matchRows = await conn.execute(
        `SELECT id FROM swipe_interest WHERE builder_uid IN (${ph})`,
        oldUids,
      );
      const matchIds = (matchRows[0] || []).map((r) => r.id);
      if (matchIds.length) {
        const mph = matchIds.map(() => "?").join(",");
        await conn.execute(
          `DELETE FROM chat_messages WHERE match_id IN (${mph})`,
          matchIds,
        ).catch(() => { /* chat_messages may not exist in older DBs */ });
      }
      await conn.execute(
        `DELETE FROM swipe_interest WHERE builder_uid IN (${ph})`,
        oldUids,
      );
      await conn.execute(
        `DELETE FROM favourite_tradesmen WHERE builderId IN (${ph})`,
        oldUids,
      ).catch(() => { /* table may not exist on older DBs */ });
      await conn.execute(
        `UPDATE recommendations SET linked_tradesman_uid = NULL WHERE linked_tradesman_uid IN (${ph})`,
        oldUids,
      ).catch(() => { /* keeps recs but unlinks from the dead UID */ });
      await conn.execute(
        `DELETE FROM tradesmen_photos WHERE tradesman_user_id IN (${ph})`,
        oldUids,
      );
      await conn.execute(
        `DELETE FROM tradesmen WHERE user_id IN (${ph})`,
        oldUids,
      );
      await conn.execute(
        `DELETE FROM user_roles WHERE uid IN (${ph})`,
        oldUids,
      );
      logger.info(`${TAG} wiped ${oldUids.length} existing ghost(s)`);
    }

    // ---- 2. Generate + insert ----
    await conn.beginTransaction();

    let created = 0;
    // Deterministic per-trade loop: for each canonical trade, generate
    // PER_TRADE ghosts whose primary trade is that label. Each ghost
    // also gets 2 secondary trades from the same bucket so they appear
    // in adjacent decks too. This guarantees every project type gets
    // 30+ ghost matches via its recommended_trades.
    for (const primaryTrade of ALL_TRADES) {
     for (let g = 0; g < PER_TRADE; g++) {
      const trade = primaryTrade;
      const surname = pick(LAST_NAMES);
      const first = pick(FIRST_NAMES);
      const area = pick(AREA_NAMES);
      const company = pick(NAME_PATTERNS)({ surname, area, trade });

      const trades = Array.from(
        new Set([trade, ...pickSecondaries(trade)]),
      ).join(",");
      const areas = sample(POSTCODES, rand(4, 7)).join(",");

      const years = rand(4, 25);
      const since = new Date().getFullYear() - years;
      const uid = ghostUid();
      const publicId = uuidv4();
      // `created` is the global ghost index. Multiplied so each ghost
      // gets its own contiguous block of lock seeds (one for the
      // profile photo + up to 6 portfolio slots) and no two ghosts
      // ever share a photo - the preview matches grid finally shows
      // three distinct trade photos rather than three copies of the
      // category hero.
      const lockBase = (created + 1) * 100;
      const profilePic = tradeImageUrl(trade, lockBase);
      const portfolioCount = rand(3, 6);
      // Single contactable phone + email shared across all ghosts so any
      // tester who somehow surfaces these reaches the master operator
      // (Chris) rather than a dead Ofcom-reserved range or a stranger.
      const phone = "07931660810";
      const email = "fekova9815@deapad.com";
      const bio = makeBio({ trade, area, years, since });
      const createdAt = nowSql();

      await conn.execute(
        `INSERT INTO tradesmen (
           user_id, master_uid, is_seed, company_name, contact_name,
           phone, email, trade_types, service_areas, created_at, updated_at,
           subscription_status, verification_status, status,
           contact_credits, plan, purchased_plan,
           company_number, ch_status, ch_name, ch_match_score,
           photo_count, supporting_doc_count, offers_discount, warranty_months,
           web_verified, web_url, vmb_score, vmb_badge,
           google_rating, google_reviews_count,
           profile_picture_url, public_id, about
         ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'free', 'approved', 'active',
           0, NULL, NULL,
           ?, 'verified', ?, 100,
           ?, 0, 0, 12,
           1, ?, ?, ?,
           ?, ?,
           ?, ?, ?)`,
        [
          uid,
          MASTER_UID,
          company,
          `${first} ${surname}`,
          phone,
          email,
          trades,
          areas,
          createdAt,
          createdAt,
          String(rand(10000000, 99999999)),
          company,
          portfolioCount,
          `https://${slug(company)}.example.com`,
          rand(60, 90),
          rand(60, 90) >= 80 ? "gold" : "silver",
          (rand(40, 50) / 10).toFixed(2),
          rand(8, 80),
          profilePic,
          publicId,
          bio,
        ],
      );

      await conn.execute(
        `INSERT INTO user_roles (uid, role)
         VALUES (?, 'tradesman')
         ON DUPLICATE KEY UPDATE role='tradesman'`,
        [uid],
      );

      // Portfolio photos. All point at the same trade-themed category
      // image so the gallery on the back of the card reads as the
      // ghost's actual line of work (a plumber shows plumbing, a
      // roofer shows roofing, etc.). Same image repeated across the
      // sort_order slots is acceptable here - real tradespeople
      // upload multiple shots of similar jobs anyway, and swapping to
      // truly distinct per-photo images would need a curated bucket
      // per trade. The first photo also doubles as the chat/grid
      // avatar via profile_picture_url above.
      const photosCreatedAt = nowSql();
      for (let p = 0; p < portfolioCount; p++) {
        await conn.execute(
          `INSERT INTO tradesmen_photos
             (tradesman_user_id, url, sort_order, created_at)
           VALUES (?, ?, ?, ?)`,
          [
            uid,
            tradeImageUrl(trade, lockBase + p + 1),
            p + 1,
            photosCreatedAt,
          ],
        );
      }

      created++;
      if (created % 50 === 0) {
        const total = ALL_TRADES.length * PER_TRADE;
        logger.info(`${TAG} ${created}/${total}...`);
      }
     }
    }

    await conn.commit();
    logger.info(`${TAG} done - created ${created} ghost(s) for ${MASTER_UID}`);
  } catch (err) {
    await conn.rollback().catch(() => {});
    logger.error({ err: err?.message }, `${TAG} failed`);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
