import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const fakeAuth = (req: any, _res: any, next: any) => {
  req.user = { uid: req.headers["x-test-uid"] || "owner-uid" };
  next();
};

function makeOwnerRow(ownerUserId = "owner-uid") {
  return [{ ownerUserId }];
}

function setupDismissApp(recProjectRows: any[]) {
  const mysqlQuery = vi.fn(async (sql: string) => {
    if (/FROM\s+recommendations\s+r\s+JOIN\s+projects/i.test(sql)) return recProjectRows;
    if (/UPDATE\s+recommendations/i.test(sql)) return { affectedRows: 1 };
    return [];
  });
  const app = express();
  app.use(express.json());
  const route = require("../../server/routes/recommendations/dismiss-from-deck.post");
  route(app, { auth: fakeAuth, mysqlQuery });
  return { app, mysqlQuery };
}

function setupUnfavouriteApp(recProjectRows: any[]) {
  const mysqlQuery = vi.fn(async (sql: string) => {
    if (/FROM\s+recommendations\s+r\s+JOIN\s+projects/i.test(sql)) return recProjectRows;
    if (/UPDATE\s+recommendations/i.test(sql)) return { affectedRows: 1 };
    return [];
  });
  const app = express();
  app.use(express.json());
  const route = require("../../server/routes/recommendations/unfavourite.post");
  route(app, { auth: fakeAuth, mysqlQuery });
  return { app, mysqlQuery };
}

describe("POST /recommendations/:id/dismiss-from-deck", () => {
  it("sets deck_dismissed_at and returns 200", async () => {
    const { app, mysqlQuery } = setupDismissApp(makeOwnerRow());

    const res = await request(app).post("/recommendations/42/dismiss-from-deck");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const updateCall = mysqlQuery.mock.calls.find(([sql]: [string]) =>
      /UPDATE\s+recommendations\s+SET\s+deck_dismissed_at/i.test(sql),
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall![1]).toEqual([42]);
  });

  it("returns 403 if caller is not the project owner", async () => {
    const { app } = setupDismissApp([{ ownerUserId: "someone-else" }]);

    const res = await request(app).post("/recommendations/42/dismiss-from-deck");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Not your project");
  });

  it("returns 404 if rec does not exist", async () => {
    const { app } = setupDismissApp([]);

    const res = await request(app).post("/recommendations/99/dismiss-from-deck");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Recommendation not found");
  });

  it("returns 400 for a non-numeric id", async () => {
    const { app } = setupDismissApp([]);

    const res = await request(app).post("/recommendations/abc/dismiss-from-deck");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid id");
  });
});

describe("POST /recommendations/:id/unfavourite", () => {
  it("sets homeowner_unfavourited_at and returns 200", async () => {
    const { app, mysqlQuery } = setupUnfavouriteApp(makeOwnerRow());

    const res = await request(app).post("/recommendations/42/unfavourite");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const updateCall = mysqlQuery.mock.calls.find(([sql]: [string]) =>
      /UPDATE\s+recommendations\s+SET\s+homeowner_unfavourited_at/i.test(sql),
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall![1]).toEqual([42]);
  });

  it("returns 403 if caller is not the project owner", async () => {
    const { app } = setupUnfavouriteApp([{ ownerUserId: "someone-else" }]);

    const res = await request(app).post("/recommendations/42/unfavourite");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Not your project");
  });

  it("returns 404 if rec does not exist", async () => {
    const { app } = setupUnfavouriteApp([]);

    const res = await request(app).post("/recommendations/99/unfavourite");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Recommendation not found");
  });

  it("returns 400 for a non-numeric id", async () => {
    const { app } = setupUnfavouriteApp([]);

    const res = await request(app).post("/recommendations/abc/unfavourite");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid id");
  });
});
