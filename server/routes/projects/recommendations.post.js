// server/routes/projects/recommendations.post.js

/**
 * POST /api/projects/:id/recommendations
 * Auth: required
 * Body: JSON or multipart/form-data ("photos", up to 8)
 * Response: 201 {
 *   ok: true,
 *   recommendationId,
 *   resolvedCompany,
 *   resolvedBy,
 *   recommender: {
 *     relation: "friend" | "neighbour" | "owner",
 *     source: "platform" | "magic"
 *   }
 * }
 */

module.exports = (router, ctx) => {
  const {
    db, // kept only for notifyUsers fallback (SSE + sqlite notifications)
    mysqlQuery,
    auth,
    upload, // multer array("photos", 8) provided in ctx
    RecSchema, // reuse zod schema from ctx
    cleanPhone,
    queueCompanyVerification,
    notifyUsers,
    path: nodePath,
    UPLOAD_DIR,
    matchByName: ctxMatchByName,
    searchCompanies: ctxSearchCompanies,
    getCompanyProfile: ctxGetCompanyProfile,
  } = ctx;

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const path = nodePath || require("node:path");

  const { _roughNameScore } = (() => {
    try {
      // path from server/routes/projects -> server/lib
      return require("../../lib/companyVerifyHelpers");
    } catch {
      return { _roughNameScore: () => 0 };
    }
  })();

  // --- Companies House helpers: ctx OR direct require fallback ---
  let matchByName = ctxMatchByName;
  let searchCompanies = ctxSearchCompanies;
  let getCompanyProfile = ctxGetCompanyProfile;

  if (!matchByName && !searchCompanies && !getCompanyProfile) {
    try {
      const ch = require("../../lib/companiesHouse");
      matchByName = ch.matchByName || matchByName;
      searchCompanies = ch.searchCompanies || searchCompanies;
      getCompanyProfile = ch.getCompanyProfile || getCompanyProfile;
    } catch (e) {
      console.warn(
        "[recommendations.post] Companies House helpers not available:",
        e?.message || e
      );
    }
  }

  // Conditionally parse multipart
  const multipartGate = (req, res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("multipart/form-data")) {
      upload.array("photos", 8)(req, res, (err) => {
        if (err) {
          return res
            .status(400)
            .json({ error: err.message || "Upload failed" });
        }
        next();
      });
    } else {
      next();
    }
  };

  router.post(
    "/projects/:id/recommendations",
    auth,
    multipartGate,
    /** @type {import('express').RequestHandler} */
    async (req, res) => {
      try {
        const projectId = Number(req.params.id);
        if (!Number.isFinite(projectId)) {
          return res.status(400).json({ error: "Invalid id" });
        }

        const asNumber = (v) =>
          v === undefined || v === null || v === "" ? undefined : Number(v);

        // Build payload (works for multipart & json)
        const payload = {
          name: String(req.body?.name ?? "").trim(),
          email: String(req.body?.email ?? "").trim() || undefined,
          phone: String(req.body?.phone ?? "").trim() || undefined,
          company: String(req.body?.company ?? "").trim(),
          rating: asNumber(req.body?.rating) ?? 5,
          comment: String(req.body?.comment ?? "").trim(),
        };

        const parsed = RecSchema.safeParse(payload);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: "Invalid payload", issues: parsed.error.issues });
        }

        const { name, email, phone, company, rating, comment } = parsed.data;
        const now = new Date(); // ✅ use Date object so mysql2 formats correctly
        const uid = req.user?.uid ?? null;

        const rawSource = String(req.body?.source ?? "")
          .trim()
          .toLowerCase();
        const source = rawSource === "magic" ? "magic" : "platform";

        /* ---------- Figure out owner vs other user ---------- */

        let isOwner = false;
        let projectLocationHint = "";

        try {
          const projRows = await mysqlQuery(
            `SELECT ownerUserId, location
               FROM projects
              WHERE id = ?
              LIMIT 1`,
            [projectId]
          );
          const proj = projRows[0] || null;
          if (proj) {
            isOwner = uid && String(uid) === String(proj.ownerUserId);
            if (isOwner && proj.location) {
              projectLocationHint = String(proj.location);
            }
          }
        } catch (e) {
          console.warn(
            "[recommendations.post] failed to load project for owner/location hint:",
            e?.message || e
          );
        }

        // 0) Any explicit hint from the client? (postcode/city)
        const explicitHint = String(
          (
            req.body?.locationHint ||
            req.body?.companyPostcode ||
            req.body?.companyCity ||
            ""
          ).toString()
        ).trim();

        const locationHint = explicitHint || projectLocationHint || undefined;

        /* ---------- Resolve company name BEFORE insert ---------- */

        let resolvedCompany = company;
        let resolvedBy = "input"; // 'db' | 'ch' | 'input'
        let resolvedCompanyNumber = null;

        // 1) Try local DB exact match first (case-insensitive) via MySQL
        try {
          const localRows = await mysqlQuery(
            `SELECT company
               FROM recommendations
              WHERE LOWER(company) = LOWER(?)
              ORDER BY id DESC
              LIMIT 1`,
            [company]
          );
          const local = localRows[0] || null;
          if (local?.company) {
            resolvedCompany = String(local.company).trim();
            resolvedBy = "db";
          }
        } catch (e) {
          console.warn(
            "[recommendations.post] local company lookup failed:",
            e?.message || e
          );
        }

        // 2) If not found locally AND CH helpers are available, try to match by name
        if (
          resolvedBy === "input" &&
          (typeof matchByName === "function" ||
            (typeof searchCompanies === "function" &&
              typeof getCompanyProfile === "function"))
        ) {
          try {
            if (typeof matchByName === "function") {
              const result = await matchByName({
                name: company,
                locationHint,
              });

              if (result && result.ok) {
                if (result.company?.name) {
                  resolvedCompany = String(result.company.name).trim();
                  resolvedBy = "ch";
                }
                if (result.best) {
                  resolvedCompanyNumber = result.best.number || null;
                }
              }
            } else {
              // Fallback: search -> rough rank -> profile
              const search = await searchCompanies({
                name: company,
                itemsPerPage: 50,
              });
              const items = Array.isArray(search?.items) ? search.items : [];
              const ranked = items
                .filter((i) => i?.title && i?.company_number)
                .map((i) => ({
                  ...i,
                  _score: _roughNameScore(i.title, company),
                }))
                .sort((a, b) => b._score - a._score);
              const best = ranked[0];
              if (best && best._score >= 70) {
                const profile = await getCompanyProfile(best.company_number);
                const chName = profile?.company_name || best.title;
                if (chName) {
                  resolvedCompany = String(chName).trim();
                  resolvedBy = "ch";
                }
                resolvedCompanyNumber =
                  (profile && profile.company_number) ||
                  best.company_number ||
                  null;
              }
            }
          } catch (e) {
            console.warn(
              "[recommendations.post] CH resolve failed:",
              e?.message || e
            );
          }
        }

        /* ---------- Insert recommendation (MySQL) ---------- */

        const insertResult = await mysqlQuery(
          `INSERT INTO recommendations
             (projectId,
              recommenderUserId,
              createdAt,
              name,
              email,
              phone,
              company,
              rating,
              comment,
              isAnonymous,
              source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            projectId,
            uid,
            now, // ✅ Date object instead of ISO string
            name,
            email ?? null,
            cleanPhone(phone),
            resolvedCompany, // canonical name
            rating,
            comment,
            source,
          ]
        );

        const recommendationId = insertResult.insertId;

        /* ---------- Derive recommender relation for UI labels ---------- */

        let recommenderRelation = "neighbour";

        if (source === "magic" && !uid) {
          recommenderRelation = "friend";
        } else if (isOwner) {
          recommenderRelation = "owner";
        } else {
          recommenderRelation = "neighbour";
        }

        /* ---------- Queue Companies House verification ---------- */

        try {
          queueCompanyVerification({
            recId: recommendationId,
            name: String(resolvedCompany || company),
            locationHint: locationHint || undefined,
            companyNumber:
              resolvedCompanyNumber && String(resolvedCompanyNumber).trim()
                ? String(resolvedCompanyNumber).trim()
                : undefined,
          });
        } catch (e) {
          console.warn(
            "[recommendations.post] queueCompanyVerification failed:",
            e?.message || e
          );
        }

        /* ---------- Auto-like by recommender (unless owner) ---------- */

        try {
          if (uid) {
            const ownerRows = await mysqlQuery(
              `SELECT ownerUserId
                 FROM projects
                WHERE id = ?
                LIMIT 1`,
              [projectId]
            );
            const ownerRow = ownerRows[0] || null;

            if (!ownerRow || String(ownerRow.ownerUserId) !== String(uid)) {
              // Expect a UNIQUE(recommendationId,userId) index so IGNORE behaves like sqlite's INSERT OR IGNORE.
              await mysqlQuery(
                `INSERT IGNORE INTO recommendation_votes
                   (recommendationId, userId, value)
                 VALUES (?, ?, 1)`,
                [recommendationId, uid]
              );
            }
          }
        } catch (e) {
          console.warn("[recommendation auto-like] failed", e?.message || e);
        }

        /* ---------- Photos (MySQL) ---------- */

        const files = Array.isArray(req.files) ? req.files : [];
        if (files.length) {
          const values = [];
          const params = [];

          for (const f of files) {
            const rel = path
              .relative(UPLOAD_DIR, f.path)
              .split(path.sep)
              .join("/");
            const filePath = `/uploads/${rel}`;
            values.push("(?, ?, ?, ?, ?)");
            params.push(
              recommendationId,
              filePath,
              f.mimetype,
              f.size,
              now // ✅ same Date object
            );
          }

          const sql = `
            INSERT INTO recommendation_photos
              (recommendationId, filePath, mime, sizeBytes, createdAt)
            VALUES ${values.join(", ")}
          `;
          try {
            await mysqlQuery(sql, params);
          } catch (e) {
            console.warn(
              "[recommendations.post] inserting recommendation_photos failed:",
              e?.message || e
            );
          }
        }

        /* ---------- Notify project owner (MySQL + legacy notifyUsers) ---------- */

        try {
          const ownerRows = await mysqlQuery(
            `SELECT ownerUserId, name
               FROM projects
              WHERE id = ?
              LIMIT 1`,
            [projectId]
          );
          const ownerRow = ownerRows[0] || null;

          if (
            ownerRow &&
            ownerRow.ownerUserId &&
            String(ownerRow.ownerUserId) !== String(uid)
          ) {
            const ownerUid = ownerRow.ownerUserId;
            const message = `Someone has recommended a tradesperson to your project “${ownerRow.name}”`;
            const linkPath = `/projects/${projectId}`;

            // ✅ Write notification into MySQL for the bell
            try {
              await mysqlQuery(
                `INSERT INTO notifications
                   (userId, type, message, projectId, linkPath, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  ownerUid,
                  "recommendation_new",
                  message,
                  projectId,
                  linkPath,
                  new Date(), // separate timestamp for the notification
                ]
              );
            } catch (e) {
              console.warn(
                "[recommendations.post] failed to insert notification into MySQL:",
                e?.message || e
              );
            }

            // Legacy: still fan out via notifyUsers (SQLite/SSE/email etc.)
            try {
              notifyUsers?.(db, [ownerUid], {
                type: "recommendation_new",
                message,
                projectId,
                linkPath,
              });
            } catch (e) {
              console.warn("[notify-owner platform] failed:", e?.message || e);
            }
          }
        } catch (e) {
          console.warn(
            "[recommendations.post] owner lookup/notify failed:",
            e?.message || e
          );
        }

        // IMPORTANT: we DO NOT return name/email/phone of the recommender here.
        return res.status(201).json({
          ok: true,
          recommendationId,
          resolvedCompany: resolvedCompany || company,
          resolvedBy, // 'db' | 'ch' | 'input'
          recommender: {
            relation: recommenderRelation, // "friend" | "neighbour" | "owner"
            source, // "platform" | "magic"
          },
        });
      } catch (err) {
        console.error("recommendations.post error:", err);
        return res
          .status(500)
          .json({ error: "Internal error creating recommendation" });
      }
    }
  );
};

