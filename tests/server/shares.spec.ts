import { afterAll, beforeAll, describe, it, expect } from "vitest";
import supertest from "supertest";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const repoRoot = process.cwd();
const serverEntry = path.join(repoRoot, "server", "index.js");

let proc: any;
let baseURL = "";
let tmpDir = "";

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
  const port = 5000 + Math.floor(Math.random() * 1000);
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), ".tmpdb-"));
  const dbPath = path.join(tmpDir, "test.db");

  baseURL = `http://localhost:${port}`;
  proc = spawn("node", [serverEntry], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: dbPath,
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

describe("GET /api/tradesmen/shares — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await supertest(baseURL).get("/api/tradesmen/shares");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing bearer token/i);
  });

  it("returns 401 with a bogus bearer token", async () => {
    const res = await supertest(baseURL)
      .get("/api/tradesmen/shares")
      .set("Authorization", "Bearer not-a-real-token");
    expect([401, 403]).toContain(res.status);
  });
});

describe("POST /api/tradesmen/shares — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await supertest(baseURL)
      .post("/api/tradesmen/shares")
      .send({ projectId: 1 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing bearer token/i);
  });
});
