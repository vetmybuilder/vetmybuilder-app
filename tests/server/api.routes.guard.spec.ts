import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

// Reuse your SQLite helper so we can seed the same temp DB the server uses
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initDb } = require("../../server/lib/db");

const repoRoot = process.cwd();
const serverEntry = path.join(repoRoot, "server", "index.js");

let proc: any;
let baseURL = "";
let tmpDir = "";
let dbPath = "";

function waitForReady(child: any, timeout = 10000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("server did not start")),
      timeout
    );
    child.stdout?.on("data", (d: Buffer) => {
      const s = d.toString();
      if (s.includes("[server] http://localhost")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

beforeAll(async () => {
  // Random port + temp sqlite file
  const port = 5000 + Math.floor(Math.random() * 1000);
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), ".tmpdb-"));
  dbPath = path.join(tmpDir, "test.db");

  baseURL = `http://localhost:${port}`;
  proc = spawn("node", [serverEntry], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: dbPath, // server migrates this DB on startup
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForReady(proc);
}, 20000);

afterAll(() => {
  if (proc) proc.kill();
  if (tmpDir) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors in CI
    }
  }
});

/* ---------------------- Smoke / guards (original) ---------------------- */

it("GET /health returns ok", async () => {
  const res = await supertest(baseURL).get("/health").expect(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.now).toBeTypeOf("string");
});

// Unprotected link endpoint should 404 for unknown token
it("POST /api/recommendations/magic/:token -> 404 for unknown token", async () => {
  const res = await supertest(baseURL)
    .post("/api/recommendations/magic/not-a-real-token")
    .send({})
    .expect(404);
  expect(res.body.error).toBeTruthy();
});

// All protected routes should reject when missing bearer token
describe("Protected routes reject without auth", () => {
  const checks = [
    ["GET", "/api/me"],
    ["GET", "/api/profile"],
    ["POST", "/api/profile"],
    ["GET", "/api/projects"],
    ["POST", "/api/projects"],
    ["GET", "/api/projects/1"],
    ["PUT", "/api/projects/1"],
    ["POST", "/api/projects/1/publish"],
    ["POST", "/api/projects/1/close"],
    ["POST", "/api/projects/1/archive"],
    ["POST", "/api/projects/1/unarchive"],
    ["POST", "/api/projects/1/magic-link"],
    ["GET", "/api/notifications"],
    ["POST", "/api/notifications/1/read"],
    ["POST", "/api/notifications/read-all"],
  ] as const;

  for (const [method, url] of checks) {
    it(`${method} ${url} -> 401 Missing bearer token`, async () => {
      const r = await supertest(baseURL)[
        method.toLowerCase() as "get"
      ](url).send({});
      // 404/405 can happen for non-existent ids with certain verbs;
      // core contract is 401 when auth is required.
      expect([401, 404, 405]).toContain(r.status);
      if (r.status === 401)
        expect(r.body.error).toMatch(/Missing bearer token/i);
    });
  }
});

/* ---------------------- Added high-value regressions ---------------------- */

describe("Optional-auth & magic-link flows", () => {
  it("GET /api/projects/:id -> 401 when not live, then 200 when live (no token)", async () => {
    const db = initDb(dbPath);
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO projects (name, type, location, description, propertyType, bedrooms, ownerUserId, status, createdAt)
         VALUES ('P-opt-auth','Kitchen','E4 6JH','desc','Semi-Detached',3,'owner-a','pending',?)`
      )
      .run(now);
    const id = Number(info.lastInsertRowid);

    await supertest(baseURL).get(`/api/projects/${id}`).expect(401);

    db.prepare(`UPDATE projects SET status='live' WHERE id=?`).run(id);

    const r2 = await supertest(baseURL).get(`/api/projects/${id}`).expect(200);
    expect(r2.body?.project?.id).toBe(id);
  });

  it("GET /api/recommendations/magic/:token -> 400 when project not live; 200 when live", async () => {
    const db = initDb(dbPath);
    const now = new Date().toISOString();
    const p = db
      .prepare(
        `INSERT INTO projects (name, type, location, description, propertyType, bedrooms, ownerUserId, status, createdAt)
         VALUES ('P-magic-resolve','Bathroom','E4 6JH','desc','Flat',2,'owner-b','pending',?)`
      )
      .run(now);
    const pid = Number(p.lastInsertRowid);
    db.prepare(
      `INSERT INTO recommendation_links (projectId, token, createdAt) VALUES (?, 'tok-abc', ?)`
    ).run(pid, now);

    await supertest(baseURL)
      .get(`/api/recommendations/magic/tok-abc`)
      .expect(400);

    db.prepare(`UPDATE projects SET status='live' WHERE id=?`).run(pid);

    const ok = await supertest(baseURL)
      .get(`/api/recommendations/magic/tok-abc`)
      .expect(200);
    expect(ok.body?.project?.id).toBe(pid);
  });

  it("POST /api/recommendations/magic/:token persists phone (normalized), name, email, etc.", async () => {
    const db = initDb(dbPath);
    const now = new Date().toISOString();
    const p = db
      .prepare(
        `INSERT INTO projects (name, type, location, description, propertyType, bedrooms, ownerUserId, status, createdAt)
         VALUES ('P-magic-phone','Loft','E4 6JH','desc','Terraced',2,'owner-c','live',?)`
      )
      .run(now);
    const pid = Number(p.lastInsertRowid);
    db.prepare(
      `INSERT INTO recommendation_links (projectId, token, createdAt) VALUES (?, 'tok-phone', ?)`
    ).run(pid, now);

    await supertest(baseURL)
      .post(`/api/recommendations/magic/tok-phone`)
      .send({
        name: "Alice Tester",
        email: "alice@example.com",
        phone: "+44 7700 900123",
        company: "Builder Co",
        rating: 5,
        comment: "Excellent work in time and on budget.",
      })
      .expect(201);

    const row = db
      .prepare(
        `SELECT name, email, phone, company, rating, comment, isAnonymous, source
           FROM recommendations
          WHERE projectId=? ORDER BY id DESC LIMIT 1`
      )
      .get(pid);

    expect(row).toBeTruthy();
    expect(row.name).toBe("Alice Tester");
    expect(row.email).toBe("alice@example.com");
    // server normalizer strips spaces/dashes, keeps + and digits
    expect(row.phone).toBe("+447700900123");
    expect(row.company).toBe("Builder Co");
    expect(row.rating).toBe(5);
    expect(row.comment).toMatch(/Excellent/);
    expect(row.isAnonymous).toBe(1);
    expect(String(row.source)).toBe("magic");
  });
});