// // server/routes/projects/recommendations.post.js

// /**
//  * POST /api/projects/:id/recommendations
//  * Auth: required
//  * Body: JSON or multipart/form-data ("photos", up to 8)
//  * Response: 201 {
//  *   ok: true,
//  *   recommendationId,
//  *   resolvedCompany,
//  *   resolvedBy,
//  *   recommender: {
//  *     relation: "friend" | "neighbour" | "owner",
//  *     source: "platform" | "magic"
//  *   }
//  * }
//  *
//  * New behavior:
//  *  - Before inserting, we try to resolve the company name:
//  *      1) Exact (case-insensitive) match in local recommendations table.
//  *      2) If not found and CH helpers are available, query Companies House to find the best match.
//  *  - We then insert using the resolved name so UI grouping displays the normalized builder immediately.
//  *  - Background verification via queueCompanyVerification still runs as before, but now we also pass
//  *    the resolved Companies House company_number if we have it, so Google matching can use that as
//  *    the single source of truth.
//  *  - We store recommender name/email/phone in the DB but NEVER return them in the response.
//  *  - We return only a "relation" label ("friend" vs "neighbour" vs "owner") for UI badges.
//  */
// module.exports = (router, ctx) => {
//   const {
//     db,
//     auth,
//     upload, // multer array("photos", 8) provided in ctx
//     RecSchema, // reuse zod schema from ctx
//     cleanPhone,
//     queueCompanyVerification,
//     notifyUsers,
//     path: nodePath,
//     UPLOAD_DIR,
//   } = ctx;

