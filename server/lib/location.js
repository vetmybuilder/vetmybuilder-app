// server/v2/lib/location.js
function extractLocationTokens(raw) {
  const sRaw = String(raw || "").trim();
  if (!sRaw) {
    return { full: null, sector: null, outward: null, city: null, raw: "" };
  }

  const s = sRaw.toUpperCase();

  // 1) FULL UK postcode (outward + inward), eg "E4 6JH", "SW1A 1AA"
  //   acceptable outward forms: A9, A9A, A99, AA9, AA9A
  const fullRe =
    /^(?<outward>(?:[A-Z]{1,2}\d{1,2}[A-Z]?))\s*(?<inward>\d[A-Z]{2})$/;
  const mFull = s.match(fullRe);
  if (mFull && mFull.groups) {
    const outward = mFull.groups.outward;
    const inward = mFull.groups.inward;
    const full = `${outward} ${inward}`;
    const sector = `${outward} ${inward[0]}`; // outward + first digit of inward
    return {
      full,
      sector,
      outward,
      city: null,
      raw: sRaw,
    };
  }

  // 2) SECTOR form, eg "E4 6", "SW1A 1"
  const sectorRe = /^(?<outward>(?:[A-Z]{1,2}\d{1,2}[A-Z]?))\s*(?<digit>\d)$/;
  const mSector = s.match(sectorRe);
  if (mSector && mSector.groups) {
    const outward = mSector.groups.outward;
    const sector = `${outward} ${mSector.groups.digit}`;
    return {
      full: null,
      sector,
      outward,
      city: null,
      raw: sRaw,
    };
  }

  // 3) OUTWARD-ONLY form, eg "E4", "SW1A", "EC1"
  const outwardRe = /^(?<outward>(?:[A-Z]{1,2}\d{1,2}[A-Z]?))$/;
  const mOut = s.match(outwardRe);
  if (mOut && mOut.groups) {
    const outward = mOut.groups.outward;
    return {
      full: null,
      sector: null,
      outward,
      city: null,
      raw: sRaw,
    };
  }

  // 4) Otherwise treat as a city/area string
  return {
    full: null,
    sector: null,
    outward: null,
    city: sRaw.toLowerCase(),
    raw: sRaw,
  };
}

function updateUserLocation(db, uid, location) {
  const t = extractLocationTokens(String(location ?? "").trim());
  db.prepare(
    `UPDATE users SET
    locationRaw=@raw, postcode=@full, postcodeSector=@sector,
    postcodeOutward=@outward, city=@city WHERE uid=@uid`
  ).run({
    uid,
    raw: t.raw,
    full: t.full,
    sector: t.sector,
    outward: t.outward,
    city: t.city,
  });
}
module.exports = { extractLocationTokens, updateUserLocation };
