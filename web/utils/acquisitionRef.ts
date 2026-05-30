// web/utils/acquisitionRef.ts
//
// Captures the `?ref=<code>` query param on a signup landing page and
// keeps hold of it through the rest of the flow so it can be attached
// to the eventual /api/tradesmen/join body.
//
// Why two stores:
//   - sessionStorage is the fast path for the email signup flow that
//     stays in the same tab.
//   - A first-party cookie covers the Google SSO popup round-trip. The
//     popup is on accounts.google.com, sessionStorage there is invisible
//     to us, and on return we land in /signup/complete (a different
//     pathname). The cookie survives all of that.
//
// `captureRefFromUrl` is called on mount by the trade signup pages.
// `readRef` is called inside the submit handler.

const STORAGE_KEY = "vmb:acqRef";
const COOKIE_NAME = "vmb_acq_ref";
const COOKIE_MAX_AGE_DAYS = 30;
const REF_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function isValidRef(v: unknown): v is string {
  return typeof v === "string" && REF_PATTERN.test(v);
}

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}

function writeCookie(value: string) {
  if (typeof document === "undefined") return;
  const expires = new Date(
    Date.now() + COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  ).toUTCString();
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie =
    `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Expires=${expires}; SameSite=Lax${secure}`;
}

/**
 * Read `?ref=` from the current URL and stash it. Safe to call on every
 * mount — a missing or invalid param leaves any previously captured ref
 * intact. Returns the ref that's now active (newly captured or already
 * stored), or null if there's nothing to attach.
 */
export function captureRefFromUrl(search?: string): string | null {
  if (typeof window === "undefined") return null;
  const qs = search ?? window.location.search;
  const params = new URLSearchParams(qs);
  const incoming = params.get("ref");

  if (incoming && isValidRef(incoming)) {
    try {
      sessionStorage.setItem(STORAGE_KEY, incoming);
    } catch {}
    writeCookie(incoming);
    return incoming;
  }
  return readRef();
}

/** Read the stored ref (sessionStorage first, falling back to the cookie). */
export function readRef(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromSession = sessionStorage.getItem(STORAGE_KEY);
    if (isValidRef(fromSession)) return fromSession;
  } catch {}
  const fromCookie = readCookie();
  if (isValidRef(fromCookie)) return fromCookie;
  return null;
}

/** Wipe any captured ref. Used after a successful signup so a second
 *  account from the same browser doesn't get the same attribution. */
export function clearRef() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  if (typeof document !== "undefined") {
    document.cookie = `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
}