//   const path = nodePath || require("node:path");
//   const { _roughNameScore } = (() => {
//     try {
//       return require("../lib/companyVerifyHelpers");
//     } catch {
//       return { _roughNameScore: () => 0 };
//     }
//   })();

//   // --- Companies House helpers: ctx OR direct require fallback ---
//   let matchByName = ctx.matchByName;
//   let searchCompanies = ctx.searchCompanies;
//   let getCompanyProfile = ctx.getCompanyProfile;

//   if (!matchByName && !searchCompanies && !getCompanyProfile) {
//     try {
//       // adjust this path/name if your helper file is different
//       const ch = require("../lib/companiesHouse");
//       matchByName = ch.matchByName || matchByName;
//       searchCompanies = ch.searchCompanies || searchCompanies;
//       getCompanyProfile = ch.getCompanyProfile || getCompanyProfile;
//       // console.log("[recommendations.post] Using local Companies House helpers");
//     } catch (e) {
//       console.warn(
//         "[recommendations.post] Companies House helpers not available:",
//         e?.message || e
//       );
//     }
//   }

//   // Conditionally parse multipart
//   const multipartGate = (req, res, next) => {
//     const ct = (req.headers["content-type"] || "").toLowerCase();
//     if (ct.startsWith("multipart/form-data")) {
//       upload.array("photos", 8)(req, res, (err) => {
//         if (err) {
//           return res
//             .status(400)
//             .json({ error: err.message || "Upload failed" });
//         }
//         next();
//       });
//     } else {
//       next();
//     }
//   };

