// server/lib/admin/chDiscovery.js
//
// Shared maps + helpers for the admin trade-pipeline discovery flows.
// Imported by:
//   - server/routes/admin/trades-pipeline-discover-ch.js (CH-only)
//   - server/routes/admin/trades-pipeline-discover.js    (Google + CH merge)

// Pilot launch boroughs. CH advanced search matches the borough name
// against the registered-office address text, so single-word names miss
// most companies - we hit each borough with town names + postcode
// prefixes and dedupe by company_number.
const BOROUGH_KEYWORDS = {
  "Waltham Forest": [
    "Walthamstow", "Leytonstone", "Leyton", "Chingford",
    "E4", "E10", "E11", "E17",
  ],
  Barnet: [
    "Barnet", "Finchley", "Hendon", "Edgware", "Mill Hill",
    "Cricklewood", "Golders Green",
    "EN4", "EN5", "N2", "N3", "N10", "N11", "N12", "N14", "N20",
    "NW4", "NW7", "NW9", "NW11",
  ],
  Redbridge: [
    "Ilford", "Wanstead", "Woodford", "Barkingside", "Chigwell", "Hainault",
    "IG1", "IG2", "IG3", "IG4", "IG5", "IG6", "IG7", "IG8", "E18",
  ],
  Epping: ["Epping", "Loughton", "Buckhurst Hill", "Ongar", "CM16", "IG10"],
};

// Residential-construction SIC codes (UK SIC 2007), mapped to the
// trade_type label used by the rest of the pipeline.
const SIC_TO_TRADE = {
  "41201": "General Builder",
  "41202": "General Builder",
  "43210": "Electrician",
  "43220": "Plumber",
  "43290": "General Builder",
  "43310": "Plasterer",
  "43320": "Carpenter",
  "43330": "Tiler",
  "43341": "Painter & Decorator",
  "43342": "Window Fitter",
  "43390": "General Builder",
  "43910": "Roofer",
  "43999": "General Builder",
};
const SIC_CODES = Object.keys(SIC_TO_TRADE);

// Reverse map: trade label -> SIC codes that can represent it.
const TRADE_TO_SICS = {
  "General Builder": ["41201", "41202", "43290", "43390", "43999"],
  Electrician: ["43210"],
  Plumber: ["43220"],
  "Gas Engineer": ["43220"],
  "Heating Engineer": ["43220"],
  Plasterer: ["43310"],
  Carpenter: ["43320"],
  Tiler: ["43330"],
  "Painter & Decorator": ["43341"],
  "Window Fitter": ["43342"],
  "Window / Door Fitter": ["43342"],
  Glazier: ["43342"],
  Roofer: ["43910"],
  Bricklayer: ["41201", "41202"],
  "Insulation Installer": ["43390"],
  "Damp Proofing": ["43999"],
  "Loft Insulation": ["43390"],
  "Cavity Wall Insulation": ["43390"],
  "Floor Insulation": ["43390"],
};

function sicsForTrades(trades) {
  if (!Array.isArray(trades) || trades.length === 0) return SIC_CODES;
  const out = new Set();
  let matchedAny = false;
  for (const t of trades) {
    const list = TRADE_TO_SICS[t];
    if (list) {
      matchedAny = true;
      for (const sic of list) out.add(sic);
    }
  }
  if (!matchedAny) return SIC_CODES;
  return Array.from(out);
}

function pickTrade(sicCodes) {
  for (const code of sicCodes || []) {
    if (SIC_TO_TRADE[code]) return SIC_TO_TRADE[code];
  }
  return "General Builder";
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

// Map a user-supplied area string onto BOROUGH_KEYWORDS where possible
// so an "Edgware" search opens the wider Barnet keyword set. If no match
// (e.g. user typed an arbitrary postcode), we fall back to the area
// string itself as a single CH location keyword.
function keywordsForArea(area) {
  if (!area) return [];
  const trimmed = String(area).trim();
  if (BOROUGH_KEYWORDS[trimmed]) return BOROUGH_KEYWORDS[trimmed];
  for (const [borough, kws] of Object.entries(BOROUGH_KEYWORDS)) {
    if (
      borough.toLowerCase() === trimmed.toLowerCase() ||
      kws.some((k) => k.toLowerCase() === trimmed.toLowerCase())
    ) {
      return kws;
    }
  }
  return [trimmed];
}

const CH_BASE = "https://api.company-information.service.gov.uk";
const CH_REQ_INTERVAL_MS = 650;

function chAuthHeader() {
  const key =
    process.env.CH_KEY ||
    process.env.COMPANIES_HOUSE_API_KEY ||
    process.env.CH_API_KEY ||
    null;
  if (!key) return null;
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

let lastChRequestAt = 0;
async function chFetch(url, ah, log) {
  const wait = Math.max(0, lastChRequestAt + CH_REQ_INTERVAL_MS - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastChRequestAt = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: ah, "User-Agent": "vmb-discover/1" },
  });
  if (res.status === 429) {
    log?.warn?.("[ch-discovery] rate limited, sleeping 60s");
    await new Promise((r) => setTimeout(r, 60_000));
    return chFetch(url, ah, log);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CH ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function chAdvancedSearch(keyword, sics, ah, log) {
  const sicParam = (Array.isArray(sics) && sics.length > 0 ? sics : SIC_CODES).join(
    ",",
  );
  const incorporatedFrom = new Date(Date.now() - 365 * 10 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);
  const out = [];
  let startIndex = 0;
  const size = 100;
  while (true) {
    const params = new URLSearchParams({
      location: keyword,
      sic_codes: sicParam,
      company_status: "active",
      incorporated_from: incorporatedFrom,
      size: String(size),
      start_index: String(startIndex),
    });
    let data;
    try {
      data = await chFetch(
        `${CH_BASE}/advanced-search/companies?${params.toString()}`,
        ah,
        log,
      );
    } catch (err) {
      log?.warn?.(
        `[ch-discovery] search "${keyword}" failed at offset ${startIndex}: ${err.message}`,
      );
      break;
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) break;
    for (const c of items) out.push(c);
    startIndex += items.length;
    if (items.length < size) break;
    if (startIndex >= 1000) break;
  }
  return out;
}

module.exports = {
  BOROUGH_KEYWORDS,
  SIC_TO_TRADE,
  SIC_CODES,
  TRADE_TO_SICS,
  sicsForTrades,
  pickTrade,
  fmtAddress,
  keywordsForArea,
  chAuthHeader,
  chAdvancedSearch,
};
