// web/utils/vendorScoring.ts
// Scoring logic for registered tradesmen (vendors) — independent of recommendations.
//
// Output: 0..100 (score100). Use fraction10(score100) to display like the rec leaderboard.
//
// New in this version:
// - Adds wins & likes boosters (log-scaled, capped)
// - Tightens web presence: only plausible URLs or known social hosts count
// - Slightly rebalanced weights so scores don’t saturate too easily

export type VendorForScoring = {
  serviceAreas?: string[] | string | null;
  websiteUrl?: string | null;
  socialLinks?: string[] | string | null;
  companyNumber?: string | null;
  chStatus?: "verified" | "ambiguous" | "no_match" | "error" | "" | null;
  trades?: string[] | string | null;
  photoCount?: number | null;
  offersDiscount?: boolean | number | null; // true or % number
  warrantyMonths?: number | null;
  supportingDocCount?: number | null;

  // NEW: community signals carried over from platform usage
  wins?: number | null; // number of completed projects
  likes?: number | null; // total likes across their recs
};

export type ScoreBreakdownItem = {
  key:
    | "serviceAreas"
    | "webPresence"
    | "companiesHouse"
    | "trades"
    | "photos"
    | "discount"
    | "warranty"
    | "supportingDocs"
    | "wins"
    | "likes";
  label: string;
  awarded: number;
  max: number;
  notes?: string;
};

export type VendorScoreResult = {
  score: number; // 0..100 (clamped)
  breakdown: ScoreBreakdownItem[];
  badge: "bronze" | "silver" | "gold" | "platinum";
};

// ---- Tunable weights --------------------------------------------------------
// Rebalanced a little so wins/likes can contribute without everything capping.
const WEIGHTS = {
  serviceAreasMin3: 10, // 3+ service areas
  webPresenceAny: 5, // plausible website OR any social link
  chVerified: 22, // was 25
  tradesMin3: 12, // was 15
  photosMin3: 12, // was 15
  discountAny: 5,
  warrantyMax: 16, // was 20
  docsMin2: 8, // was 10
  winsMax: 15, // NEW (log-scaled)
  likesMax: 10, // NEW (log-scaled)
} as const;

// Warranty scaling breakpoints (months → points)
const WARRANTY_SCALE = [
  { months: 0, points: 0 },
  { months: 6, points: 6 },
  { months: 12, points: 10 },
  { months: 24, points: 14 },
  { months: 36, points: WEIGHTS.warrantyMax },
] as const;

// --- URL plausibility (lightweight; not a network check) ---------------------

const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "fb.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "nextdoor.co.uk",
  "nextdoor.com",
]);

const BANNED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "example.com",
  "example.org",
]);

function isPlausibleUrl(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const str = s.trim();
  if (!str) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(str) ? str : `https://${str}`);
    const host = (u.hostname || "").toLowerCase();
    if (!host.includes(".")) return false; // needs a TLD
    if (BANNED_HOSTS.has(host)) return false;
    // Very short domains without TLD depth are suspicious
    const parts = host.split(".");
    if (parts.length < 2) return false;
    // Disallow obvious placeholder/path-only
    if (!u.hostname || u.hostname === "") return false;
    return /^https?:$/.test(u.protocol);
  } catch {
    return false;
  }
}