//   router.post(
//     "/projects/:id/recommendations",
//     auth,
//     multipartGate,
//     /** @type {import('express').RequestHandler} */
//     async (req, res) => {
//       try {
//         const projectId = Number(req.params.id);
//         if (!Number.isFinite(projectId)) {
//           return res.status(400).json({ error: "Invalid id" });
//         }

//         const asNumber = (v) =>
//           v === undefined || v === null || v === "" ? undefined : Number(v);

//         // Build payload (works for multipart & json)
//         const payload = {
//           name: String(req.body?.name ?? "").trim(),
//           email: String(req.body?.email ?? "").trim() || undefined,
//           phone: String(req.body?.phone ?? "").trim() || undefined,
//           company: String(req.body?.company ?? "").trim(),
//           rating: asNumber(req.body?.rating) ?? 5,
//           comment: String(req.body?.comment ?? "").trim(),
//         };

//         const parsed = RecSchema.safeParse(payload);
//         if (!parsed.success) {
//           return res
//             .status(400)
//             .json({ error: "Invalid payload", issues: parsed.error.issues });
//         }

//         const { name, email, phone, company, rating, comment } = parsed.data;
//         const now = new Date().toISOString();
//         const uid = req.user?.uid ?? null;

//         const rawSource = String(req.body?.source ?? "")
//           .trim()
//           .toLowerCase();
//         // NOTE: we only allow two values for source to keep it simple.
//         const source = rawSource === "magic" ? "magic" : "platform";

