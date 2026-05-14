// server/routes/projects/preview-matches.get.js
//
// GET /api/projects/preview-matches?type=...&location=...
//
// Public, read-only. Surfaces up to 3 verified VMB tradespeople for a
// homeowner who's still mid-wizard (no project row exists yet, no auth).
// Used by the engagement-first signup flow at /projects/new to give
// guests a real preview of who they'd be working with before the auth
// wall.
//
// Pads thin-supply postcodes by relaxing the area filter and flagging
// the supplemental rows as `isLocal: false` so the UI can label them
// "nearby" instead of misrepresenting them as in-area.
//
// Response shape:
//   { items: [{
//       id,                // public_id (URL-safe)
//       company,
//       trade,             // raw trade_types string
//       location,          // first service-area token, e.g. "E4"
//       rating,            // number | null (avg of recommendation ratings)
//       reviewCount,       // count of linked recommendations
//       friendCount,       // 0 for now (homeowner is a guest, no community to compare)
//       photoUrl,          // absolute URL or null
//       blurb,             // first sentence of `about` or null
//       isLocal,           // true = same borough, false = padding
//     }, ...] }
//
// All fields are public-facing (already exposed on /builders/[id] etc).
// Phone/email are NOT returned.

const { extractLocationTokens } = require("../../lib/location");
const { getBoroughCodes } = require("../../lib/boroughPostcodes");
const {
  getTradesForProjectType,
} = require("../../lib/matching/projectTradeMap");

const MAX_ITEMS = 3;

