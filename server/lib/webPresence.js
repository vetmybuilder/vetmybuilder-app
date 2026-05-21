// server/lib/webPresence.js
// Cheat-resistant verification for website & social links.
// Node 18+ (global fetch). If older, install undici and swap global fetch.

const dns = require("dns").promises;
const net = require("net");
const { isExternalServicesMocked } = require("./externalServices");

// ---- tiny utils ------------------------------------------------------------
const extractText = (html, limit = 20000) =>
  String(html || "")
    .slice(0, limit)
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, " ")
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const looksLikeDomain = (s) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s || "");

const URL_SHORTENERS = new Set([
  "bit.ly",
  "goo.gl",
  "t.co",
  "tinyurl.com",
  "ow.ly",
  "buff.ly",
  "rebrand.ly",
]);
const PARKING_HINTS = [
  "domain for sale",
  "buy this domain",
  "sedo",
  "namecheap",
  "godaddy",
  "parkingcrew",
  "site coming soon",
  "under construction",
];
const SOCIAL_WHITELIST = new Set([
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
]);

// ---- SSRF protection -------------------------------------------------------
// Allowed protocols only. Anything else (file:, gopher:, ftp:, data:, ...)
// is rejected before we touch DNS or fetch.
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Bytes-of-IP helpers so we can match CIDR blocks without pulling in deps.
function ipv4ToBytes(ip) {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return parts;
}

function ipv4InCidr(ip, base, bits) {
  const ipBytes = ipv4ToBytes(ip);
  const baseBytes = ipv4ToBytes(base);
  if (!ipBytes || !baseBytes) return false;
  const ipInt = (ipBytes[0] << 24) | (ipBytes[1] << 16) | (ipBytes[2] << 8) | ipBytes[3];
  const baseInt =
    (baseBytes[0] << 24) | (baseBytes[1] << 16) | (baseBytes[2] << 8) | baseBytes[3];
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt >>> 0 & mask) === (baseInt >>> 0 & mask);
}

// Expand an IPv6 address to a full 16-byte buffer. Returns null on parse fail.
function ipv6ToBytes(ip) {
  // Strip zone id (e.g. fe80::1%eth0)
  const stripped = ip.replace(/%.*$/, "");
  if (!net.isIPv6(stripped)) return null;
  // Handle :: shorthand
  let head = "";
  let tail = "";
  if (stripped.includes("::")) {
    const [h, t] = stripped.split("::");
    head = h || "";
    tail = t || "";
  } else {
    head = stripped;
  }
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  // Handle embedded IPv4 in the last group(s)
  function expand(parts) {
    const out = [];
    for (const p of parts) {
      if (p.includes(".")) {
        const v4 = ipv4ToBytes(p);
        if (!v4) return null;
        // Push as two 16-bit groups
        out.push(((v4[0] << 8) | v4[1]).toString(16));
        out.push(((v4[2] << 8) | v4[3]).toString(16));
      } else {
        out.push(p);
      }
    }
    return out;
  }
  const expandedHead = expand(headParts);
  const expandedTail = expand(tailParts);
  if (!expandedHead || !expandedTail) return null;
  const missing = 8 - expandedHead.length - expandedTail.length;
  if (missing < 0) return null;
  const zeros = Array(missing).fill("0");
  const groups = [...expandedHead, ...zeros, ...expandedTail];
  if (groups.length !== 8) return null;
  const bytes = [];
  for (const g of groups) {
    const n = Number.parseInt(g || "0", 16);
    if (!Number.isInteger(n) || n < 0 || n > 0xffff) return null;
    bytes.push((n >> 8) & 0xff);
    bytes.push(n & 0xff);
  }
  return bytes;
}

function ipv6InCidr(ip, base, bits) {
  const ipBytes = ipv6ToBytes(ip);
  const baseBytes = ipv6ToBytes(base);
  if (!ipBytes || !baseBytes) return false;
  let remaining = bits;
  for (let i = 0; i < 16 && remaining > 0; i++) {
    const take = Math.min(8, remaining);
    const mask = take === 0 ? 0 : (0xff << (8 - take)) & 0xff;
    if ((ipBytes[i] & mask) !== (baseBytes[i] & mask)) return false;
    remaining -= take;
  }
  return true;
}

