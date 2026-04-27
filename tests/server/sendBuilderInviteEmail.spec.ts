import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: { send: sendMock },
  })),
}));

import { sendBuilderInviteEmail } from "../../server/lib/sendBuilderInviteEmail";

// Fake resend client whose emails.send delegates to sendMock — used to bypass
// CJS require-cache isolation which can prevent vi.mock("resend") intercepting
// native require() calls made inside the server module.
const fakeResendClient = { emails: { send: sendMock } };

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ id: "msg-123" });
  process.env.RESEND_API_KEY = "test-key";
  process.env.PUBLIC_APP_URL = "https://vetmybuilder.com";
});

function makeFakeQuery() {
  const calls: { sql: string; params: any[] }[] = [];
  const fn = vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (/INSERT\s+INTO\s+recommendation_invites/i.test(sql)) return { insertId: 1 };
    return [];
  });
  return { fn, calls };
}

describe("sendBuilderInviteEmail", () => {
  it("sends an email with the company name, recommender first name, and signup URL", async () => {
    const { fn } = makeFakeQuery();
    await sendBuilderInviteEmail({
      mysqlQuery: fn,
      recommendationId: 99,
      recipientEmail: "hello@hudsontiling.co.uk",
      builderCompanyName: "Hudson & Sons Tiling",
      recommenderFirstName: "Priya",
      projectArea: "E4",
      _resendClient: fakeResendClient,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const args = sendMock.mock.calls[0][0];
    expect(args.to).toBe("hello@hudsontiling.co.uk");
    expect(args.subject).toMatch(/recommended/i);
    expect(args.html).toContain("Hudson &amp; Sons Tiling");
    expect(args.html).toContain("Someone");
    expect(args.html).toContain("E4");
    expect(args.html).toContain("https://vetmybuilder.com/tradesman/login");
  });

  it("inserts the invite row first, then updates emailSentAt after send", async () => {
    const { fn, calls } = makeFakeQuery();
    const fakeResendClient = { emails: { send: vi.fn().mockResolvedValue({ id: "msg-1" }) } };
    await sendBuilderInviteEmail({
      mysqlQuery: fn,
      recommendationId: 42,
      recipientEmail: "hello@example.com",
      builderCompanyName: "Acme",
      recommenderFirstName: "Sam",
      projectArea: "N1",
      _resendClient: fakeResendClient,
    });

    const insertCall = calls.find((c) => /INSERT\s+INTO\s+recommendation_invites/i.test(c.sql));
    expect(insertCall).toBeDefined();
    expect(insertCall!.params[0]).toBe(42);
    expect(insertCall!.params[1]).toBe("hello@example.com");

    const updateCall = calls.find((c) => /UPDATE\s+recommendation_invites/i.test(c.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall!.params[0]).toBeInstanceOf(Date);
    expect(updateCall!.params[1]).toBe(42);
  });

  it("returns ok=false and does not throw if RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const { fn } = makeFakeQuery();
    const result = await sendBuilderInviteEmail({
      mysqlQuery: fn,
      recommendationId: 1,
      recipientEmail: "x@y.com",
      builderCompanyName: "X",
      recommenderFirstName: "Y",
      projectArea: "Z",
    });
    expect(result).toEqual({ ok: false, error: "RESEND_API_KEY not configured" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns ok=false if recipientEmail is empty", async () => {
    const { fn } = makeFakeQuery();
    const result = await sendBuilderInviteEmail({
      mysqlQuery: fn,
      recommendationId: 1,
      recipientEmail: "",
      builderCompanyName: "X",
      recommenderFirstName: "Y",
      projectArea: "Z",
    });
    expect(result).toEqual({ ok: false, error: "no recipient email" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns ok=false with the Resend error message when the API rejects", async () => {
    const { fn } = makeFakeQuery();
    const fakeResendClient = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { name: "validation_error", message: "domain not verified" },
        }),
      },
    };
    const result = await sendBuilderInviteEmail({
      mysqlQuery: fn,
      recommendationId: 7,
      recipientEmail: "test@example.com",
      builderCompanyName: "Test Co",
      recommenderFirstName: "Sam",
      projectArea: "E4",
      _resendClient: fakeResendClient,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("domain not verified");
  });
});