function makeAbsolute(urlOrPath, baseUrl) {
  if (!urlOrPath) return null;
  const s = String(urlOrPath).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const base = (baseUrl || "").trim();
  const cleanPath = s.startsWith("/") ? s : `/${s}`;
  if (!base) return cleanPath;
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${cleanBase}${cleanPath}`;
}

function firstSentence(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  const m = t.match(/^[^.!?]{1,180}[.!?]/);
  return (m ? m[0] : t).slice(0, 180).trim();
}

// Match only ghosts whose trade_types CSV contains one of the
// canonical trades for this project type as an exact comma-separated
// token. Mirrors what the swipe deck's rankBuilders does, so the
// preview grid surfaces the same supply set the homeowner sees on
// the deck rather than a sloppy substring match.
//
// The previous implementation stemmed the project type into bag-of-
// words (`tradeWordsFor("Carpet Removal")` → ["carpet", "removal",
// "carpet removal"]) and ran `trade_types LIKE '%removal%'`, which
// happily matched Waste Removal / Asbestos Removal / Roof Moss
// Removal and "Carpet & Upholstery Cleaning" — none of which fit a
// carpet-fitting job.
function canonicalTradesForType(type) {
  const trades = getTradesForProjectType(type) || [];
  return Array.from(new Set(trades.filter(Boolean)));
}

module.exports = (router, ctx) => {
  const { mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[projects/preview-matches.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.get("/projects/preview-matches", async (req, res) => {
    try {
      const type = String(req.query.type || "").trim();
      const location = String(req.query.location || "").trim();

      if (!type) {
        return res.status(400).json({ error: "type required" });
      }

      const tradeList = canonicalTradesForType(type);
      if (tradeList.length === 0) {
        return res.json({ items: [] });
      }

      const locTokens = location ? extractLocationTokens(location) : null;
      const outward = locTokens?.outward || null;
      const boroughCodes = outward ? getBoroughCodes(outward) : [];

      // Exact comma-separated match on trade_types. `REPLACE(..., ', ', ',')`
      // normalises the CSV so a stored "Carpet Fitter, Tiler" still hits
      // FIND_IN_SET. Each trade contributes one OR'd condition so any
      // primary OR secondary trade match counts.
      const tradeConditions = tradeList
        .map(() => "FIND_IN_SET(?, REPLACE(t.trade_types, ', ', ',')) > 0")
        .join(" OR ");
      const tradeParams = tradeList.slice();

      // Avatar prefers tradesmen.profile_picture_url, falling back to the
      // first portfolio photo (sorted by sort_order then upload date).
      // Most trades haven't set an explicit avatar so the fallback is the
      // common case in practice.
      // Boost ghosts whose PRIMARY trade matches above ones whose
      // secondary trade matches - a Carpet Fitter (primary) wins over a
      // Curtains business (primary) that happens to list Carpet as a
      // secondary upsell. Built as an OR'd CASE so the placeholders
      // line up with the same tradeList we use in the WHERE.
      const primaryMatchExpr = tradeList
        .map(() => "SUBSTRING_INDEX(t.trade_types, ',', 1) = ?")
        .join(" OR ");

      const baseSelect = `
        SELECT
          t.user_id,
          t.public_id,
          t.company_name,
          t.trade_types,
          t.service_areas,
          COALESCE(
            t.profile_picture_url,
            (SELECT tp.url FROM tradesmen_photos tp
              WHERE tp.tradesman_user_id = t.user_id
              ORDER BY COALESCE(tp.sort_order, 999999), tp.created_at ASC
              LIMIT 1)
          ) AS profile_picture_url,
          t.about,
          t.vmb_score,
          CASE WHEN ${primaryMatchExpr} THEN 1 ELSE 0 END AS is_primary_match,
          (SELECT COUNT(*) FROM recommendations r
             WHERE r.linked_tradesman_uid = t.user_id
               AND r.homeowner_unfavourited_at IS NULL
               AND r.deck_dismissed_at IS NULL) AS rec_count,
          (SELECT AVG(r.rating) FROM recommendations r
             WHERE r.linked_tradesman_uid = t.user_id
               AND r.rating > 0) AS avg_rating
        FROM tradesmen t
        WHERE t.verification_status IN ('approved', 'verified')
          AND (${tradeConditions})
      `;
      // master_uid intentionally NOT filtered out: production never has
      // ghost rows (master_uid is a staging-only sim feature) so leaving
      // it permissive keeps the staging supply side visible to test
      // homeowners while remaining a no-op in prod.

      let rows = [];
      const seen = new Set();

      // 1) Local pass: filter by borough
      if (boroughCodes.length > 0) {
        const areaConditions = boroughCodes
          .map(() => "t.service_areas LIKE ?")
          .join(" OR ");
        const areaParams = boroughCodes.map((c) => `%${c}%`);
        const localRows = await mysqlQuery(
          `${baseSelect}
            AND (${areaConditions})
          ORDER BY is_primary_match DESC, t.vmb_score DESC, rec_count DESC
          LIMIT ${MAX_ITEMS}`,
          [...tradeParams, ...tradeParams, ...areaParams],
        );
        for (const r of localRows) {
          rows.push({ ...r, _isLocal: true });
          seen.add(r.user_id);
        }
      }

      // 2) Pad pass: any verified trade matching the trade type
      if (rows.length < MAX_ITEMS) {
        const need = MAX_ITEMS - rows.length;
        const padRows = await mysqlQuery(
          `${baseSelect}
          ORDER BY is_primary_match DESC, t.vmb_score DESC, rec_count DESC
          LIMIT ${need + rows.length}`,
          [...tradeParams, ...tradeParams],
        );
        for (const r of padRows) {
          if (rows.length >= MAX_ITEMS) break;
          if (seen.has(r.user_id)) continue;
          rows.push({ ...r, _isLocal: false });
          seen.add(r.user_id);
        }
      }

      const baseUrl = (
        process.env.MEDIA_BASE_URL ||
        process.env.PUBLIC_BASE_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        ""
      ).trim();

      const items = rows.map((r) => {
        const areas = String(r.service_areas || "").split(/[,;|]+/).map((s) => s.trim()).filter(Boolean);
        const rating = r.avg_rating != null && Number(r.avg_rating) > 0
          ? Number(Number(r.avg_rating).toFixed(1))
          : null;
        return {
          id: r.public_id || r.user_id,
          company: r.company_name,
          trade: r.trade_types || null,
          location: areas[0] || null,
          rating,
          reviewCount: Number(r.rec_count || 0),
          friendCount: 0,
          photoUrl: makeAbsolute(r.profile_picture_url, baseUrl),
          blurb: firstSentence(r.about),
          isLocal: !!r._isLocal,
        };
      });

      return res.json({ items });
    } catch (e) {
      log.error?.(`${TAG} failed`, { error: e?.message });
      return res.status(500).json({ error: "FAILED" });
    }
  });

  if (!ctx.__logged_projects_preview_matches) {
    ctx.__logged_projects_preview_matches = true;
    log.info?.("[routes] mounted GET /api/projects/preview-matches");
  }
};
