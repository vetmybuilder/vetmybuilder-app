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

const ALL_TRADES = TRADE_CATALOG
  .filter((t) => t.active !== false)
  .map((t) => t.label)
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
  // Always sprinkle in General Builder + Handyman as cross-bucket
  // upsells - they're broadly common secondaries on real trade sites.
  if (trade !== "General Builder") candidates.add("General Builder");
  if (trade !== "Handyman") candidates.add("Handyman");
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
  "Window / Door Fitter": "Windows & Doors",
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

// pravatar.cc serves 70+ deterministic portrait avatars by id. Free,
// no auth, stable URLs. We rotate ids 1..70 across the 100 ghosts so
// each ghost has a believable headshot. If we want fully unique faces
// later we can swap to a curated R2 bucket.
function profilePictureUrl(idx) {
  const id = (idx % 70) + 1;
  return `https://i.pravatar.cc/600?img=${id}`;
}

// Lorem Picsum's seed feature returns a stable image per seed string.
// We use it for tradesmen_photos so each ghost has a small "portfolio".
function portfolioPhotoUrl(seed) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/800`;
}

// ---------- main ----------
async function main() {
  const TOTAL = ALL_TRADES.length * PER_TRADE;
  console.log(
    `${TAG} starting — master_uid=${MASTER_UID} per_trade=${PER_TRADE} ` +
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
      console.log(`${TAG} wiped ${oldUids.length} existing ghost(s)`);
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
      const profilePic = profilePictureUrl(created);
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

      // Portfolio photos. The first photo doubles as profile_picture_url
      // so the matches grid + chat avatar both have something to show
      // even if Lorem Picsum stutters.
      const photosCreatedAt = nowSql();
      for (let p = 0; p < portfolioCount; p++) {
        await conn.execute(
          `INSERT INTO tradesmen_photos
             (tradesman_user_id, url, sort_order, created_at)
           VALUES (?, ?, ?, ?)`,
          [
            uid,
            portfolioPhotoUrl(`${slug(company)}-${p}`),
            p + 1,
            photosCreatedAt,
          ],
        );
      }

      created++;
      if (created % 50 === 0) {
        const total = ALL_TRADES.length * PER_TRADE;
        console.log(`${TAG} ${created}/${total}…`);
      }
     }
    }

    await conn.commit();
    console.log(`${TAG} done — created ${created} ghost(s) for ${MASTER_UID}`);
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error(`${TAG} failed`, err);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