/**
 * Returns true if `ip` is a private / loopback / link-local / metadata
 * address that must never be reachable from a public-facing fetch.
 *
 * Blocks:
 *   IPv4 - 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 *          169.254.0.0/16 (link-local incl. AWS/GCP 169.254.169.254),
 *          0.0.0.0/8
 *   IPv6 - ::1 (loopback), fc00::/7 (unique local), fe80::/10 (link-local)
 */
function isPrivateIp(ip) {
  if (!ip || typeof ip !== "string") return true;
  const stripped = ip.replace(/%.*$/, "");
  if (net.isIPv4(stripped)) {
    return (
      ipv4InCidr(stripped, "127.0.0.0", 8) ||
      ipv4InCidr(stripped, "10.0.0.0", 8) ||
      ipv4InCidr(stripped, "172.16.0.0", 12) ||
      ipv4InCidr(stripped, "192.168.0.0", 16) ||
      ipv4InCidr(stripped, "169.254.0.0", 16) ||
      ipv4InCidr(stripped, "0.0.0.0", 8)
    );
  }
  if (net.isIPv6(stripped)) {
    // ::1 (loopback) is a single address
    if (stripped === "::1") return true;
    return (
      ipv6InCidr(stripped, "fc00::", 7) ||
      ipv6InCidr(stripped, "fe80::", 10) ||
      // IPv4-mapped IPv6 of a private v4 (::ffff:10.0.0.1 etc.)
      (() => {
        const m = stripped.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
        return m ? isPrivateIp(m[1]) : false;
      })()
    );
  }
  // Unrecognised - be conservative and block.
  return true;
}

/**
 * Resolve a hostname and assert every returned IP is public.
 * Throws on DNS failure or any private/blocked IP.
 */
async function assertHostPublic(host) {
  if (!host || typeof host !== "string") throw new Error("invalid_host");
  // Reject obvious bare-IP shortcuts before we touch DNS.
  if (net.isIP(host) && isPrivateIp(host)) {
    throw new Error("blocked_private_ip");
  }
  const records = await dns.lookup(host, { all: true });
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("dns_failed");
  }
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new Error("blocked_private_ip");
    }
  }
}

function normalizeUrl(raw) {
  try {
    if (!raw) return null;
    let u = String(raw).trim();
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
      // No scheme - only treat as a domain if it looks like one. Anything
      // else (e.g. file paths, gopher targets without the scheme) is junk.
      if (looksLikeDomain(u)) u = `https://${u}`;
      else return null;
    }
    const parsed = new URL(u);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
    // Reject literal bare-IP private hosts even before DNS - if someone
    // writes http://127.0.0.1, the URL itself is enough to drop it.
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isPrivateIp(host)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// ---- safe fetch with manual redirect + SSRF re-check per hop ---------------
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * fetch() wrapper that:
 *   - rejects non-http(s) URLs
 *   - DNS-resolves the host and rejects private/loopback/link-local IPs
 *   - walks redirects manually (max 3), re-applying the IP check each hop
 *   - times out via AbortSignal.timeout (no Promise.race leakage)
 */
async function safeFetch(initialUrl, init = {}, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRedirects = Number.isFinite(opts.maxRedirects)
    ? opts.maxRedirects
    : MAX_REDIRECTS;

  let currentUrl = initialUrl;
  let hops = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new Error("invalid_url");
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      throw new Error("blocked_protocol");
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    await assertHostPublic(host);

    const signal = AbortSignal.timeout(timeoutMs);
    const r = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
      signal,
    });

    // 3xx with Location -> follow manually, re-check IP at next hop.
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) return r;
      if (hops >= maxRedirects) throw new Error("too_many_redirects");
      const next = new URL(loc, currentUrl).toString();
      currentUrl = next;
      hops += 1;
      continue;
    }

    // Attach the final resolved URL so callers can read it like fetch's
    // built-in redirect mode used to expose `r.url`.
    try {
      Object.defineProperty(r, "url", { value: currentUrl, configurable: true });
    } catch {
      /* read-only Response.url - ignore */
    }
    return r;
  }
}

