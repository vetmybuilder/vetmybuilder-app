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

    // Also include project name words for broader matching
    if (projectName) {
      const nameBeforeLocation = projectName.split(/\bin\b/i)[0] || "";
      for (const w of nameBeforeLocation.toLowerCase().split(/[\s,/&()]+/).filter(Boolean)) {
        if (w.length >= 3 && !["the", "and", "for"].includes(w)) {
          recommendedTrades.push(w);
        }
      }
    }

    // Build trade matching
    const tradeWords = new Set();
    for (const t of recommendedTrades) {
      tradeWords.add(t.toLowerCase());
      for (const w of t.toLowerCase().split(/[\s,/&]+/).filter(Boolean)) {
        tradeWords.add(w);
        if (w.endsWith("ing")) tradeWords.add(w.slice(0, -3));
        if (w.endsWith("er")) tradeWords.add(w.slice(0, -2));
      }
    }
    const tradeList = [...tradeWords].filter((w) => w.length >= 3);
    if (tradeList.length === 0) { log.debug("no trade words extracted"); return; }
    const tradeConditions = tradeList.map(() => "LOWER(tp.trade_types) LIKE ?").join(" OR ");
    const tradeParams = tradeList.map((t) => `%${t}%`);

    // Expand to all postcodes in the same borough
    const boroughCodes = getBoroughCodes(outward);
    const areaConditions = boroughCodes.map(() => "tp.service_areas LIKE ?").join(" OR ");
    const areaParams = boroughCodes.map((code) => `%${code}%`);

    const candidates = await mysqlQuery(
      `SELECT tp.id, tp.company_name, tp.email, tp.phone, tp.website,
              tp.google_rating, tp.google_reviews_count, tp.company_number, tp.claimed_by,
              tp.vetting_score,
              t.vmb_score AS tradesman_vmb_score,
              t.public_id AS tradesman_public_id,
              GREATEST(tp.vetting_score, COALESCE(t.vmb_score, 0)) AS effective_score
         FROM tradesperson_pipeline tp
         LEFT JOIN tradesmen t ON t.user_id = tp.claimed_by
        WHERE tp.status = 'approved'
          AND GREATEST(tp.vetting_score, COALESCE(t.vmb_score, 0)) >= ?
          AND (${tradeConditions})
          AND (${areaConditions})
        ORDER BY effective_score DESC
        LIMIT ${MAX_PIPELINE_RECS}`,
      [MIN_VETTING_SCORE, ...tradeParams, ...areaParams],
    );

    if (!candidates.length) { log.debug("no pipeline matches"); return; }

    // Get ALL existing recs for dedup
    const existingRecs = await mysqlQuery(
      "SELECT company, source, linked_tradesman_uid FROM recommendations WHERE projectId = ?", [projectId],
    );
    const existingNorms = new Set(existingRecs.map((r) => normaliseCompanyName(r.company)));

    const createdAt = new Date();
    let inserted = 0;

    const projectRows = await mysqlQuery("SELECT ownerUserId FROM projects WHERE id = ?", [projectId]);
    const ownerUid = projectRows[0]?.ownerUserId;

    for (const c of candidates) {
      const normName = normaliseCompanyName(c.company_name);
      const isRegistered = !!c.claimed_by;

      // Check if this company already has ANY recommendation on this project
      if (existingNorms.has(normName)) {
        // Company already recommended - just ensure linked_tradesman_uid is set if registered
        if (isRegistered) {
          const unlinked = existingRecs.filter(
            (r) => normaliseCompanyName(r.company) === normName && !r.linked_tradesman_uid
          );
          for (const r of unlinked) {
            await mysqlQuery(
              "UPDATE recommendations SET linked_tradesman_uid = ? WHERE projectId = ? AND company = ?",
              [c.claimed_by, projectId, r.company],
            );
          }
          if (unlinked.length > 0) {
            log.info({ company: c.company_name, linked: c.claimed_by }, "linked existing recs to registered tradesman");
          }
        }
        continue;
      }
      existingNorms.add(normName);

      // Determine source based on registration status:
      // - Registered on VMB: source = 'community_match' (shows in top recommendations)
      // - Not registered: source = 'pipeline' (shows in vetted businesses card)
      const source = isRegistered ? "community_match" : "pipeline";
      const comment = isRegistered
        ? `Matched to your job - verified tradesperson with ${c.google_rating} stars from ${c.google_reviews_count} Google reviews`
        : `Vetted local business - verified on Companies House with ${c.google_rating} stars from ${c.google_reviews_count} Google reviews`;

      const notifMessage = isRegistered
        ? `"${c.company_name}" has been matched to your job based on trade, location, and reputation`
        : `A vetted local business "${c.company_name}" has been added to your project shortlist`;

      await mysqlQuery(
        `INSERT INTO recommendations
           (projectId, recommenderUserId, createdAt, name, company, companyEmail, phone, rating, comment, isAnonymous, source, linked_tradesman_uid)
         VALUES (?, NULL, ?, 'VetMyBuilder', ?, ?, ?, ?, ?, 0, ?, ?)`,
        [projectId, createdAt, c.company_name, c.email || null, c.phone || null, Math.round(Number(c.google_rating) || 5), comment, source, c.claimed_by || null],
      );

      if (ownerUid) {
        const linkPath = `/projects/${projectId}`;
        try {
          await mysqlQuery(
            `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
             VALUES (?, 'recommendation_new', ?, ?, ?, ?)`,
            [ownerUid, notifMessage, projectId, linkPath, createdAt],
          );
          broadcastNotification?.(ownerUid, { type: "recommendation_new", message: notifMessage, projectId, linkPath });
        } catch { /* Non-fatal */ }
      }
      inserted++;
      log.info({ company: c.company_name, source, registered: isRegistered }, "surfaced pipeline candidate");
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
