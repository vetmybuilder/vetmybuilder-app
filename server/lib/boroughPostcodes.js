// server/lib/boroughPostcodes.js
//
// Static borough → outward map used by pipeline auto-surface and the
// recommendations engine to expand location matching from a single outward
// code to all codes in the same borough. Pilot-area validation does NOT
// use this; that path resolves admin_district via postcodes.io instead
// (see server/lib/pilotAreas.js).
//
// Only the launch-area boroughs are listed - pipeline + recs only run
// against postcodes near our active operating area, so a UK-wide map
// would just be dead weight. Add boroughs here if pipeline coverage
// expands; pilot-areas growth doesn't need an entry here.
//
// Source: Royal Mail / ONS postcode directory.

const BOROUGH_POSTCODES = {
  "Waltham Forest": ["E4", "E10", "E11", "E17"],
  "Hackney": ["E5", "E8", "E9", "N1", "N16"],
  "Haringey": ["N4", "N6", "N8", "N10", "N11", "N15", "N17", "N22"],
  "Newham": ["E6", "E7", "E12", "E13", "E15", "E16"],
  "Redbridge": ["IG1", "IG2", "IG3", "IG4", "IG5", "IG6", "IG7", "IG8"],
  "Enfield": ["EN1", "EN2", "EN3", "N9", "N13", "N14", "N18", "N21"],
  "Islington": ["N1", "N5", "N7", "N19", "EC1"],
  "Tower Hamlets": ["E1", "E2", "E3", "E14"],
  "Barking and Dagenham": ["IG11", "RM6", "RM7", "RM8", "RM9", "RM10"],
  "Epping Forest": ["IG9", "IG10"],
};

// Reverse lookup: outward code → borough name
const OUTWARD_TO_BOROUGH = {};
for (const [borough, codes] of Object.entries(BOROUGH_POSTCODES)) {
  for (const code of codes) {
    // Some codes belong to multiple boroughs (e.g. N1 spans Hackney + Islington).
    // Store the first match — for pipeline matching, the exact borough doesn't matter,
    // we just need to expand to nearby codes.
    if (!OUTWARD_TO_BOROUGH[code]) {
      OUTWARD_TO_BOROUGH[code] = borough;
    }
  }
}

/**
 * Given an outward postcode (e.g. "E4"), returns all outward codes in the same borough.
 * Falls back to just the input code if not in a known borough.
 */
function getBoroughCodes(outward) {
  const upper = (outward || "").toUpperCase().trim();
  const borough = OUTWARD_TO_BOROUGH[upper];
  if (!borough) return [upper];
  return BOROUGH_POSTCODES[borough];
}

module.exports = { BOROUGH_POSTCODES, OUTWARD_TO_BOROUGH, getBoroughCodes };
