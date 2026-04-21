// tests/web/components/ComparePage.test.tsx
import { describe, it, expect } from "vitest";

// Extract the pure logic from the compare page for testing.
// These functions mirror the ones inside compare.tsx.

type Recommendation = {
  id: number;
  company: string;
  score?: number;
  likes?: number;
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
  source?: string | null;
  linked_tradesman_uid?: string | null;
  tradesmanPublicId?: string | null;
  createdAt: string;
};

type Verification = {
  recommendationId: number;
  status: string;
  companyNumber?: string | null;
  companyName?: string | null;
  googleRating?: number | null;
  googleReviewsCount?: number | null;
};

type Grouped = {
  key: string;
  company: string;
  items: Recommendation[];
  aggLikes: number;
  aggScore?: number;
  verification?: Verification | null;
  recCount: number;
};

// Mirrors normalizedCompanyKey from utils/vmb
function normalizedCompanyKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function groupByCompany(
  items: Recommendation[],
  verMap: Record<number, Verification>
): Grouped[] {
  const map = new Map<string, { company: string; items: Recommendation[] }>();
  for (const it of items) {
    const v = verMap[it.id];
    const chNumber = (v?.companyNumber || "").trim() || null;
    const candidateName = (v?.companyName || it.company || "").trim();
    const nameKey = normalizedCompanyKey(candidateName);
    const key = chNumber ? `#${chNumber}` : `n:${nameKey}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { company: candidateName, items: [] };
      map.set(key, bucket);
    }
    bucket.items.push(it);
  }

  const groups: Grouped[] = [];
  for (const [key, b] of map.entries()) {
    const top = [...b.items].sort((a, bb) => (bb.score ?? -1) - (a.score ?? -1))[0];
    const aggScore = top?.score;
    const aggLikes = b.items.reduce((s, it) => s + (it.likes ?? 0), 0);
    let bestVer: Verification | null = null;
    for (const it of b.items) {
      const v = verMap[it.id];
      if (!v) continue;
      if (!bestVer || (v.googleRating && !bestVer.googleRating) || (v.status === "verified" && bestVer.status !== "verified")) {
        bestVer = v;
      }
    }
    groups.push({ key, company: b.company, items: b.items, aggLikes, aggScore, verification: bestVer, recCount: b.items.length });
  }
  return groups.sort((a, b) => (b.aggScore ?? -1) - (a.aggScore ?? -1));
}

function scoreColor(score: number | undefined): string {
  if (typeof score !== "number" || Number.isNaN(score)) return "bg-slate-400";
  if (score >= 55) return "bg-emerald-500";
  if (score >= 30) return "bg-amber-500";
  return "bg-red-500";
}

function toggle(selected: string[], key: string, max = 4): string[] {
  if (selected.includes(key)) return selected.filter((k) => k !== key);
  if (selected.length >= max) return selected;
  return [...selected, key];
}

function findBestKey(comparing: Grouped[]): string | null {
  if (comparing.length === 0) return null;
  return comparing.reduce((best, g) =>
    (g.aggScore ?? -1) > (best.aggScore ?? -1) ? g : best
  ).key;
}

function findProfileId(group: Grouped): string | null {
  const item = group.items.find((i) => i.tradesmanPublicId || i.linked_tradesman_uid);
  return item?.tradesmanPublicId || item?.linked_tradesman_uid || null;
}

// ---- Fixtures ----

function rec(overrides: Partial<Recommendation> & { id: number; company: string }): Recommendation {
  return { score: 0, likes: 0, createdAt: "2026-01-01", ...overrides };
}

// ---- Tests ----

describe("Compare page logic", () => {
  describe("groupByCompany", () => {
    it("groups recommendations by company name", () => {
      const items = [
        rec({ id: 1, company: "Acme Builders", score: 60 }),
        rec({ id: 2, company: "Acme Builders", score: 40 }),
        rec({ id: 3, company: "Beta Plumbing", score: 50 }),
      ];
      const groups = groupByCompany(items, {});
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.company)).toContain("Acme Builders");
      expect(groups.map((g) => g.company)).toContain("Beta Plumbing");
    });

    it("uses the highest score as aggScore for a group", () => {
      const items = [
        rec({ id: 1, company: "Acme Builders", score: 60 }),
        rec({ id: 2, company: "Acme Builders", score: 40 }),
      ];
      const groups = groupByCompany(items, {});
      expect(groups[0].aggScore).toBe(60);
    });

    it("sums likes across all recs in a group", () => {
      const items = [
        rec({ id: 1, company: "Acme Builders", likes: 5 }),
        rec({ id: 2, company: "Acme Builders", likes: 3 }),
      ];
      const groups = groupByCompany(items, {});
      expect(groups[0].aggLikes).toBe(8);
    });

    it("sorts groups by score descending", () => {
      const items = [
        rec({ id: 1, company: "Low Score Co", score: 10 }),
        rec({ id: 2, company: "High Score Co", score: 90 }),
        rec({ id: 3, company: "Mid Score Co", score: 50 }),
      ];
      const groups = groupByCompany(items, {});
      expect(groups[0].company).toBe("High Score Co");
      expect(groups[1].company).toBe("Mid Score Co");
      expect(groups[2].company).toBe("Low Score Co");
    });

    it("groups by Companies House number when available", () => {
      const items = [
        rec({ id: 1, company: "Acme Ltd" }),
        rec({ id: 2, company: "ACME LIMITED" }),
      ];
      const verMap: Record<number, Verification> = {
        1: { recommendationId: 1, status: "verified", companyNumber: "12345678", companyName: "ACME LIMITED" },
        2: { recommendationId: 2, status: "verified", companyNumber: "12345678", companyName: "ACME LIMITED" },
      };
      const groups = groupByCompany(items, verMap);
      expect(groups).toHaveLength(1);
      expect(groups[0].recCount).toBe(2);
    });

    it("picks verification with Google data over one without", () => {
      const items = [
        rec({ id: 1, company: "Acme" }),
        rec({ id: 2, company: "Acme" }),
      ];
      const verMap: Record<number, Verification> = {
        1: { recommendationId: 1, status: "verified", companyNumber: null },
        2: { recommendationId: 2, status: "verified", companyNumber: null, googleRating: 4.8, googleReviewsCount: 120 },
      };
      const groups = groupByCompany(items, verMap);
      expect(groups[0].verification?.googleRating).toBe(4.8);
    });

    it("returns recCount for each group", () => {
      const items = [
        rec({ id: 1, company: "Solo Builder", score: 30 }),
        rec({ id: 2, company: "Team Builders", score: 40 }),
        rec({ id: 3, company: "Team Builders", score: 35 }),
        rec({ id: 4, company: "Team Builders", score: 20 }),
      ];
      const groups = groupByCompany(items, {});
      const solo = groups.find((g) => g.company === "Solo Builder");
      const team = groups.find((g) => g.company === "Team Builders");
      expect(solo?.recCount).toBe(1);
      expect(team?.recCount).toBe(3);
    });
  });

  describe("toggle selection", () => {
    it("adds a key when not selected", () => {
      expect(toggle(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    });

    it("removes a key when already selected", () => {
      expect(toggle(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    });

    it("does not add beyond max of 4", () => {
      expect(toggle(["a", "b", "c", "d"], "e")).toEqual(["a", "b", "c", "d"]);
    });

    it("allows deselecting when at max", () => {
      expect(toggle(["a", "b", "c", "d"], "c")).toEqual(["a", "b", "d"]);
    });

    it("allows adding after deselecting from max", () => {
      const after = toggle(["a", "b", "c", "d"], "d");
      expect(toggle(after, "e")).toEqual(["a", "b", "c", "e"]);
    });
  });

  describe("findBestKey", () => {
    it("returns null for empty array", () => {
      expect(findBestKey([])).toBeNull();
    });

    it("returns the key with highest aggScore", () => {
      const groups: Grouped[] = [
        { key: "a", company: "A", items: [], aggLikes: 0, aggScore: 30, verification: null, recCount: 1 },
        { key: "b", company: "B", items: [], aggLikes: 0, aggScore: 80, verification: null, recCount: 1 },
        { key: "c", company: "C", items: [], aggLikes: 0, aggScore: 50, verification: null, recCount: 1 },
      ];
      expect(findBestKey(groups)).toBe("b");
    });
  });

  describe("scoreColor", () => {
    it("returns emerald for scores >= 55", () => {
      expect(scoreColor(55)).toBe("bg-emerald-500");
      expect(scoreColor(100)).toBe("bg-emerald-500");
    });

    it("returns amber for scores 30-54", () => {
      expect(scoreColor(30)).toBe("bg-amber-500");
      expect(scoreColor(54)).toBe("bg-amber-500");
    });

    it("returns red for scores below 30", () => {
      expect(scoreColor(29)).toBe("bg-red-500");
      expect(scoreColor(0)).toBe("bg-red-500");
    });

    it("returns slate for undefined or NaN", () => {
      expect(scoreColor(undefined)).toBe("bg-slate-400");
      expect(scoreColor(NaN)).toBe("bg-slate-400");
    });
  });

  describe("findProfileId", () => {
    it("returns tradesmanPublicId when available", () => {
      const group: Grouped = {
        key: "a", company: "A", aggLikes: 0, aggScore: 50, verification: null, recCount: 2,
        items: [
          rec({ id: 1, company: "A" }),
          rec({ id: 2, company: "A", tradesmanPublicId: "pub123", linked_tradesman_uid: "uid456" }),
        ],
      };
      expect(findProfileId(group)).toBe("pub123");
    });

    it("falls back to linked_tradesman_uid", () => {
      const group: Grouped = {
        key: "a", company: "A", aggLikes: 0, aggScore: 50, verification: null, recCount: 1,
        items: [
          rec({ id: 1, company: "A", linked_tradesman_uid: "uid789" }),
        ],
      };
      expect(findProfileId(group)).toBe("uid789");
    });

    it("returns null when no profile exists", () => {
      const group: Grouped = {
        key: "a", company: "A", aggLikes: 0, aggScore: 50, verification: null, recCount: 1,
        items: [rec({ id: 1, company: "A" })],
      };
      expect(findProfileId(group)).toBeNull();
    });

    it("finds profile from any item in the group, not just the first", () => {
      const group: Grouped = {
        key: "a", company: "A", aggLikes: 0, aggScore: 50, verification: null, recCount: 3,
        items: [
          rec({ id: 1, company: "A" }),
          rec({ id: 2, company: "A" }),
          rec({ id: 3, company: "A", tradesmanPublicId: "pub-last" }),
        ],
      };
      expect(findProfileId(group)).toBe("pub-last");
    });
  });
});
