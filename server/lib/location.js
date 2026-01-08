// server/lib/location.js

function extractLocationTokens(raw) {
  const sRaw = String(raw || "").trim();
  if (!sRaw) {
    return { full: null, sector: null, outward: null, city: null, raw: "" };
  }

  const s = sRaw.toUpperCase();

  const fullRe =
    /^(?<outward>(?:[A-Z]{1,2}\d{1,2}[A-Z]?))\s*(?<inward>\d[A-Z]{2})$/;
  const mFull = s.match(fullRe);
  if (mFull && mFull.groups) {
    const outward = mFull.groups.outward;
    const inward = mFull.groups.inward;
    const full = `${outward} ${inward}`;
    const sector = `${outward} ${inward[0]}`;
    return { full, sector, outward, city: null, raw: sRaw };
  }

  const sectorRe = /^(?<outward>(?:[A-Z]{1,2}\d{1,2}[A-Z]?))\s*(?<digit>\d)$/;
  const mSector = s.match(sectorRe);
  if (mSector && mSector.groups) {
    const outward = mSector.groups.outward;
    const sector = `${outward} ${mSector.groups.digit}`;
    return { full: null, sector, outward, city: null, raw: sRaw };
  }

  const outwardRe = /^(?<outward>(?:[A-Z]{1,2}\d{1,2}[A-Z]?))$/;
  const mOut = s.match(outwardRe);
  if (mOut && mOut.groups) {
    const outward = mOut.groups.outward;
    return { full: null, sector: null, outward, city: null, raw: sRaw };
  }

  return {
    full: null,
    sector: null,
    outward: null,
    city: sRaw.toLowerCase(),
    raw: sRaw,
  };
}

/**
 * formatPostcode()
 * Convert any valid full UK postcode into outward-only code.
 *
 * Examples:
 *  "E4 0AW"      → "E4"
 *  "SW1A 2AA"    → "SW1A"
 *  "M2 5BQ"      → "M2"
 *  "W1A 1HQ"     → "W1A"
 *  "BS16 4JH"    → "BS16"
 */
function formatPostcode(input = "") {
  const str = String(input).trim().toUpperCase();

  // Full UK postcode regex (covers all formats)
  const full = str.match(
    /^([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}$/ // outward + inward
  );

  if (full) {
    return full[1]; // outward only
  }

  // If not a postcode, return as-is (or truncate long text)
  if (str.length > 40) {
    return str.slice(0, 40).trim() + "…";
  }

  return str;
}

function updateUserLocation(db, uid, location) {
  const t = extractLocationTokens(String(location ?? "").trim());
  db.prepare(
    `UPDATE users SET
      locationRaw=@raw,
      postcode=@full,
      postcodeSector=@sector,
      postcodeOutward=@outward,
      city=@city
     WHERE uid=@uid`
  ).run({
    uid,
    raw: t.raw,
    full: t.full,
    sector: t.sector,
    outward: t.outward,
    city: t.city,
  });
}

/** MySQL version */
async function updateUserLocationMysql(mysqlQuery, uid, location) {
  const t = extractLocationTokens(String(location ?? "").trim());

  await mysqlQuery(
    `UPDATE users SET
       locationRaw      = ?,
       postcode         = ?,
       postcodeSector   = ?,
       postcodeOutward  = ?,
       city             = ?
     WHERE uid = ?`,
    [t.raw, t.full, t.sector, t.outward, t.city, uid]
  );
}

module.exports = {
  extractLocationTokens,
  updateUserLocation,
  updateUserLocationMysql,
  formatPostcode, // 👈 NEW EXPORT
};
