// server/routes/tradesmen/interest.post.js

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, requireTradesman = null, sseSend = null } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/interest.post]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  log.info?.(`${TAG} mounted`);

  router.post(
    "/tradesmen/interest",
    auth,
    maybe(requireTradesman),
    async (req, res) => {
      try {
        const uid = req.user?.uid;
        const raw = req.body || {};
        const projectId = Number(raw.projectId);
        const note = raw.note ? String(raw.note) : null;

        log.info?.(`${TAG} request`, { uid, projectId });

        if (!uid) return res.status(401).json({ error: "Not authenticated" });
        if (!Number.isFinite(projectId))
          return res.status(400).json({ error: "projectId is required" });

        await ensureInterestsTable(mysqlQuery);
        await ensureNotificationsTable(mysqlQuery);

        const projRows = await mysqlQuery(
          `
          SELECT id, ownerUserId AS owner_uid, name, status
            FROM projects
           WHERE id=? LIMIT 1
        `,
          [projectId]
        );

        const proj = projRows[0];
        if (!proj) return res.status(404).json({ error: "Project not found" });

        if (String(proj.owner_uid) === String(uid)) {
          return res
            .status(400)
            .json({ error: "You cannot share on your own project" });
        }

        const existing = await mysqlQuery(
          `
          SELECT recommendationId FROM tradesman_interests
           WHERE projectId=? AND fromUid=? LIMIT 1
        `,
          [projectId, uid]
        );

        if (existing.length) {
          const recommendationId = Number(existing[0].recommendationId);
          log.info?.(`${TAG} already shared`, { recommendationId });
          return res.json({
            ok: true,
            alreadyShared: true,
            recommendationId,
            linkPath: `/builders/${recommendationId}`,
          });
        }

        const tr = await getTradesmanByUser(mysqlQuery, uid);
        const companyName =
          tr?.company_name || tr?.companyName || tr?.name || null;
        const companyNumber = pickFirst(tr, [
          "company_number",
          "companyNumber",
          "ch_number",
          "chNumber",
        ]);

        if (!companyName && !companyNumber) {
          return res.status(400).json({
            error: "Tradesman profile needs a company name or number.",
          });
        }

        let rec = await resolveRecommendation(mysqlQuery, {
          companyNumber,
          companyName,
        });

        if (!rec) {
          const now = new Date().toISOString().slice(0, 19).replace("T", " ");
          const label = companyName || companyNumber || "Shared company";

          const comment =
            (note && String(note).trim()) ||
            "Profile shared by the tradesman via VetMyBuilder";

          const result = await mysqlQuery(
            `
            INSERT INTO recommendations (
              projectId, recommenderUserId, createdAt,
              name, email, company, rating, comment, isAnonymous
            )
            VALUES (?, NULL, ?, NULL, NULL, ?, NULL, ?, 1)
          `,
            [projectId, now, label, comment]
          );

          rec = { id: Number(result.insertId) };
          log.info?.(`${TAG} created recommendation`, { id: rec.id });
        }

        const recommendationId = Number(rec.id);
        const linkPath = `/builders/${recommendationId}`;
        const createdAt = new Date().toISOString().slice(0, 19).replace("T", " ");

        try {
          await mysqlQuery(
            `
            INSERT INTO tradesman_interests (
              projectId, fromUid, recommendationId, note, createdAt
            )
            VALUES (?, ?, ?, ?, ?)
          `,
            [projectId, uid, recommendationId, note, createdAt]
          );
        } catch (e) {
          if (e.code === "ER_DUP_ENTRY") {
            log.warn?.(`${TAG} duplicate insert`, { uid, projectId });
            return res.json({
              ok: true,
              alreadyShared: true,
              recommendationId,
              linkPath,
            });
          }
          throw e;
        }

        const msg =
          `${
            companyName || "A local tradesperson"
          } is interested in your project.` +
          (note ? `\n\nMessage: ${note}` : "");

        await mysqlQuery(
          `
          INSERT INTO notifications (
            userId, type, message, projectId, linkPath, createdAt
          )
          VALUES (?, 'tradesman_interest', ?, ?, ?, ?)
        `,
          [String(proj.owner_uid), msg, projectId, linkPath, createdAt]
        );

        try {
          if (typeof sseSend === "function") {
            sseSend(String(proj.owner_uid), {
              type: "notification",
              kind: "tradesman_interest",
              payload: {
                projectId,
                fromUid: uid,
                companyName,
                linkPath,
                createdAt,
              },
            });
          }
        } catch (e) {
          log.warn?.(`${TAG} SSE failed`, { error: e?.message });
        }

        log.info?.(`${TAG} success`, { recommendationId });
        res.json({ ok: true, recommendationId, linkPath });
        ctx.logActivity("tradesman.interest", "info", req.user.uid, `Expressed interest in project #${projectId}`);
        return;
      } catch (e) {
        log.error?.(`${TAG} internal error`, { error: e?.message });
        return res.status(500).json({ error: "Failed to share interest" });
      }
    }
  );
};

/* helpers */

function maybe(fn) {
  return typeof fn === "function" ? fn : (_req, _res, next) => next();
}

async function ensureInterestsTable(mysqlQuery) {
  await mysqlQuery(`
    CREATE TABLE IF NOT EXISTS tradesman_interests (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      projectId BIGINT UNSIGNED NOT NULL,
      fromUid VARCHAR(191) NOT NULL,
      recommendationId BIGINT UNSIGNED NOT NULL,
      note TEXT NULL,
      createdAt DATETIME NOT NULL,
      UNIQUE KEY uniq_project_from (projectId, fromUid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureNotificationsTable(mysqlQuery) {
  await mysqlQuery(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      userId VARCHAR(191) NOT NULL,
      type VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      projectId BIGINT UNSIGNED,
      linkPath VARCHAR(255),
      createdAt DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function getTradesmanByUser(mysqlQuery, uid) {
  const rows = await mysqlQuery(
    `SELECT * FROM tradesmen WHERE user_id=? LIMIT 1`,
    [uid]
  );
  return rows[0] || null;
}

async function resolveRecommendation(
  mysqlQuery,
  { companyNumber, companyName }
) {
  if (companyNumber) {
    try {
      const rows = await mysqlQuery(
        `
        SELECT recommendationId AS id
          FROM company_verifications
         WHERE companyNumber=?
         ORDER BY COALESCE(checkedAt,''), id DESC
         LIMIT 1
      `,
        [String(companyNumber)]
      );
      if (rows[0]) return rows[0];
    } catch {}
  }

  if (companyName) {
    try {
      const rows = await mysqlQuery(
        `
        SELECT id FROM recommendations
         WHERE LOWER(TRIM(company)) = LOWER(TRIM(?))
         ORDER BY COALESCE(createdAt,''), id DESC
         LIMIT 1
      `,
        [String(companyName)]
      );
      if (rows[0]) return rows[0];
    } catch {}
  }

  return null;
}

function pickFirst(obj, keys) {
  if (!obj) return null;
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return null;
}
