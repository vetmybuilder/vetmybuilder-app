// web/utils/tradesmanProfile.ts

/**
 * Build initials from a company / display name.
 */
export function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "T";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Extract a nice "domain only" label from a full URL.
 */
export function prettyDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Turn a comma/pipe/slash-separated trades string into a clean list.
 */
export function normaliseTrades(raw?: string | null): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[,/|]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }

  return out;
}

/**
 * Map internal plan tiers to nice labels.
 */
export function getPlanLabel(tier?: string | null): string | null {
  const t = (tier || "").toLowerCase();
  if (t === "gold") return "Gold member";
  if (t === "spotlight") return "Spotlight plan";
  if (t === "unlock") return "Unlock plan";
  if (t === "free" || !t) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * "Member since March 2024"
 */
export function formatMemberSince(createdAt?: string | null): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return `Member since ${d.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  })}`;
}