async function headOrGet(u, timeoutMs) {
  try {
    return await safeFetch(
      u,
      { method: "HEAD" },
      { timeoutMs }
    );
  } catch {
    return await safeFetch(
      u,
      {
        method: "GET",
        headers: { Range: "bytes=0-65535", "User-Agent": "VMB-Verifier/1.0" },
      },
      { timeoutMs }
    );
  }
}

async function fetchSnippet(u, timeoutMs) {
  const r = await safeFetch(
    u,
    {
      method: "GET",
      headers: { Range: "bytes=0-131071", "User-Agent": "VMB-Verifier/1.0" },
    },
    { timeoutMs }
  );
  const ct = r.headers.get("content-type") || "";
  const isHtml = ct.includes("text/html") || ct.includes("application/xhtml");
  const text = isHtml ? await r.text() : "";
  return { r, text };
}

function brandMatches(textLower, vendorName, companyNumber) {
  let matched = false;
  const hints = [];
  if (vendorName) {
    const n = vendorName.toLowerCase();
    if (n.length >= 4 && textLower.includes(n)) {
      matched = true;
      hints.push("name");
    }
  }
  if (companyNumber) {
    const c = String(companyNumber).toLowerCase();
    if (c && textLower.includes(c)) {
      matched = true;
      hints.push("companyNumber");
    }
  }
  return { matched, hints };
}

