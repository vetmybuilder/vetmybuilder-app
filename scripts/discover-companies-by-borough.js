#!/usr/bin/env node
// scripts/discover-companies-by-borough.js
//
// Pulls active construction-trade companies from Companies House for
// the pilot boroughs and writes one CSV per borough into ./discover/.
// Used for cold outreach - enrich each row with email via Hunter.io
// or LinkedIn before sending.
//
// Run:
//   CH_KEY=... node scripts/discover-companies-by-borough.js
//
// Optional env:
//   DISCOVER_BOROUGHS  - comma-separated borough names (defaults below)
//   DISCOVER_FROM      - incorporated_from date YYYY-MM-DD (default 10y ago)
//   DISCOVER_OUT_DIR   - output directory (default ./discover)
//   DISCOVER_INCLUDE_OFFICERS  - "1" to fetch top 2 officers per row (extra
//                        API calls; off by default to keep within rate limit)

const fs = require("node:fs");
const path = require("node:path");

const KEY =
  process.env.CH_KEY ||
  process.env.COMPANIES_HOUSE_API_KEY ||
  process.env.CH_API_KEY;
if (!KEY) {
  console.error("CH_KEY missing");
  process.exit(1);
}

const BASE = "https://api.company-information.service.gov.uk";
const AUTH = "Basic " + Buffer.from(`${KEY}:`).toString("base64");

// CH "location" search matches against the registered-office address text,
// so the borough name often doesn't hit. Map each borough to the town
// names + postcode prefixes that actually appear in addresses, search
// for each, then dedupe by company_number across the borough.
const BOROUGH_KEYWORDS = {
  "Waltham Forest": [
    "Walthamstow",
    "Leytonstone",
    "Leyton",
    "Chingford",
    "E4",
    "E10",
    "E11",
    "E17",
  ],
  Barnet: [
    "Barnet",
    "Finchley",
    "Hendon",
    "Edgware",
    "Mill Hill",
    "Cricklewood",
    "Golders Green",
    "EN4",
    "EN5",
    "N2",
    "N3",
    "N10",
    "N11",
    "N12",
    "N14",
    "N20",
    "NW4",
    "NW7",
    "NW9",
    "NW11",
  ],
  Redbridge: [
    "Ilford",
    "Wanstead",
    "Woodford",
    "Barkingside",
    "Chigwell",
    "Hainault",
    "IG1",
    "IG2",
    "IG3",
    "IG4",
    "IG5",
    "IG6",
    "IG7",
    "IG8",
    "E18",
  ],
  Epping: ["Epping", "Loughton", "Buckhurst Hill", "Ongar", "CM16", "IG10"],
};

const BOROUGHS = (
  process.env.DISCOVER_BOROUGHS ||
  Object.keys(BOROUGH_KEYWORDS).join(",")
)
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean);

// Residential construction SIC codes (UK SIC 2007).
// 4120  - Construction of residential buildings (general builders)
// 4321  - Electrical
// 4322  - Plumbing, heat / air-con
// 4329  - Other building installation
// 4331  - Plastering
// 4332  - Joinery installation
// 4333  - Floor & wall covering
// 4334  - Painting & glazing
// 4339  - Other building completion
// 4391  - Roofing
// 4399  - Other specialised construction
const SIC_CODES = [
  "41201",
  "41202",
  "43210",
  "43220",
  "43290",
  "43310",
  "43320",
  "43330",
  "43341",
  "43342",
  "43390",
  "43910",
  "43999",
];

const INCORPORATED_FROM =
  process.env.DISCOVER_FROM ||
  new Date(Date.now() - 365 * 10 * 86400 * 1000).toISOString().slice(0, 10);

const OUT_DIR = process.env.DISCOVER_OUT_DIR || path.join(__dirname, "..", "discover");
const INCLUDE_OFFICERS = process.env.DISCOVER_INCLUDE_OFFICERS === "1";

fs.mkdirSync(OUT_DIR, { recursive: true });

