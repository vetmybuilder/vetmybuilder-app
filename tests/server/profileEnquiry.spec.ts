// tests/server/profileEnquiry.spec.ts
//
// POST /api/t/:slug/enquiry - public enquiry form. No auth. Inserts a
// profile_enquiries row and notifies the tradesperson.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// notifyProfileEnquiry is fire-and-forget inside the route. Its own logic is
// covered by tests/server/notifyProfileEnquiry.spec.ts. Here we mock its
// dependency (pushSender) so the real helper can run harmlessly, and assert
// the endpoint's own behaviour: DB insert, response, rate-limiting.
vi.mock("../../server/lib/pushSender.js", () => ({
  sendPushToUser: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const enquiryRoute = require("../../server/routes/public/profile-enquiry.post.js");

function loadHandler(mysqlQuery: any) {
  const handlers: Record<string, (req: any, res: any) => Promise<void>> = {};
  const fakeRouter: any = {
    get: () => {},
    post: (path: string, handler: any) => {
      handlers[path] = handler;
    },
    patch: () => {},
    put: () => {},
    delete: () => {},
  };
  enquiryRoute(fakeRouter, { mysqlQuery, broadcastNotification: vi.fn() });
  return handlers["/t/:slug/enquiry"];
}

function mockRes() {
  const res: any = { __sent: false };
  res.status = vi.fn().mockImplementation(() => res);
  res.json = vi.fn().mockImplementation(() => {
    res.__sent = true;
    return res;
  });
  return res;
}

function req(slug: string, body: any, ip = "1.2.3.4") {
  return { params: { slug }, body, headers: { "x-real-ip": ip }, ip };
}


describe("POST /api/t/:slug/enquiry", () => {
  it("returns 400 when name or phone is missing", async () => {
    const handler = loadHandler(vi.fn());
    const res = mockRes();
    await handler(req("elegant", { name: "", phone: "" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the slug has no active+public tradesperson", async () => {
    const mysql = vi.fn().mockResolvedValue([]);
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler(req("ghost", { name: "Jo", phone: "0700" }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("inserts the enquiry and fires the notification", async () => {
    const mysql = vi.fn().mockImplementation(async (sql: string) => {
      if (/SELECT user_id FROM tradesmen/.test(sql)) return [{ user_id: "u_eleg" }];
      if (/INSERT INTO profile_enquiries/.test(sql)) return { insertId: 1 };
      return [];
    });
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler(req("elegant", { name: "Jo Bloggs", phone: "07000", message: "Need a wall" }), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    // INSERT happened with the right values
    const insertCall = mysql.mock.calls.find((c: any[]) => /INSERT INTO profile_enquiries/.test(c[0]));
    expect(insertCall).toBeTruthy();
    expect(insertCall[1]).toEqual(["u_eleg", "Jo Bloggs", "07000", null, "Need a wall"]);
  });

  it("only requires status=active AND profile_public=1 lookups", async () => {
    const mysql = vi.fn().mockResolvedValue([]);
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler(req("elegant", { name: "Jo", phone: "0700" }), res);
    const sql = mysql.mock.calls[0][0];
    expect(sql).toMatch(/status\s*=\s*'active'/);
    expect(sql).toMatch(/profile_public\s*=\s*1/);
  });

  it("rate-limits after 5 enquiries per IP per hour", async () => {
    const mysql = vi.fn().mockImplementation(async (sql: string) => {
      if (/SELECT user_id FROM tradesmen/.test(sql)) return [{ user_id: "u_eleg" }];
      return {};
    });
    const handler = loadHandler(mysql);
    // 5 allowed
    for (let i = 0; i < 5; i++) {
      const res = mockRes();
      await handler(req("ratelimit-slug", { name: "Jo", phone: "0700" }, "9.9.9.9"), res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    }
    // 6th blocked
    const res6 = mockRes();
    await handler(req("ratelimit-slug", { name: "Jo", phone: "0700" }, "9.9.9.9"), res6);
    expect(res6.status).toHaveBeenCalledWith(429);
  });
});
