// server/routes/meta/plans.get.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

// Parse the object literal assigned to `export const PLANS = { ... } as const;`
function parsePlansTs(filePath) {
  const src = fs.readFileSync(filePath, "utf8");

  const anchor = "export const PLANS =";
  const startIdx = src.indexOf(anchor);
  if (startIdx === -1) throw new Error("PLANS export not found in plans.ts");

  // Find the first { after the anchor
  let i = src.indexOf("{", startIdx);
  if (i === -1) throw new Error("Opening brace for PLANS not found");

  // Walk braces to find the matching closing }
  let depth = 0;
  let end = -1;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Could not balance braces for PLANS object");

  // Extract and clean the object literal
  let objLiteral = src.slice(src.indexOf("{", startIdx), end + 1);
  // Remove trailing "as const" or whitespace/semicolons after the object
  objLiteral = objLiteral.replace(/\s*as\s+const\s*;?\s*$/m, "");

  // Evaluate in a clean sandbox; allow only plain JS object features
  const sandbox = {};
  vm.createContext(sandbox);
  const code = `(${objLiteral})`;
  const result = vm.runInContext(code, sandbox, { timeout: 1000 });

  if (!result || typeof result !== "object") {
    throw new Error("Parsed PLANS is not an object");
  }
  return result;
}

let cached = null; // { body, etag, mtimeMs }
function loadPlans() {
  const plansPath = path.resolve(__dirname, "../../../shared/config/plans.ts");
  const stat = fs.statSync(plansPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached; // fresh
  }

  const PLANS = parsePlansTs(plansPath);
  const body = JSON.stringify(PLANS);
  const etag = `"pl-${crypto.createHash("sha1").update(body).digest("hex")}"`;

  cached = { body, etag, mtimeMs: stat.mtimeMs };
  return cached;
}

module.exports = (router, ctx) => {
  const send = (req, res) => {
    try {
      const { body, etag } = loadPlans();

      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Cache-Control",
        "public, max-age=300, stale-while-revalidate=600"
      );
      res.setHeader("ETag", etag);
      res.status(200).send(body);
    } catch (err) {
      const msg =
        (err && (err.message || err.toString())) ||
        "Failed to load plans configuration";
      if (ctx && ctx.log && ctx.log.error) ctx.log.error("[plans] " + msg);
      res.status(500).json({ error: "plans_load_error", message: msg });
    }
  };

  router.get("/meta/plans", send);
  router.get("/plans", send);

  if (ctx && ctx.log)
    ctx.log.info("[routes] mounted: GET /api/meta/plans, /api/plans");
};
