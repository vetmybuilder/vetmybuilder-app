// tests/server/slack.spec.ts
//
// Covers the postSlackMessage helper. Key guarantees:
//   - No SLACK_WEBHOOK_URL configured -> no HTTP call, no error (so dev
//     and CI work without Slack).
//   - 2xx response -> returns true.
//   - Non-2xx and network errors are swallowed (return false), never
//     thrown - the calling route must not break because Slack hiccupped.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { postSlackMessage } = require("../../server/lib/slack.js");

describe("postSlackMessage", () => {
  const savedEnv = process.env.SLACK_WEBHOOK_URL;
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/services/T/B/secret";
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = savedEnv;
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("returns false (no-op) when SLACK_WEBHOOK_URL is unset", async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const ok = await postSlackMessage({ text: "hi" });
    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs JSON to the webhook and returns true on 200", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "ok",
    });
    global.fetch = fetchSpy as any;

    const ok = await postSlackMessage({ text: "hello" });
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/T/B/secret");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ text: "hello" });
  });

  it("returns false on non-2xx without throwing", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "channel_not_found",
    });
    global.fetch = fetchSpy as any;

    const ok = await postSlackMessage({ text: "hi" });
    expect(ok).toBe(false);
  });

  it("returns false on a thrown fetch (network down, timeout) without bubbling", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    global.fetch = fetchSpy as any;

    const ok = await postSlackMessage({ text: "hi" });
    expect(ok).toBe(false);
  });
});