// ---- verifiers -------------------------------------------------------------
async function verifyWebsite(
  rawUrl,
  { vendorName, companyNumber, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const urlStr = normalizeUrl(rawUrl);
  if (!urlStr) return { url: rawUrl, ok: false, reason: "invalid_url" };

  const u = new URL(urlStr);
  if (URL_SHORTENERS.has(u.hostname))
    return { url: urlStr, ok: false, reason: "url_shortener_blocked" };

  try {
    await assertHostPublic(u.hostname);
  } catch (e) {
    const msg = e?.message === "blocked_private_ip" ? "blocked_private_ip" : "dns_failed";
    return { url: urlStr, ok: false, reason: msg };
  }

  try {
    const head = await headOrGet(urlStr, timeoutMs);
    const finalUrl = head.url;
    const status = head.status;
    if (status >= 400)
      return {
        url: urlStr,
        finalUrl,
        httpStatus: status,
        ok: false,
        reason: "http_error",
      };

    const { r, text } = await fetchSnippet(finalUrl, timeoutMs);
    const html = extractText(text);

    if (PARKING_HINTS.some((kw) => html.includes(kw)))
      return {
        url: urlStr,
        finalUrl: r.url,
        httpStatus: r.status,
        ok: false,
        reason: "parked_or_placeholder",
      };

    if (html.length < 200)
      return {
        url: urlStr,
        finalUrl: r.url,
        httpStatus: r.status,
        ok: false,
        reason: "too_thin",
      };

    const { matched } = brandMatches(html, vendorName, companyNumber);

    let domainLooksRight = false;
    if (vendorName) {
      const baseHost = new URL(r.url).hostname.replace(/^www\./, "");
      const simplifiedName = vendorName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      const simplifiedHost = baseHost.replace(/[^a-z0-9]+/g, "");
      if (
        simplifiedName.length >= 4 &&
        simplifiedHost.includes(simplifiedName.slice(0, 6))
      )
        domainLooksRight = true;
    }

    const ok = matched || domainLooksRight;
    return {
      url: urlStr,
      finalUrl: r.url,
      httpStatus: r.status,
      ok,
      reason: ok ? undefined : "brand_mismatch",
      matchedBrand: ok,
    };
  } catch (e) {
    const reason =
      e?.name === "TimeoutError" || e?.message === "timeout"
        ? "timeout"
        : e?.message === "blocked_private_ip"
        ? "blocked_private_ip"
        : e?.message === "blocked_protocol"
        ? "blocked_protocol"
        : e?.message || "fetch_failed";
    return { url: urlStr, ok: false, reason };
  }
}

async function verifySocial(rawUrl, vendorName) {
  const urlStr = normalizeUrl(rawUrl);
  if (!urlStr) return { url: rawUrl, ok: false, reason: "invalid_url" };

  const u = new URL(urlStr);
  const host = u.hostname.replace(/^www\./, "");
  if (!SOCIAL_WHITELIST.has(host))
    return { url: urlStr, ok: false, reason: "unsupported_social_domain" };

  const hasProfilePath =
    u.pathname &&
    u.pathname !== "/" &&
    u.pathname.split("/").filter(Boolean).length >= 1;
  if (!hasProfilePath)
    return { url: urlStr, ok: false, reason: "missing_profile_path" };

  try {
    await assertHostPublic(u.hostname);
  } catch (e) {
    const msg = e?.message === "blocked_private_ip" ? "blocked_private_ip" : "dns_failed";
    return { url: urlStr, ok: false, reason: msg };
  }

  try {
    const r = await safeFetch(
      urlStr,
      {
        method: "GET",
        headers: { "User-Agent": "VMB-Verifier/1.0" },
      },
      { timeoutMs: DEFAULT_TIMEOUT_MS }
    );
    if (r.status >= 400)
      return {
        url: urlStr,
        finalUrl: r.url,
        httpStatus: r.status,
        ok: false,
        reason: "http_error",
      };

    let matchedBrand = false;
    if (vendorName) {
      const path = new URL(r.url).pathname
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const simplified = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (simplified.length >= 4 && path.includes(simplified.slice(0, 6)))
        matchedBrand = true;
    }

    return {
      url: urlStr,
      finalUrl: r.url,
      httpStatus: r.status,
      ok: true,
      matchedBrand,
    };
  } catch (e) {
    const reason =
      e?.name === "TimeoutError" || e?.message === "timeout"
        ? "timeout"
        : e?.message === "blocked_private_ip"
        ? "blocked_private_ip"
        : e?.message === "blocked_protocol"
        ? "blocked_protocol"
        : e?.message || "fetch_failed";
    return { url: urlStr, ok: false, reason };
  }
}

// Public: verify web + socials; return boolean you can trust for scoring.
async function verifyWebPresence(
  websiteUrl,
  socialLinks,
  { vendorName, companyNumber, timeoutMs } = {}
) {
  // Hard kill-switch - never DNS-resolve or fetch arbitrary third-party
  // websites from a process flagged as mocked-services. Returns the same
  // shape callers expect with verified=false so the row is saved without
  // fanning out to the public internet.
  if (isExternalServicesMocked()) {
    // Surface a reason so admin still gets a human label rather than
    // a silent unticked row. In prod (no mock) the real check runs
    // and produces real reasons (parked_or_placeholder etc.).
    return {
      verified: false,
      website: undefined,
      socials: [],
      mocked: true,
      reasons: ["website:external_services_mocked"],
    };
  }

  const socials = Array.isArray(socialLinks)
    ? socialLinks
    : typeof socialLinks === "string"
    ? socialLinks.split(/[,|;\s]+/).filter(Boolean)
    : [];

  let website;
  if (websiteUrl)
    website = await verifyWebsite(websiteUrl, {
      vendorName,
      companyNumber,
      timeoutMs,
    });

  const socialResults = [];
  for (const s of socials.slice(0, 5)) {
    // cap to avoid abuse
    // eslint-disable-next-line no-await-in-loop
    socialResults.push(await verifySocial(s, vendorName));
  }

  const okWebsite = website?.ok === true;
  const okSocial = socialResults.some((s) => s.ok);
  const verified = !!(okWebsite || okSocial);

  const reasons = [];
  if (!verified) {
    if (website && !website.ok) reasons.push(`website:${website.reason}`);
    if (socialResults.length && !okSocial)
      reasons.push("socials:no_valid_profile");
    if (!website && socialResults.length === 0)
      reasons.push("no_links_provided");
  }

  return {
    website,
    socials: socialResults,
    verified,
    reasons,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  verifyWebPresence,
  verifyWebsite,
  verifySocial,
  // Exposed for tests + the join route's URL hygiene check.
  normalizeUrl,
  isPrivateIp,
  assertHostPublic,
  safeFetch,
};
