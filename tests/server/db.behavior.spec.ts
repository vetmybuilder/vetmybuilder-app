import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";

// CJS import from server
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initDb } = require("../../server/lib/db");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runMigrations } = require("../../server/lib/migrate");
import { createProject, createUserProfile } from "./factories";

let db: any;

beforeAll(() => {
  const tmpDir = fs.mkdtempSync(path.join(process.cwd(), ".tmpdb-"));
  const dbPath = path.join(tmpDir, "behavior.db");
  db = initDb(dbPath);
  runMigrations(db, path.join(process.cwd(), "server", "migrations"));
});

describe("Project status transitions & notifications (DB behavior)", () => {
  it("archiving and unarchiving toggles status and timestamps", () => {
    const owner = "owner-1";
    const p = createProject(db, { ownerUserId: owner, status: "pending" });
    // Archive
    db.prepare(
      "UPDATE projects SET status='archived', archivedAt=? WHERE id=?"
    ).run(new Date().toISOString(), p.id);
    let row = db
      .prepare("SELECT status, archivedAt FROM projects WHERE id=?")
      .get(p.id);
    expect(row.status).toBe("archived");
    expect(row.archivedAt).toBeTruthy();

    // Unarchive
    db.prepare(
      "UPDATE projects SET status='pending', archivedAt=NULL WHERE id=?"
    ).run(p.id);
    row = db
      .prepare("SELECT status, archivedAt FROM projects WHERE id=?")
      .get(p.id);
    expect(row.status).toBe("pending");
    expect(row.archivedAt).toBeNull();
  });

  it("publishing to LIVE creates notifications for nearby users (city match)", () => {
    const owner = "owner-2";
    const p = createProject(db, {
      ownerUserId: owner,
      location: "Chingford E4",
      status: "pending",
    });

    // two users in DB: one nearby, one not; and exclude owner
    createUserProfile(db, { userId: "u-near", city: "chingford" });
    createUserProfile(db, { userId: "u-far", city: "liverpool" });
    createUserProfile(db, { userId: owner, city: "chingford" });

    // Mimic server publish: set LIVE and fan-out notifications to area users
    const now = new Date().toISOString();
    db.prepare("UPDATE projects SET status='live' WHERE id=?").run(p.id);

    // Derive city token from project.location (server tokenizes more, but city check suffices for behavior test)
    const city = "chingford";
    const areaUsers = db
      .prepare(
        "SELECT up.userId AS uid FROM user_profiles up WHERE (LOWER(up.city)=?) AND up.userId != ?"
      )
      .all(city, owner)
      .map((r: any) => r.uid);

    for (const uid of areaUsers) {
      db.prepare(
        "INSERT INTO notifications(userId, type, message, projectId, linkPath, createdAt) VALUES(?,?,?,?,?,?)"
      ).run(
        uid,
        "project_live",
        `A project near you went live: ${p.name}`,
        p.id,
        `/projects/${p.id}`,
        now
      );
    }

    const cnt = db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE projectId=?")
      .get(p.id).c;
    expect(cnt).toBeGreaterThanOrEqual(1);
    const byUser = db
      .prepare(
        "SELECT COUNT(*) AS c FROM notifications WHERE userId='u-near' AND projectId=?"
      )
      .get(p.id).c;
    const excludedOwner = db
      .prepare(
        "SELECT COUNT(*) AS c FROM notifications WHERE userId=? AND projectId=?"
      )
      .get(owner, p.id).c;
    expect(byUser).toBeGreaterThanOrEqual(1);
    expect(excludedOwner).toBe(0);
  });

  it("recommendations table accepts and persists phone numbers", () => {
    // Arrange: create a live project
    const p = createProject(db, { ownerUserId: "owner-3", status: "live" });

    // Act: insert a recommendation with a phone number (direct DB insert, like the server would)
    const now = new Date().toISOString();
    const phone = "+44 7700 900123";
    db.prepare(
      `INSERT INTO recommendations
      (projectId, recommenderUserId, createdAt, name, email, phone, company, rating, comment, isAnonymous, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      p.id,
      null, // recommenderUserId (anonymous magic-link flow)
      now,
      "Test Recommender",
      "test@example.com",
      phone, // <- phone should be accepted by the schema/migration
      "Builder Ltd",
      5,
      "Great work",
      1, // isAnonymous
      "magic"
    );

    // Assert: value is persisted
    const row = db
      .prepare(
        `SELECT phone FROM recommendations WHERE projectId=? ORDER BY id DESC LIMIT 1`
      )
      .get(p.id);

    expect(row).toBeTruthy();
    expect(row.phone).toBe(phone);
  });
});
