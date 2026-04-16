// web/utils/reviewLinks.ts
//
// External review-platform links that tradespeople can attach to their
// profile (Trustpilot, Bark, MyBuilder, Checkatrade, Houzz, Yell). The
// tradesperson supplies a public URL pointing at THEIR profile on the
// platform; we display it as a plain text link on their public profile.
//
// Rules of engagement (see docs/superpowers/specs/... and AUP):
//   - We never replicate the third-party brand visual (logo, star icons)
//     - just the platform name as text.
//   - We never display a star count or review count we have not
//     verified ourselves; that would assert a claim on our behalf and
//     fall foul of DMCC 2024 misleading-claims rules.
//   - The tradesperson asserts the link is theirs; we are the conduit.
//
// Each normaliser:
//   - Returns the canonical https URL if the input looks plausible
//   - Returns null otherwise (caller should drop / show validation
//     error, not save garbage)
//
// "Plausible" = host matches the platform's known domain. We do not
// HEAD-fetch the URL to confirm it resolves; that's a product decision
// for later (and would also need rate-limiting).

export type ReviewPlatformId =
  | "trustpilot"
  | "bark"
  | "mybuilder"
  | "checkatrade"
  | "houzz"
  | "yell";

export type ReviewPlatform = {
  id: ReviewPlatformId;
  label: string;
  domains: string[];
  /** Placeholder shown in the form field. */
  placeholder: string;
};

export const REVIEW_PLATFORMS: ReviewPlatform[] = [
  {
    id: "trustpilot",
    label: "Trustpilot",
    domains: ["trustpilot.com", "uk.trustpilot.com"],
    placeholder: "https://www.trustpilot.com/review/yourcompany.co.uk",
  },
  {
    id: "bark",
    label: "Bark",
    domains: ["bark.com"],
    placeholder: "https://www.bark.com/en/gb/company/your-company/",
  },
  {
    id: "mybuilder",
    label: "MyBuilder",
    domains: ["mybuilder.com"],
    placeholder: "https://www.mybuilder.com/profile/view/your-company",
  },
  {
    id: "checkatrade",
    label: "Checkatrade",
    domains: ["checkatrade.com"],
    placeholder: "https://www.checkatrade.com/trades/your-company",
  },
  {
    id: "houzz",
    label: "Houzz",
    domains: ["houzz.co.uk", "houzz.com"],
    placeholder: "https://www.houzz.co.uk/professionals/your-company",
  },
  {
    id: "yell",
    label: "Yell",
    domains: ["yell.com"],
    placeholder: "https://www.yell.com/biz/your-company-london/",
  },
];

const PLATFORM_BY_ID: Record<ReviewPlatformId, ReviewPlatform> =
  REVIEW_PLATFORMS.reduce(
    (acc, p) => {
      acc[p.id] = p;
      return acc;
    },
    {} as Record<ReviewPlatformId, ReviewPlatform>,
  );

/**
 * Normalise a tradesperson-supplied URL into a canonical https URL.
 * Returns null if the URL is empty, malformed, or doesn't match the
 * declared platform's allowed domain list.
 */
export function normalizeReviewLink(
  platform: ReviewPlatformId,
  raw: string,
): string | null {
  const platformConfig = PLATFORM_BY_ID[platform];
  if (!platformConfig) return null;

  let v = (raw || "").trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;

  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }

  // Force https for the saved value - even if the user typed http.
  url.protocol = "https:";

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const matches = platformConfig.domains.some((d) => {
    const dn = d.toLowerCase().replace(/^www\./, "");
    return host === dn || host.endsWith("." + dn);
  });
  if (!matches) return null;

  return url.toString();
}

/**
 * Type used in form state and over the wire. The optional `platform`
 * field disambiguates which row in REVIEW_PLATFORMS this entry belongs
 * to so we can render the right label even if the URL pattern were
 * ambiguous (e.g. trustpilot.com sub-pages).
 */
export type ReviewLinkEntry = {
  platform: ReviewPlatformId;
  url: string;
};

/**
 * Build the wire payload. Drops empty / invalid entries; preserves the
 * declared platform tag.
 */
export function buildReviewLinksPayload(
  entries: Array<{ platform: ReviewPlatformId; url: string }>,
): ReviewLinkEntry[] {
  const out: ReviewLinkEntry[] = [];
  for (const e of entries) {
    const norm = normalizeReviewLink(e.platform, e.url);
    if (norm) out.push({ platform: e.platform, url: norm });
  }
  return out;
}

/**
 * Lookup helper for display: given a stored entry, return the platform
 * label for the visible link text. Falls back to the bare hostname if
 * the stored platform id is somehow unrecognised.
 *
 * Accepts a loose shape because the value comes from the wire and may
 * include unknown platform ids if a future server adds one.
 */
export function platformLabelFor(entry: { platform: string; url: string }): string {
  const p = PLATFORM_BY_ID[entry.platform as ReviewPlatformId];
  if (p) return p.label;
  try {
    return new URL(entry.url).hostname.replace(/^www\./, "");
  } catch {
    return "external link";
  }
}
