import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { attachPayments } from "../../../server/boot/attachPayments";

describe("attachPayments — MOCK_PAYMENTS env var", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.MOCK_EXTERNAL_SERVICES;
    delete process.env.MOCK_PAYMENTS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns Stripe driver when STRIPE_SECRET_KEY is set and MOCK_PAYMENTS is unset", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
    const ctx: any = {};
    attachPayments(ctx);
    expect(ctx.payments.isStripe).toBe(true);
  });

  it("returns mock driver when MOCK_PAYMENTS=1 even with STRIPE_SECRET_KEY set", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
    process.env.MOCK_PAYMENTS = "1";
    const ctx: any = {};
    attachPayments(ctx);
    expect(ctx.payments.isStripe).toBeFalsy();
  });

  it("falls back to MOCK_EXTERNAL_SERVICES when MOCK_PAYMENTS is unset (backward compat)", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
    process.env.MOCK_EXTERNAL_SERVICES = "1";
    const ctx: any = {};
    attachPayments(ctx);
    expect(ctx.payments.isStripe).toBeFalsy();
  });

  it("MOCK_PAYMENTS=0 wins over MOCK_EXTERNAL_SERVICES=1 (lets staging opt back in)", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
    process.env.MOCK_EXTERNAL_SERVICES = "1";
    process.env.MOCK_PAYMENTS = "0";
    const ctx: any = {};
    attachPayments(ctx);
    expect(ctx.payments.isStripe).toBe(true);
  });
});
