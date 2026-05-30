// tests/web/utils/acquisitionRef.test.ts
//
// Pins the capture / read / clear contract of the acquisition-ref
// helpers. The two stores (sessionStorage + cookie) have to stay in
// sync so the ref survives the Google SSO popup round-trip even
// though the popup can't see sessionStorage.

import { describe, it, expect, beforeEach } from "vitest";
import {
  captureRefFromUrl,
  readRef,
  clearRef,
} from "../../../web/utils/acquisitionRef";

const COOKIE_NAME = "vmb_acq_ref";
const STORAGE_KEY = "vmb:acqRef";

function clearAllStores() {
  try {
    sessionStorage.clear();
  } catch {}
  document.cookie = `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function getCookieValue() {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
}

describe("acquisitionRef capture/read/clear", () => {
  beforeEach(clearAllStores);

  it("captures a valid ref from a search string and stores it in both stores", () => {
    const ref = captureRefFromUrl("?ref=flyer-e4-2026-05");
    expect(ref).toBe("flyer-e4-2026-05");
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("flyer-e4-2026-05");
    expect(getCookieValue()).toBe("flyer-e4-2026-05");
  });

  it("returns null when no ref is in the URL and nothing was previously captured", () => {
    expect(captureRefFromUrl("?other=1")).toBeNull();
  });

  it("falls back to a previously captured ref when the URL has none", () => {
    captureRefFromUrl("?ref=tiktok-bio");
    // Simulate a navigation that drops the query param.
    expect(captureRefFromUrl("")).toBe("tiktok-bio");
  });

  it("rejects refs that fail the alphabet check", () => {
    const ref = captureRefFromUrl("?ref=oops;%20DROP");
    expect(ref).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getCookieValue()).toBeNull();
  });

  it("readRef prefers sessionStorage over the cookie when both are set", () => {
    sessionStorage.setItem(STORAGE_KEY, "session-ref");
    document.cookie = `${COOKIE_NAME}=cookie-ref; Path=/`;
    expect(readRef()).toBe("session-ref");
  });

  it("readRef falls back to the cookie when sessionStorage is empty (SSO round-trip)", () => {
    document.cookie = `${COOKIE_NAME}=nextdoor-e4; Path=/`;
    expect(readRef()).toBe("nextdoor-e4");
  });

  it("readRef rejects a tampered cookie value that fails the alphabet check", () => {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent("bad value!")}; Path=/`;
    expect(readRef()).toBeNull();
  });

  it("clearRef wipes both stores", () => {
    captureRefFromUrl("?ref=flyer-e4");
    expect(readRef()).toBe("flyer-e4");
    clearRef();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getCookieValue()).toBeNull();
    expect(readRef()).toBeNull();
  });
});