function isKnownSocial(s: unknown): boolean {
  if (typeof s !== "string") return false;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    return SOCIAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

// ---- Helpers ----------------------------------------------------------------

function isNonEmptyString(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

function toArray(x: unknown): string[] {
  if (Array.isArray(x)) return x.filter(isNonEmptyString);
  if (isNonEmptyString(x)) {
    return x
      .split(/[,;|]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function countServiceAreas(v: VendorForScoring): number {
  return toArray(v.serviceAreas).length;
}

function hasWebPresence(v: VendorForScoring): boolean {
  const siteOK =
    isNonEmptyString(v.websiteUrl) && isPlausibleUrl(v.websiteUrl!);
  const socials = toArray(v.socialLinks).filter(isKnownSocial);
  return siteOK || socials.length > 0;
}

function isCHVerified(v: VendorForScoring): boolean {
  const status = (v.chStatus || "").toLowerCase();
  return status === "verified";
}

function countTrades(v: VendorForScoring): number {
  return toArray(v.trades).length;
}

function int(n: unknown): number {
  const x = typeof n === "number" ? n : parseInt(String(n ?? ""), 10);
  return Number.isFinite(x) ? x : 0;
}

function hasDiscount(v: VendorForScoring): boolean {
  if (typeof v.offersDiscount === "boolean") return v.offersDiscount;
  const pct = int(v.offersDiscount);
  return pct > 0;
}

function warrantyPoints(monthsRaw: unknown): number {
  const m = Math.max(0, int(monthsRaw));
  const anchors = WARRANTY_SCALE;
  if (m <= anchors[0].months) return anchors[0].points;
  if (m >= anchors[anchors.length - 1].months)
    return anchors[anchors.length - 1].points;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (m >= a.months && m <= b.months) {
      const t = (m - a.months) / Math.max(1, b.months - a.months);
      return Math.round(a.points + t * (b.points - a.points));
    }
  }
  return 0;
}

function countDocs(v: VendorForScoring): number {
  return Math.max(0, int(v.supportingDocCount));
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function clamp100(x: number) {
  return Math.max(0, Math.min(100, x));
}

function toBadge(score: number): VendorScoreResult["badge"] {
  if (score >= 85) return "platinum";
  if (score >= 70) return "gold";
  if (score >= 50) return "silver";
  return "bronze";
}

// ---- Main scorer ------------------------------------------------------------

export function scoreVendor(vendor: VendorForScoring): VendorScoreResult {
  const breakdown: ScoreBreakdownItem[] = [];

  // 1) Service areas (3+)
  const saCount = countServiceAreas(vendor);
  const saPts = saCount >= 3 ? WEIGHTS.serviceAreasMin3 : 0;
  breakdown.push({
    key: "serviceAreas",
    label: "Service areas",
    awarded: saPts,
    max: WEIGHTS.serviceAreasMin3,
    notes: `${saCount} area${saCount === 1 ? "" : "s"}`,
  });

  // 2) Web presence (plausible website OR known social)
  const web = hasWebPresence(vendor);
  breakdown.push({
    key: "webPresence",
    label: "Website or social",
    awarded: web ? WEIGHTS.webPresenceAny : 0,
    max: WEIGHTS.webPresenceAny,
    notes: web ? "Has plausible web presence" : "No valid links found",
  });

  // 3) Companies House verification
  const chOK = isCHVerified(vendor);
  breakdown.push({
    key: "companiesHouse",
    label: "Companies House verified",
    awarded: chOK ? WEIGHTS.chVerified : 0,
    max: WEIGHTS.chVerified,
    notes: vendor.chStatus ? `Status: ${vendor.chStatus}` : "No status",
  });

  // 4) Trades (3+)
  const tradeCount = countTrades(vendor);
  const tradePts = tradeCount >= 3 ? WEIGHTS.tradesMin3 : 0;
  breakdown.push({
    key: "trades",
    label: "Trades (3+)",
    awarded: tradePts,
    max: WEIGHTS.tradesMin3,
    notes: `${tradeCount} trade${tradeCount === 1 ? "" : "s"}`,
  });

  // 5) Photos (3+)
  const photos = Math.max(0, int(vendor.photoCount));
  const photoPts = photos >= 3 ? WEIGHTS.photosMin3 : 0;
  breakdown.push({
    key: "photos",
    label: "Photo uploads (3+)",
    awarded: photoPts,
    max: WEIGHTS.photosMin3,
    notes: `${photos} photo${photos === 1 ? "" : "s"}`,
  });

  // 6) Discount (any)
  const disc = hasDiscount(vendor);
  breakdown.push({
    key: "discount",
    label: "Offers discount",
    awarded: disc ? WEIGHTS.discountAny : 0,
    max: WEIGHTS.discountAny,
    notes: disc ? "Discount available" : "No discount",
  });

  // 7) Warranty (scaled by months)
  const wPts =
    clamp01(warrantyPoints(vendor.warrantyMonths) / WEIGHTS.warrantyMax) *
    WEIGHTS.warrantyMax;
  breakdown.push({
    key: "warranty",
    label: "Warranty",
    awarded: Math.round(wPts),
    max: WEIGHTS.warrantyMax,
    notes: `${Math.max(0, int(vendor.warrantyMonths))} month(s)`,
  });

  // 8) Supporting documents (2+)
  const docCount = countDocs(vendor);
  const docPts = docCount >= 2 ? WEIGHTS.docsMin2 : 0;
  breakdown.push({
    key: "supportingDocs",
    label: "Supporting documents (2+)",
    awarded: docPts,
    max: WEIGHTS.docsMin2,
    notes: `${docCount} document${docCount === 1 ? "" : "s"}`,
  });

  // 9) Wins — log-scaled boost up to winsMax
  const wins = Math.max(0, int(vendor.wins));
  const winsScaled = Math.min(WEIGHTS.winsMax, Math.log2(1 + wins) * 3); // ~15 at ~2^4-1
  breakdown.push({
    key: "wins",
    label: "Project wins",
    awarded: Math.round(winsScaled),
    max: WEIGHTS.winsMax,
    notes: `${wins} win${wins === 1 ? "" : "s"}`,
  });

  // 10) Likes — log-scaled boost up to likesMax
  const likes = Math.max(0, int(vendor.likes));
  const likesScaled = Math.min(WEIGHTS.likesMax, Math.log2(1 + likes) * 2.5); // ~10 near 15–20 likes
  breakdown.push({
    key: "likes",
    label: "Likes",
    awarded: Math.round(likesScaled),
    max: WEIGHTS.likesMax,
    notes: `${likes} like${likes === 1 ? "" : "s"}`,
  });

  // Sum, clamp, and badge
  const raw = breakdown.reduce((sum, b) => sum + b.awarded, 0);
  const score = clamp100(raw);
  const badge = toBadge(score);

  return { score, breakdown, badge };
}

// Optional helper for leaderboard display (like recommendations)
export function fraction10(score100: number): number {
  // convert 0..100 -> 0.0..10.0 with 1 decimal place
  return Math.round((Math.max(0, Math.min(100, score100)) / 10) * 10) / 10;
}

export function vendorScoreForLeaderboard(vendor: VendorForScoring) {
  const { score, badge } = scoreVendor(vendor);
  return {
    vmbScore100: score, // keep original scale
    vmbScore10: fraction10(score), // convenient for UI
    vmbBadge: badge,
  };
}

export const VENDOR_SCORE_WEIGHTS = { ...WEIGHTS };
