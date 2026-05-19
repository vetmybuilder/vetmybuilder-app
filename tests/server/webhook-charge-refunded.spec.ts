import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function buildApp(eventType: string, eventObj: any, handlersOverride: any = {}) {
  const handlers = {
    activateUnlock: vi.fn().mockResolvedValue(undefined),
    subscriptionCheckoutCompleted: vi.fn().mockResolvedValue(undefined),
    subscriptionUpdated: vi.fn().mockResolvedValue(undefined),
    subscriptionDeleted: vi.fn().mockResolvedValue(undefined),
    chargeRefunded: vi.fn().mockResolvedValue(undefined),
    ...handlersOverride,
  };

  const app = express();
  const router = express.Router();
  const ctx: any = {
    mysqlQuery: vi.fn(),
    payments: {
      isStripe: true,
      verifyWebhook: () => ({
        id: "evt_test",
        type: eventType,
        data: { object: eventObj },
      }),
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    _handlers: handlers,
  };
  require("../../server/routes/payments/stripe.webhook.post")(router, ctx);
  app.use("/api", router);
  return { app, handlers };
}

describe("stripe webhook - charge.refunded dispatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches charge.refunded events to the chargeRefunded handler", async () => {
    const { app, handlers } = buildApp("charge.refunded", {
      id: "ch_test_1",
      payment_intent: "pi_test_1",
      refunds: { data: [{ id: "re_test_1", amount: 999 }] },
    });
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "sig_test")
      .send("{}");
    expect(res.status).toBe(200);
    expect(handlers.chargeRefunded).toHaveBeenCalledOnce();
    expect(handlers.activateUnlock).not.toHaveBeenCalled();
  });
});

const {
  chargeRefunded,
} = require("../../server/lib/payments/handlers/chargeRefunded");

describe("chargeRefunded handler", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeCtx() {
    const queries: any[] = [];
    const mysqlQuery = vi.fn(async (...args: any[]) => {
      queries.push(args);
      const sql = String(args[0]);
      // First call inside the handler is the dedupe SELECT; return empty
      // so the handler proceeds to log.
      if (sql.startsWith("SELECT") && sql.includes("activity_log")) return [];
      // payments_oneoff lookup returns no matching row by default.
      if (sql.startsWith("SELECT") && sql.includes("payments_oneoff")) return [];
      return { insertId: 1 };
    });
    return {
      queries,
      ctx: {
        mysqlQuery,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        logActivity: vi.fn(async (event: string, _l: string, actor: string, detail: string) => {
          await mysqlQuery(
            `INSERT INTO activity_log (event, level, actor_uid, detail) VALUES (?, ?, ?, ?)`,
            [event, "info", actor, detail],
          );
        }),
      },
    };
  }

  const event = {
    id: "evt_charge_refunded_1",
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_test_1",
        payment_intent: "pi_test_1",
        refunds: { data: [{ id: "re_test_1", amount: 999 }] },
      },
    },
  };

  it("logs payment.refunded with the refund id", async () => {
    const { ctx, queries } = makeCtx();
    await chargeRefunded({ event, ctx });
    expect(ctx.logActivity).toHaveBeenCalledWith(
      "payment.refunded",
      "info",
      expect.any(String),
      expect.stringContaining("re_test_1"),
    );
    const insert = queries.find((c) =>
      String(c[0]).includes("INSERT INTO activity_log"),
    );
    expect(insert).toBeTruthy();
  });

  it("is idempotent - second delivery of the same refund does not log again", async () => {
    const { ctx } = makeCtx();
    // Override mysqlQuery so the second invocation's dedupe SELECT
    // returns a row, simulating "already logged".
    let callCount = 0;
    ctx.mysqlQuery = vi.fn(async (sql: string) => {
      if (String(sql).startsWith("SELECT") && String(sql).includes("activity_log")) {
        callCount += 1;
        return callCount === 1 ? [] : [{ id: 1 }];
      }
      if (String(sql).startsWith("SELECT") && String(sql).includes("payments_oneoff")) {
        return [];
      }
      return { insertId: 1 };
    });
    ctx.logActivity = vi.fn();

    await chargeRefunded({ event, ctx });
    await chargeRefunded({ event, ctx });

    expect(ctx.logActivity).toHaveBeenCalledTimes(1);
  });
});
