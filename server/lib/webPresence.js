// server/lib/webPresence.js
// Cheat-resistant verification for website & social links.
// Node 18+ (global fetch). If older, install undici and swap global fetch.

const dns = require("dns").promises;

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

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
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

function normalizeUrl(raw) {
  try {
    if (!raw) return null;
    let u = String(raw).trim();
    if (!/^https?:\/\//i.test(u)) {
      if (looksLikeDomain(u)) u = `https://${u}`;
      else return null;
    }
    const parsed = new URL(u);
    if (BLOCKED_HOSTS.has(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function resolveHost(host) {
  const [a4, a6, cname] = await Promise.allSettled([
    dns.lookup(host, { family: 4 }),
    dns.lookup(host, { family: 6 }),
    dns.resolveCname(host),
  ]);
  if (![a4, a6, cname].some((r) => r.status === "fulfilled"))
    throw new Error("DNS resolution failed");
}

function within(ms, p) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

async function headOrGet(u, timeoutMs) {
  try {
    return await within(
      timeoutMs,
      fetch(u, { method: "HEAD", redirect: "follow" })
    );
  } catch {
    return await within(
      timeoutMs,
      fetch(u, {
        method: "GET",
        redirect: "follow",
        headers: { Range: "bytes=0-65535", "User-Agent": "VMB-Verifier/1.0" },
      })
    );
  }
}

async function fetchSnippet(u, timeoutMs) {
  const r = await within(
    timeoutMs,
    fetch(u, {
      method: "GET",
      redirect: "follow",
      headers: { Range: "bytes=0-131071", "User-Agent": "VMB-Verifier/1.0" },
    })
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
  { vendorName, companyNumber, timeoutMs = 7000 } = {}
) {
  const urlStr = normalizeUrl(rawUrl);
  if (!urlStr) return { url: rawUrl, ok: false, reason: "invalid_url" };

  const u = new URL(urlStr);
  if (URL_SHORTENERS.has(u.hostname))
    return { url: urlStr, ok: false, reason: "url_shortener_blocked" };

  try {
    await resolveHost(u.hostname);
  } catch {
    return { url: urlStr, ok: false, reason: "dns_failed" };
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
    return { url: urlStr, ok: false, reason: e?.message || "fetch_failed" };
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
    await resolveHost(u.hostname);
  } catch {
    return { url: urlStr, ok: false, reason: "dns_failed" };
  }

  try {
    const r = await fetch(urlStr, {
      redirect: "follow",
      method: "GET",
      headers: { "User-Agent": "VMB-Verifier/1.0" },
    });
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
    return { url: urlStr, ok: false, reason: e?.message || "fetch_failed" };
  }
}

// Public: verify web + socials; return boolean you can trust for scoring.
async function verifyWebPresence(
  websiteUrl,
  socialLinks,
  { vendorName, companyNumber, timeoutMs } = {}
) {
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
};