// Polite throttle: 600 reqs / 5 min = 2/sec. We aim for ~1.5/sec.
const REQ_INTERVAL_MS = 650;
let lastRequestAt = 0;
async function chFetch(url) {
  const wait = Math.max(0, lastRequestAt + REQ_INTERVAL_MS - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: AUTH, "User-Agent": "vmb-discover/1" },
  });
  if (res.status === 429) {
    console.warn("  rate limited, sleeping 60s...");
    await new Promise((r) => setTimeout(r, 60_000));
    return chFetch(url);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CH ${res.status} ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function fmtAddress(a) {
  if (!a) return "";
  return [
    a.premises,
    a.address_line_1,
    a.address_line_2,
    a.locality,
    a.region,
    a.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s === "") return "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchTopOfficers(companyNumber) {
  try {
    const data = await chFetch(
      `${BASE}/company/${encodeURIComponent(companyNumber)}/officers?items_per_page=10`,
    );
    const items = Array.isArray(data?.items) ? data.items : [];
    return items
      .filter((o) => !o.resigned_on)
      .slice(0, 2)
      .map((o) => o.name)
      .join(" | ");
  } catch (err) {
    console.warn(`  officers fetch failed for ${companyNumber}: ${err.message}`);
    return "";
  }
}

async function searchKeyword(keyword) {
  const sicParam = SIC_CODES.join(",");
  const rows = [];
  let startIndex = 0;
  const size = 100;
  while (true) {
    const params = new URLSearchParams({
      location: keyword,
      sic_codes: sicParam,
      company_status: "active",
      incorporated_from: INCORPORATED_FROM,
      size: String(size),
      start_index: String(startIndex),
    });
    const url = `${BASE}/advanced-search/companies?${params.toString()}`;
    let data;
    try {
      data = await chFetch(url);
    } catch (err) {
      console.error(`    [${keyword}] failed at offset ${startIndex}: ${err.message}`);
      break;
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) break;
    for (const c of items) {
      rows.push(c);
    }
    startIndex += items.length;
    if (items.length < size) break;
    if (startIndex >= 1000) break;
  }
  return rows;
}

async function searchBorough(borough) {
  console.log(`\n== ${borough} ==`);
  const keywords = BOROUGH_KEYWORDS[borough] || [borough];
  const byNumber = new Map();
  for (const kw of keywords) {
    const items = await searchKeyword(kw);
    let added = 0;
    for (const c of items) {
      if (c.company_number && !byNumber.has(c.company_number)) {
        byNumber.set(c.company_number, c);
        added++;
      }
    }
    console.log(`  [${kw}] +${added} new (total ${byNumber.size})`);
  }

  const rows = [];
  for (const c of byNumber.values()) {
    let officers = "";
    if (INCLUDE_OFFICERS) officers = await fetchTopOfficers(c.company_number);
    rows.push({
      company_name: c.company_name || "",
      company_number: c.company_number || "",
      company_status: c.company_status || "",
      date_of_creation: c.date_of_creation || "",
      sic_codes: (c.sic_codes || []).join(" | "),
      postcode: c?.registered_office_address?.postal_code || "",
      address: fmtAddress(c?.registered_office_address),
      officers,
      ch_profile_url: `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
    });
  }
  return rows;
}

(async () => {
  console.log(`SIC: ${SIC_CODES.length} codes  |  incorporated_from=${INCORPORATED_FROM}  |  officers=${INCLUDE_OFFICERS ? "yes" : "no"}`);
  const date = new Date().toISOString().slice(0, 10);
  let total = 0;
  for (const borough of BOROUGHS) {
    const rows = await searchBorough(borough);
    total += rows.length;
    const fname = `trades-${borough.toLowerCase().replace(/\s+/g, "-")}-${date}.csv`;
    const out = path.join(OUT_DIR, fname);
    const header = [
      "company_name",
      "company_number",
      "company_status",
      "date_of_creation",
      "sic_codes",
      "postcode",
      "address",
      "officers",
      "ch_profile_url",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(header.map((k) => csvEscape(r[k])).join(","));
    }
    fs.writeFileSync(out, lines.join("\n"));
    console.log(`  -> ${out} (${rows.length} rows)`);
  }
  console.log(`\nDone. ${total} companies across ${BOROUGHS.length} boroughs.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