//         /* ---------- Figure out owner vs other user ---------- */

//         let isOwner = false;
//         let projectLocationHint = "";
//         try {
//           const proj = db
//             .prepare(
//               `SELECT ownerUserId, location
//                  FROM projects
//                 WHERE id = ?`
//             )
//             .get(projectId);
//           if (proj) {
//             isOwner = uid && String(uid) === String(proj.ownerUserId);
//             if (isOwner && proj.location) {
//               projectLocationHint = String(proj.location);
//             }
//           }
//         } catch {
//           // if this fails we just won't have location hint / owner flag
//         }

//         // 0) Any explicit hint from the client? (postcode/city)
//         const explicitHint = String(
//           (
//             req.body?.locationHint ||
//             req.body?.companyPostcode ||
//             req.body?.companyCity ||
//             ""
//           ).toString()
//         ).trim();

//         const locationHint = explicitHint || projectLocationHint || undefined;

//         /* ---------- Resolve company name BEFORE insert ---------- */

//         // 1) Try local DB exact match first (case-insensitive)
//         let resolvedCompany = company;
//         let resolvedBy = "input"; // 'db' | 'ch' | 'input'
//         let resolvedCompanyNumber = null; // <-- NEW: keep track of CH number when we have it

//         try {
//           const local = db
//             .prepare(
//               `SELECT company
//                  FROM recommendations
//                 WHERE LOWER(company) = LOWER(?)
//                 ORDER BY id DESC
//                 LIMIT 1`
//             )
//             .get(company);
//           if (local?.company) {
//             resolvedCompany = String(local.company).trim();
//             resolvedBy = "db";
//           }
//         } catch {
//           // ignore local lookup errors
//         }

//         // 2) If not found locally AND CH helpers are available, try to match by name
//         if (
//           resolvedBy === "input" &&
//           (typeof matchByName === "function" ||
//             typeof searchCompanies === "function")
//         ) {
//           try {
//             if (typeof matchByName === "function") {
//               // Prefer the scored matcher where available – this is effectively
//               // the same logic /api/v2/verify-company uses when strategy=match.
//               const result = await matchByName({
//                 name: company,
//                 locationHint,
//               });

//               if (result && result.ok) {
//                 if (result.company?.name) {
//                   resolvedCompany = String(result.company.name).trim();
//                   resolvedBy = "ch";
//                 }
//                 // If the matcher exposes a "best" candidate, capture its number
//                 if (result.best) {
//                   resolvedCompanyNumber = result.best.number || null;
//                 }
//               }
//             } else if (
//               typeof searchCompanies === "function" &&
//               typeof getCompanyProfile === "function"
//             ) {
//               // Fallback path if matchByName isn't on ctx: search -> rough rank -> profile
//               const search = await searchCompanies({
//                 name: company,
//                 itemsPerPage: 50,
//               });
//               const items = Array.isArray(search?.items) ? search.items : [];
//               const ranked = items
//                 .filter((i) => i?.title && i?.company_number)
//                 .map((i) => ({
//                   ...i,
//                   _score: _roughNameScore(i.title, company),
//                 }))
//                 .sort((a, b) => b._score - a._score);
//               const best = ranked[0];
//               if (best && best._score >= 70) {
//                 const profile = await getCompanyProfile(best.company_number);
//                 const chName = profile?.company_name || best.title;
//                 if (chName) {
//                   resolvedCompany = String(chName).trim();
//                   resolvedBy = "ch";
//                 }
//                 resolvedCompanyNumber =
//                   (profile && profile.company_number) ||
//                   best.company_number ||
//                   null;
//               }
//             }
//           } catch (e) {
//             // Non-fatal; we still insert with input/local name
//             console.warn(
//               "[recommendations.post] CH resolve failed:",
//               e?.message || e
//             );
//           }
//         }

//         /* ---------- Insert recommendation ---------- */

