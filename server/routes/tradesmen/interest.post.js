// server/routes/tradesmen/interest.post.js

/**
 * POST /tradesmen/interest
 * Body: { projectId: number, note?: string }
 * Auth: required (tradesman)
 *
 * Behaviour
 * - Resolves a recommendation id to anchor /builders/:id (via CH number → company name).
 * - If none exists, auto-creates a minimal anonymous recommendation for *this* project.
 * - Persists a one-time share in `tradesman_interests` (UNIQUE projectId+fromUid).
 * - Sends a notification to the project owner with linkPath: `/builders/:recommendationId`.
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery, requireTradesman = null, sseSend = null } = ctx;

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const TAG = "[tradesmen/interest.post]";

  /* ---------------- core route ---------------- */

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

        if (!uid) {
          return res.status(401).json({ error: "Not authenticated" });
        }
        if (!Number.isFinite(projectId)) {
          return res.status(400).json({ error: "projectId is required" });
        }

        // Ensure supporting tables exist (idempotent)
        await ensureInterestsTable(mysqlQuery);
        await ensureNotificationsTable(mysqlQuery);

        // --- Load project + owner ---
        const projRows = await mysqlQuery(
          `
          SELECT id,
                 ownerUserId AS owner_uid,
                 name,
                 status
            FROM projects
           WHERE id = ?
           LIMIT 1
          `,
          [projectId]
        );
        const proj = projRows[0] || null;

        if (!proj) {
          return res.status(404).json({ error: "Project not found" });
        }
        if (String(proj.owner_uid) === String(uid)) {
          return res.status(400).json({
            error: "You cannot share on your own project",
          });
        }

        // --- Idempotence: already shared? ---
        const existingRows = await mysqlQuery(
          `
          SELECT recommendationId
            FROM tradesman_interests
           WHERE projectId = ?
             AND fromUid    = ?
           LIMIT 1
          `,
          [projectId, uid]
        );
        const existing = existingRows[0] || null;

        if (existing) {
          const recommendationId = Number(existing.recommendationId);
          const linkPath = `/builders/${recommendationId}`;
          return res.json({
            ok: true,
            alreadyShared: true,
            recommendationId,
            linkPath,
          });
        }

        // --- Resolve tradesman info ---
        const tr = await getTradesmanByUser(mysqlQuery, uid);

        const companyName =
          (tr && (tr.company_name || tr.companyName || tr.name || null)) ||
          null;
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

        // --- Resolve an existing recommendation id ---
        let rec = await resolveRecommendation(mysqlQuery, {
          companyNumber,
          companyName,
        });

        // --- If none, create a minimal anonymous recommendation for THIS project ---
        if (!rec) {
          const createdAtIso = new Date().toISOString();
          const label =
            (companyName && String(companyName).trim()) ||
            (companyNumber && String(companyNumber).trim()) ||
            "Shared company";
          const comment =
            (note && String(note).trim()) ||
            "Profile shared by the tradesman via VetMyBuilder";

          const result = await mysqlQuery(
            `
            INSERT INTO recommendations (
              projectId,
              recommenderUserId,
              createdAt,
              name,
              email,
              company,
              rating,
              comment,
              isAnonymous
            )
            VALUES (?, NULL, ?, NULL, NULL, ?, NULL, ?, 1)
            `,
            [projectId, createdAtIso, label, comment]
          );

          const recommendationId = Number(result.insertId || 0);
          rec = { id: recommendationId };
        }

        const recommendationId = Number(rec.id);
        const linkPath = `/builders/${recommendationId}`;
        const createdAt = new Date().toISOString();

        // --- Persist one-time share (UNIQUE projectId+fromUid) ---
        try {
          await mysqlQuery(
            `
            INSERT INTO tradesman_interests (
              projectId,
              fromUid,
              recommendationId,
              note,
              createdAt
            )
            VALUES (?, ?, ?, ?, ?)
            `,
            [projectId, uid, recommendationId, note, createdAt]
          );
        } catch (e) {
          // Race on UNIQUE(projectId, fromUid) — treat as already shared
          if (e && e.code === "ER_DUP_ENTRY") {
            return res.json({
              ok: true,
              alreadyShared: true,
              recommendationId,
              linkPath,
            });
          }
          throw e;
        }

        // --- Notify owner ---
        const msg =
          `${
            companyName || "A local tradesperson"
          } is interested in your project and has shared their profile. Click to view.` +
          (note && String(note).trim()
            ? `\n\nMessage: ${String(note).trim()}`
            : "");

        await mysqlQuery(
          `
          INSERT INTO notifications (
            userId,
            type,
            message,
            projectId,
            linkPath,
            createdAt
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
                companyName: companyName || "",
                linkPath,
                createdAt,
              },
            });
          }
        } catch (e) {
          console.warn(`${TAG} SSE send failed:`, e?.message || e);
        }

        return res.json({ ok: true, recommendationId, linkPath });
      } catch (e) {
        console.error("[tradesmen/interest] error", e);
        return res.status(500).json({ error: "Failed to share interest" });
      }
    }
  );
};

/* ---------------- helpers ---------------- */

function maybe(mw) {
  if (typeof mw !== "function") return (_req, _res, next) => next();
  return mw;
}

// interests table in MySQL
async function ensureInterestsTable(mysqlQuery) {
  await mysqlQuery(`
    CREATE TABLE IF NOT EXISTS tradesman_interests (
      id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      projectId        BIGINT UNSIGNED NOT NULL,
      fromUid          VARCHAR(191) NOT NULL,
      recommendationId BIGINT UNSIGNED NOT NULL,
      note             TEXT NULL,
      createdAt        DATETIME NOT NULL,
      UNIQUE KEY uniq_project_from (projectId, fromUid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// notifications table in MySQL (safe if already exists)
async function ensureNotificationsTable(mysqlQuery) {
  await mysqlQuery(`
    CREATE TABLE IF NOT EXISTS notifications (
      id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId    VARCHAR(191) NOT NULL,
      type      VARCHAR(100) NOT NULL,
      message   TEXT NOT NULL,
      projectId BIGINT UNSIGNED NULL,
      linkPath  VARCHAR(255) NULL,
      createdAt DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// Grab tradesman row by user_id (MySQL schema)
async function getTradesmanByUser(mysqlQuery, uid) {
  if (!uid) return null;
  const rows = await mysqlQuery(
    `
    SELECT *
      FROM tradesmen
     WHERE user_id = ?
     LIMIT 1
    `,
    [uid]
  );
  return rows[0] || null;
}

// MySQL-specific resolver for recommendation
async function resolveRecommendation(
  mysqlQuery,
  { companyNumber, companyName }
) {
  // 1) by CH number via company_verifications
  if (companyNumber) {
    try {
      const rows = await mysqlQuery(
        `
        SELECT recommendationId AS id
          FROM company_verifications
         WHERE companyNumber = ?
         ORDER BY COALESCE(checkedAt, '' ) DESC, id DESC
         LIMIT 1
        `,
        [String(companyNumber)]
      );
      if (rows[0]) return rows[0];
    } catch (e) {
      console.warn(
        "[tradesmen/interest] resolve by companyNumber failed:",
        e?.message || e
      );
    }
  }

  // 2) by exact normalized company name in recommendations
  if (companyName) {
    try {
      const rows = await mysqlQuery(
        `
        SELECT id
          FROM recommendations
         WHERE LOWER(TRIM(company)) = LOWER(TRIM(?))
         ORDER BY COALESCE(createdAt, ''), id DESC
         LIMIT 1
        `,
        [String(companyName)]
      );
      if (rows[0]) return rows[0];
    } catch (e) {
      console.warn(
        "[tradesmen/interest] resolve by companyName failed:",
        e?.message || e
      );
    }
  }

  return null;
}

function pickFirst(obj, keys) {
  if (!obj) return null;
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") {
      return obj[k];
    }
  }
  return null;
}

// /**
//  * POST /tradesmen/interest
//  * Body: { projectId: number, note?: string }
//  * Auth: required (tradesman)
//  *
//  * Behaviour
//  * - Resolves a recommendation id to anchor /builders/:id (via CH number → company name).
//  * - If none exists, auto-creates a minimal anonymous recommendation for *this* project.
//  * - Persists a one-time share in `tradesman_interests` (UNIQUE projectId+fromUid).
//  * - Sends a notification to the project owner with linkPath: `/builders/:recommendationId`.
//  */
// module.exports = (router, ctx) => {
//   const { db, auth, requireTradesman = null, sseSend = null } = ctx;

//   ensureInterestsTable(db);
//   ensureNotificationsTable(db);

//   router.post(
//     "/tradesmen/interest",
//     auth,
//     maybe(requireTradesman),
//     (req, res) => {
//       try {
//         const uid = req.user?.uid;
//         const raw = req.body || {};
//         const projectId = Number(raw.projectId);
//         const note = raw.note ? String(raw.note) : null;

//         if (!uid) return res.status(401).json({ error: "Not authenticated" });
//         if (!Number.isFinite(projectId))
//           return res.status(400).json({ error: "projectId is required" });

//         // --- Load project + owner
//         const proj = db
//           .prepare(
//             "SELECT id, ownerUserId AS owner_uid, name, status FROM projects WHERE id=? LIMIT 1"
//           )
//           .get(projectId);
//         if (!proj) return res.status(404).json({ error: "Project not found" });
//         if (String(proj.owner_uid) === String(uid))
//           return res
//             .status(400)
//             .json({ error: "You cannot share on your own project" });

//         // --- Idempotence: already shared?
//         const existing = db
//           .prepare(
//             "SELECT recommendationId FROM tradesman_interests WHERE projectId=? AND fromUid=? LIMIT 1"
//           )
//           .get(projectId, uid);
//         if (existing) {
//           const recommendationId = Number(existing.recommendationId);
//           return res.json({
//             ok: true,
//             alreadyShared: true,
//             recommendationId,
//             linkPath: `/builders/${recommendationId}`,
//           });
//         }

//         // --- Resolve tradesman info
//         let tr =
//           (req.tradesman &&
//             typeof req.tradesman === "object" &&
//             req.tradesman) ||
//           getTradesmanByUser(db, uid) ||
//           null;

//         const companyName =
//           (tr && (tr.company_name || tr.companyName || tr.name)) || null;
//         const companyNumber = pickFirst(tr, [
//           "company_number",
//           "companyNumber",
//           "ch_number",
//           "chNumber",
//         ]);

//         if (!companyName && !companyNumber) {
//           return res
//             .status(400)
//             .json({
//               error: "Tradesman profile needs a company name or number.",
//             });
//         }

//         // --- Resolve an existing recommendation id
//         let rec = resolveRecommendation(db, { companyNumber, companyName });

//         // --- If none, create a minimal anonymous recommendation for THIS project
//         if (!rec) {
//           const createdAtIso = new Date().toISOString();
//           const label =
//             (companyName && String(companyName).trim()) ||
//             (companyNumber && String(companyNumber).trim()) ||
//             "Shared company";
//           const comment =
//             (note && String(note).trim()) ||
//             "Profile shared by the tradesman via VetMyBuilder";

//           const ins = db
//             .prepare(
//               `INSERT INTO recommendations (
//               projectId, recommenderUserId, createdAt,
//               name, email, company, rating, comment, isAnonymous
//             ) VALUES (?, NULL, ?, NULL, NULL, ?, NULL, ?, 1)`
//             )
//             .run(projectId, createdAtIso, label, comment);

//           rec = { id: Number(ins.lastInsertRowid) };
//         }

//         const recommendationId = Number(rec.id);
//         const linkPath = `/builders/${recommendationId}`;

//         // --- Persist one-time share (UNIQUE)
//         const createdAt = new Date().toISOString();
//         try {
//           db.prepare(
//             `INSERT INTO tradesman_interests (projectId, fromUid, recommendationId, note, createdAt)
//            VALUES (?, ?, ?, ?, ?)`
//           ).run(projectId, uid, recommendationId, note, createdAt);
//         } catch (e) {
//           // Race on UNIQUE(projectId, fromUid) — treat as already shared
//           return res.json({
//             ok: true,
//             alreadyShared: true,
//             recommendationId,
//             linkPath,
//           });
//         }

//         // --- Notify owner
//         const msg =
//           `${
//             companyName || "A local tradesperson"
//           } is interested in your project and has shared their profile. Click to view.` +
//           (note && String(note).trim()
//             ? `\n\nMessage: ${String(note).trim()}`
//             : "");

//         db.prepare(
//           `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
//          VALUES (?, 'tradesman_interest', ?, ?, ?, ?)`
//         ).run(String(proj.owner_uid), msg, projectId, linkPath, createdAt);

//         try {
//           if (typeof sseSend === "function") {
//             sseSend(String(proj.owner_uid), {
//               type: "notification",
//               kind: "tradesman_interest",
//               payload: {
//                 projectId,
//                 fromUid: uid,
//                 companyName: companyName || "",
//                 linkPath,
//                 createdAt,
//               },
//             });
//           }
//         } catch {}

//         return res.json({ ok: true, recommendationId, linkPath });
//       } catch (e) {
//         console.error("[tradesmen/interest] error", e);
//         return res.status(500).json({ error: "Failed to share interest" });
//       }
//     }
//   );
// };

// /* ---------------- helpers ---------------- */

// function maybe(mw) {
//   if (typeof mw !== "function") return (_req, _res, next) => next();
//   return mw;
// }

// function ensureInterestsTable(db) {
//   db.prepare(
//     `
//     CREATE TABLE IF NOT EXISTS tradesman_interests (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       projectId INTEGER NOT NULL,
//       fromUid TEXT NOT NULL,
//       recommendationId INTEGER NOT NULL,
//       note TEXT,
//       createdAt TEXT NOT NULL,
//       UNIQUE(projectId, fromUid)
//     )
//   `
//   ).run();
// }

// function ensureNotificationsTable(db) {
//   db.prepare(
//     `
//     CREATE TABLE IF NOT EXISTS notifications (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       userId TEXT NOT NULL,
//       type TEXT NOT NULL,
//       message TEXT NOT NULL,
//       projectId INTEGER,
//       linkPath TEXT,
//       createdAt TEXT NOT NULL
//     )
//   `
//   ).run();
// }

// function tblExists(db, name) {
//   const row = db
//     .prepare(
//       "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1"
//     )
//     .get(String(name));
//   return !!row;
// }

// function getCols(db, table) {
//   try {
//     const rows = db.prepare(`PRAGMA table_info(${table})`).all();
//     return new Set(rows.map((r) => r.name));
//   } catch {
//     return new Set();
//   }
// }

// function resolveRecommendation(db, { companyNumber, companyName }) {
//   // 1) by CH number via company_verifications
//   if (companyNumber && tblExists(db, "company_verifications")) {
//     const cols = getCols(db, "company_verifications");
//     const recCol = cols.has("recommendation_id")
//       ? "recommendation_id"
//       : cols.has("recommendationId")
//       ? "recommendationId"
//       : null;
//     const numCol = cols.has("company_number")
//       ? "company_number"
//       : cols.has("companyNumber")
//       ? "companyNumber"
//       : null;
//     if (recCol && numCol) {
//       const row = db
//         .prepare(
//           `SELECT ${recCol} AS id
//            FROM company_verifications
//            WHERE ${numCol} = ?
//            ORDER BY IFNULL(checked_at, ''), id DESC
//            LIMIT 1`
//         )
//         .get(String(companyNumber));
//       if (row) return row;
//     }
//   }

//   // 2) by exact normalized company name in recommendations
//   if (companyName && tblExists(db, "recommendations")) {
//     const row = db
//       .prepare(
//         `SELECT id
//          FROM recommendations
//          WHERE lower(trim(company)) = lower(trim(?))
//          ORDER BY IFNULL(createdAt, ''), id DESC
//          LIMIT 1`
//       )
//       .get(String(companyName));
//     if (row) return row;
//   }

//   return null;
// }

// function getTradesmanByUser(db, uid) {
//   if (!tblExists(db, "tradesmen")) return null;
//   const cols = getCols(db, "tradesmen");
//   const key = ["user_uid", "userId", "uid", "user_id"].find((k) => cols.has(k));
//   if (!key) return null;
//   try {
//     return (
//       db.prepare(`SELECT * FROM tradesmen WHERE ${key}=? LIMIT 1`).get(uid) ||
//       null
//     );
//   } catch {
//     return null;
//   }
// }

// function pickFirst(obj, keys) {
//   if (!obj) return null;
//   for (const k of keys) {
//     if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
//   }
//   return null;
// }
