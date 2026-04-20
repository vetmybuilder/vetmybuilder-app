// server/lib/surfacePipelineTradespeople.js
const { normaliseCompanyName } = require("./matchRecommendationToTradesman");
const { extractLocationTokens } = require("./location");
const { getBoroughCodes } = require("./boroughPostcodes");
const { logger } = require("./logger");

const MAX_PIPELINE_RECS = 3;
const MIN_VETTING_SCORE = 70;

async function surfacePipelineTradespeople({
  mysqlQuery, projectId, projectType, projectName, projectLocation, broadcastNotification, logActivity,
}) {
  const log = logger.child({ module: "surfacePipelineTradespeople", projectId });
  try {
    if (!projectLocation || !projectType) return;
    const locTokens = extractLocationTokens(projectLocation);
    const outward = locTokens.outward;
    if (!outward) return;

    // Get recommended trades from classification + project type (merge both)
    const recommendedTrades = [projectType];
    try {
      const classRows = await mysqlQuery(
        "SELECT structured FROM project_classifications WHERE project_id = ? ORDER BY id DESC LIMIT 1",
        [projectId],
      );
      if (classRows.length > 0 && classRows[0].structured) {
        const parsed = JSON.parse(classRows[0].structured);
        if (Array.isArray(parsed.recommended_trades)) {
          for (const t of parsed.recommended_trades) {
            if (!recommendedTrades.includes(t)) recommendedTrades.push(t);
          }
        }
      }
    } catch { /* Use projectType as fallback */ }

    // Also include project name words for broader matching (e.g. "Kitchen" from name)
    if (projectName) {
      // Extract meaningful words from project name (before "in <location>")
      const nameBeforeLocation = projectName.split(/\bin\b/i)[0] || "";
      for (const w of nameBeforeLocation.toLowerCase().split(/[\s,/&()]+/).filter(Boolean)) {
        if (w.length >= 3 && !["the", "and", "for"].includes(w)) {
          recommendedTrades.push(w);
        }
      }
    }

    // Build trade matching — tokenize project type words + stems for broad matching
    const tradeWords = new Set();
    for (const t of recommendedTrades) {
      tradeWords.add(t.toLowerCase());
      for (const w of t.toLowerCase().split(/[\s,/&]+/).filter(Boolean)) {
        tradeWords.add(w);
        // simple stem: "plumbing" → "plumb", "roofing" → "roof"
        if (w.endsWith("ing")) tradeWords.add(w.slice(0, -3));
        if (w.endsWith("er")) tradeWords.add(w.slice(0, -2));
      }
    }
    const tradeList = [...tradeWords].filter((w) => w.length >= 3);
    if (tradeList.length === 0) { log.debug("no trade words extracted"); return; }
    const tradeConditions = tradeList.map(() => "LOWER(tp.trade_types) LIKE ?").join(" OR ");
    const tradeParams = tradeList.map((t) => `%${t}%`);
    log.debug({ tradeList, outward }, "trade matching params");

    // Expand to all postcodes in the same borough (e.g. E4 → E4, E10, E11, E17)
    const boroughCodes = getBoroughCodes(outward);
    const areaConditions = boroughCodes.map(() => "tp.service_areas LIKE ?").join(" OR ");
    const areaParams = boroughCodes.map((code) => `%${code}%`);
    log.debug({ outward, boroughCodes }, "borough-level area matching");

    const candidates = await mysqlQuery(
      `SELECT tp.id, tp.company_name, tp.email, tp.phone, tp.website,
              tp.google_rating, tp.google_reviews_count, tp.company_number, tp.claimed_by
         FROM tradesperson_pipeline tp
        WHERE tp.status = 'approved'
          AND tp.vetting_score >= ?
          AND (${tradeConditions})
          AND (${areaConditions})
        ORDER BY tp.vetting_score DESC
        LIMIT ${MAX_PIPELINE_RECS}`,
      [MIN_VETTING_SCORE, ...tradeParams, ...areaParams],
    );

    if (!candidates.length) { log.debug("no pipeline matches"); return; }

    // Dedup against ALL existing recs — don't surface a pipeline entry if the same company
    // already has a community recommendation on this project
    const existingRecs = await mysqlQuery(
      "SELECT company FROM recommendations WHERE projectId = ?", [projectId],
    );
    const existingNorms = new Set(existingRecs.map((r) => normaliseCompanyName(r.company)));

    const createdAt = new Date();
    let inserted = 0;

    const projectRows = await mysqlQuery("SELECT ownerUserId FROM projects WHERE id = ?", [projectId]);
    const ownerUid = projectRows[0]?.ownerUserId;

    for (const c of candidates) {
      const normName = normaliseCompanyName(c.company_name);
      if (existingNorms.has(normName)) continue;
      existingNorms.add(normName);

      const comment = `Vetted local business — verified on Companies House with ${c.google_rating} stars from ${c.google_reviews_count} Google reviews`;

      await mysqlQuery(
        `INSERT INTO recommendations
           (projectId, recommenderUserId, createdAt, name, company, companyEmail, phone, rating, comment, isAnonymous, source, linked_tradesman_uid)
         VALUES (?, NULL, ?, 'VetMyBuilder', ?, ?, ?, ?, ?, 0, 'pipeline', ?)`,
        [projectId, createdAt, c.company_name, c.email || null, c.phone || null, Math.round(Number(c.google_rating) || 5), comment, c.claimed_by || null],
      );

      if (ownerUid) {
        const message = `A vetted local business "${c.company_name}" has been added to your project shortlist`;
        const linkPath = `/projects/${projectId}`;
        try {
          await mysqlQuery(
            `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
             VALUES (?, 'recommendation_new', ?, ?, ?, ?)`,
            [ownerUid, message, projectId, linkPath, createdAt],
          );
          broadcastNotification?.(ownerUid, { type: "recommendation_new", message, projectId, linkPath });
        } catch { /* Non-fatal */ }
      }
      inserted++;
    }

    if (inserted > 0) {
      log.info({ count: inserted }, "pipeline recommendations inserted");
      logActivity?.("pipeline.surface", "info", "system", `${inserted} pipeline rec(s) surfaced on project #${projectId}`);
    }
  } catch (err) {
    log.warn({ err: err?.message }, "surfacePipelineTradespeople failed");
  }
}

module.exports = { surfacePipelineTradespeople };