//         const info = db
//           .prepare(
//             `INSERT INTO recommendations
//              (projectId, recommenderUserId, createdAt, name, email, phone, company, rating, comment, isAnonymous, source)
//              VALUES
//              (@projectId, @uid, @createdAt, @name, @email, @phone, @company, @rating, @comment, 0, @source)`
//           )
//           .run({
//             projectId,
//             uid,
//             createdAt: now,
//             name,
//             email: email ?? null,
//             phone: cleanPhone(phone),
//             company: resolvedCompany, // <-- store resolved (canonical) name
//             rating,
//             comment,
//             source,
//           });

//         const recommendationId = info.lastInsertRowid;

//         /* ---------- Derive recommender relation for UI labels ---------- */
//         let recommenderRelation = "neighbour";

//         if (source === "magic" && !uid) {
//           recommenderRelation = "friend";
//         } else if (isOwner) {
//           recommenderRelation = "owner";
//         } else {
//           // any other authenticated user that is not the owner
//           recommenderRelation = "neighbour";
//         }

//         // Companies House verification (fire-and-forget)
//         // Now we also pass the resolved company_number when we have it so that
//         // downstream Google review matching can treat that as the single source of truth.
//         try {
//           queueCompanyVerification({
//             recId: recommendationId,
//             name: String(resolvedCompany || company),
//             locationHint: locationHint || undefined,
//             companyNumber:
//               resolvedCompanyNumber && String(resolvedCompanyNumber).trim()
//                 ? String(resolvedCompanyNumber).trim()
//                 : undefined,
//           });
//         } catch (e) {
//           console.warn("[platform-post] queueCompanyVerification failed", e);
//         }

//         // Auto-like by recommender unless they are the owner
//         try {
//           if (uid) {
//             const ownerRow = db
//               .prepare(`SELECT ownerUserId FROM projects WHERE id = ?`)
//               .get(projectId);
//             if (!ownerRow || String(ownerRow.ownerUserId) !== String(uid)) {
//               db.prepare(
//                 `INSERT OR IGNORE INTO recommendation_votes (recommendationId, userId, value)
//                  VALUES (?, ?, 1)`
//               ).run(recommendationId, uid);
//             }
//           }
//         } catch (e) {
//           console.warn("[recommendation auto-like] failed", e);
//         }

//         // photos (store relative path)
//         const files = Array.isArray(req.files) ? req.files : [];
//         if (files.length) {
//           const stmt = db.prepare(
//             `INSERT INTO recommendation_photos
//                (recommendationId, filePath, mime, sizeBytes, createdAt)
//              VALUES (?, ?, ?, ?, ?)`
//           );
//           for (const f of files) {
//             const rel = path
//               .relative(UPLOAD_DIR, f.path)
//               .split(path.sep)
//               .join("/");
//             stmt.run(
//               recommendationId,
//               `/uploads/${rel}`,
//               f.mimetype,
//               f.size,
//               now
//             );
//           }
//         }

//         // Notify project owner
//         try {
//           const ownerRow = db
//             .prepare(`SELECT ownerUserId, name FROM projects WHERE id = ?`)
//             .get(projectId);

//           if (
//             ownerRow &&
//             ownerRow.ownerUserId &&
//             String(ownerRow.ownerUserId) !== String(uid)
//           ) {
//             notifyUsers?.(db, [ownerRow.ownerUserId], {
//               type: "recommendation_new",
//               message: `Someone has recommended a tradesperson to your project “${ownerRow.name}”`,
//               projectId,
//               linkPath: `/builders/${recommendationId}`,
//             });
//           }
//         } catch (e) {
//           console.warn("[notify-owner platform] failed", e);
//         }

//         // IMPORTANT:
//         // We DO NOT return name/email/phone of the recommender here.
//         return res.status(201).json({
//           ok: true,
//           recommendationId,
//           resolvedCompany: resolvedCompany || company,
//           resolvedBy, // 'db' | 'ch' | 'input' (for diagnostics)
//           recommender: {
//             relation: recommenderRelation, // "friend" | "neighbour" | "owner"
//             source, // "platform" | "magic"
//           },
//         });
//       } catch (err) {
//         console.error("recommendations.post error:", err);
//         return res
//           .status(500)
//           .json({ error: "Internal error creating recommendation" });
//       }
//     }
//   );
// };
