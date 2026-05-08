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

const COUNT = Number.isFinite(Number(args.count)) ? Number(args.count) : 100;
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

// ---------- canonical pools ----------
// Trade labels weighted by how common they are in real demand.
// Every label here MUST appear in web/types/tradeTypes.ts TRADE_TYPES -
// matching does an exact-label set intersection, so a typo silently means
// a ghost never gets surfaced for any job.
const TRADES_WEIGHTED = [
  ["Plumber", 12],
  ["Electrician", 12],
  ["General Builder", 10],
  ["Painter / Decorator", 9],
  ["Carpenter / Joiner", 8],
  ["Bathroom Fitter", 7],
  ["Kitchen Fitter", 7],
  ["Plasterer", 6],
  ["Roofer", 6],
  ["Tiler", 5],
  ["Gas Engineer", 5],
  ["Bricklayer", 4],
  ["Flooring Specialist", 4],
  ["Window / Door Fitter", 4],
  ["Loft Conversion Specialist", 3],
  ["Extension Builder", 3],
  ["Landscaper", 3],
  ["Heating Engineer", 3],
  ["Boiler Installer", 3],
  ["Damp Proofing", 2],
  ["Handyman", 4],
];
const expandedTrades = (() => {
  const out = [];
  for (const [label, weight] of TRADES_WEIGHTED) {
    for (let i = 0; i < weight; i++) out.push(label);
  }
  return out;
})();

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
function tradeNoun(trade) {
  const map = {
    "Plumber": "Plumbing",
    "Electrician": "Electrical",
    "General Builder": "Building",
    "Painter / Decorator": "Decorating",
    "Carpenter / Joiner": "Joinery",
    "Bathroom Fitter": "Bathrooms",
    "Kitchen Fitter": "Kitchens",
    "Plasterer": "Plastering",
    "Roofer": "Roofing",
    "Tiler": "Tiling",
    "Gas Engineer": "Gas & Heating",
    "Bricklayer": "Brickwork",
    "Flooring Specialist": "Flooring",
    "Window / Door Fitter": "Windows & Doors",
    "Loft Conversion Specialist": "Lofts",
    "Extension Builder": "Extensions",
    "Landscaper": "Landscaping",
    "Heating Engineer": "Heating",
    "Boiler Installer": "Boilers",
    "Damp Proofing": "Damp Proofing",
    "Handyman": "Handyman Services",
  };
  return map[trade] || trade;
}

const BIO_SNIPPETS = [
  "Family-run business with over {years} years of experience across {area} and surrounding boroughs.",
  "{years}+ years on the tools, fully insured, free quotes within 48 hours.",
  "Local {trade_lower} based in {area}. Most jobs completed within the week.",
  "We do clean, tidy work and stand by everything we do - 12-month workmanship guarantee on every job.",
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
  console.log(
    `${TAG} starting — master_uid=${MASTER_UID} count=${COUNT} db=${DB_NAME}`,
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
    for (let i = 0; i < COUNT; i++) {
      const trade = pick(expandedTrades);
      const surname = pick(LAST_NAMES);
      const first = pick(FIRST_NAMES);
      const area = pick(AREA_NAMES);
      const company = pick(NAME_PATTERNS)({ surname, area, trade });

      const trades = Array.from(
        new Set([trade, ...sample(expandedTrades, rand(0, 2))]),
      ).join(",");
      const areas = sample(POSTCODES, rand(3, 6)).join(",");

      const years = rand(4, 25);
      const since = new Date().getFullYear() - years;
      const uid = ghostUid();
      const publicId = uuidv4();
      const profilePic = profilePictureUrl(i);
      const portfolioCount = rand(3, 6);
      // Reserved Ofcom range so no real number ever gets called.
      const phone = `07700 900${String(rand(0, 999)).padStart(3, "0")}`;
      const email = `${slug(company)}@example.com`;
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
      if (created % 10 === 0) {
        console.log(`${TAG} ${created}/${COUNT}…`);
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
