import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dnsModule = require("dns");

// Import the module under test AFTER dns is imported so they share the
// same module instance.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyWebsite, isPrivateIp } = require("../../server/lib/webPresence.js");

// We spy on dns.promises.lookup in-place. vi.spyOn returns a mock that
// vitest's `restoreMocks: true` cleans up automatically after each test,
// so the real DNS is never touched outside of this file.
let dnsLookupSpy: ReturnType<typeof vi.spyOn>;

// Helper - make global fetch return a plain Response-ish object so we
// can assert verifyWebsite drops it (or returns ok=true for the happy
// case). We never want a real HTTP call leaking out of the test.
function makeFetchResponse(opts: {
  status?: number;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  const headersMap = new Map<string, string>(
    Object.entries(opts.headers || { "content-type": "text/html" })
  );
  return {
    status: opts.status ?? 200,
    url: opts.url ?? "https://example.com/",
    headers: {
      get: (k: string) => headersMap.get(k.toLowerCase()) ?? null,
    },
    text: async () => opts.body ?? "",
  } as any;
}

describe("webPresence SSRF hardening", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Re-install the spy each test - vitest's restoreMocks cleans up
    // after each test, so we set it up fresh here.
    dnsLookupSpy = vi.spyOn(dnsModule.promises, "lookup");
    fetchSpy = vi.fn();
    // @ts-expect-error - install a global fetch stub
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    // @ts-expect-error - tear down the stub
    delete globalThis.fetch;
  });

  it("rejects http://127.0.0.1/ without DNS or fetch", async () => {
    const r = await verifyWebsite("http://127.0.0.1/", {
      vendorName: "Acme",
      timeoutMs: 100,
    });
    expect(r.ok).toBe(false);
    // Literal private-IP host is dropped by normalizeUrl, so we surface
    // invalid_url. Either way, fetch must not have been called.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects http://169.254.169.254/latest/meta-data/ (AWS metadata)", async () => {
    const r = await verifyWebsite("http://169.254.169.254/latest/meta-data/", {
      vendorName: "Acme",
      timeoutMs: 100,
    });
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects http://10.0.0.1/", async () => {
    const r = await verifyWebsite("http://10.0.0.1/", {
      vendorName: "Acme",
      timeoutMs: 100,
    });
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects http://192.168.1.1/", async () => {
    const r = await verifyWebsite("http://192.168.1.1/", {
      vendorName: "Acme",
      timeoutMs: 100,
    });
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects file:///etc/passwd (non-http(s) scheme)", async () => {
    const r = await verifyWebsite("file:///etc/passwd", {
      vendorName: "Acme",
      timeoutMs: 100,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_url");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a hostname that DNS-resolves to a private IP", async () => {
    // Attacker registers evil.example.com -> 10.0.0.5 (DNS rebinding).
    dnsLookupSpy.mockResolvedValue([
      { address: "10.0.0.5", family: 4 },
    ] as any);
    const r = await verifyWebsite("https://evil.example.com/", {
      vendorName: "Acme",
      timeoutMs: 100,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("blocked_private_ip");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows https://example.com/ when DNS resolves to a public IP", async () => {
    dnsLookupSpy.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as any);
    // Build a body that passes the parking-hint + min-length guards and
    // contains the vendor name so verifyWebsite returns ok=true.
    const body =
      "<html><body><h1>Acme Builders</h1>" +
      "We do plumbing, electrics, kitchens, bathrooms, and full renovations.".repeat(5) +
      "</body></html>";
    fetchSpy.mockResolvedValue(
      makeFetchResponse({
        status: 200,
        url: "https://example.com/",
        headers: { "content-type": "text/html; charset=utf-8" },
        body,
      })
    );
    const r = await verifyWebsite("https://example.com/", {
      vendorName: "Acme",
      timeoutMs: 200,
    });
    expect(fetchSpy).toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });
});

describe("isPrivateIp helper", () => {
  it("classifies the standard private + link-local ranges as private", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("172.16.5.5")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("0.0.0.1")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fe80::abcd")).toBe(true);
  });

  it("classifies public addresses as public", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("93.184.216.34")).toBe(false);
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });
});
