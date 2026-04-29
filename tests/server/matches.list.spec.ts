import { describe, it, expect, vi, beforeEach } from "vitest";
import mountMatches from "../../server/routes/matches/list.get";

function makeRouter() {
  const handlers: Record<string, any> = {};
  return {
    get(path: string, _auth: any, h: any) {
      handlers[path] = h;
    },
    _handlers: handlers,
  } as any;
}

function makeCtx(mysqlQuery: any) {
  return {
    auth: (_req: any, _res: any, next: any) => next(),
    mysqlQuery,
  };
}

function baseRow(overrides: Record<string, any> = {}) {
  return {
    matchId: 1,
    projectId: 1,
    projectTitle: "A",
    builderUid: "b1",
    companyName: "X Ltd",
    photoUrl: null,
    tradesCsv: "",
    yearsTrading: 1,
    googleRating: null,
    googleReviewCount: 0,
    profileScore: 0,
    recommendationScore: null,
    vmbBadge: null,
    chStatus: null,
    cvStatus: null,
    chMatchScore: null,
    likesCount: 0,
    winsCount: 0,
    source: "subscribed",
    status: "pending",
    ...overrides,
  };
}

/**
 * The handler issues a single SELECT for the main rows, then (only when
 * there is at least one row with a builderUid) a second SELECT against
 * `recommendations` to find linked recs. Subsequent calls only fire if
 * that second query returns rows. For tests that explicitly preset
 * `recommendationScore` on every mocked row, we still need to drain the
 * recommendations lookup with an empty array so the route doesn't try to
 * compute scores from DB signals.
 */
function mockMatchRows(mysqlQuery: ReturnType<typeof vi.fn>, rows: any[]) {
  mysqlQuery.mockResolvedValueOnce(rows); // main matches query
  mysqlQuery.mockResolvedValueOnce([]); // recommendations lookup → none
}

describe("GET /api/matches", () => {
  let mysqlQuery: ReturnType<typeof vi.fn>;
  let handler: any;

  beforeEach(() => {
    mysqlQuery = vi.fn();
    const r = makeRouter();
    mountMatches(r, makeCtx(mysqlQuery));
    handler = (r as any)._handlers["/matches"];
  });

  it("returns rows with status/source mapping, whyMatch copy, and rich tradesman fields", async () => {
    mockMatchRows(mysqlQuery, [
      baseRow({
        matchId: 11,
        projectId: 3,
        projectTitle: "Kitchen extension",
        builderUid: "lead_abc",
        companyName: "BP Builds",
        photoUrl: "https://cdn.example/photo.jpg",
        tradesCsv: "Building, Plastering, ",
        yearsTrading: 10,
        googleRating: 4.7,
        googleReviewCount: 132,
        profileScore: 85,
        vmbBadge: "gold",
        chStatus: "verified",
        cvStatus: "verified",
        chMatchScore: 95,
        likesCount: 24,
        winsCount: 7,
        source: "recommended",
        status: "pending",
      }),
      baseRow({
        matchId: 12,
        projectId: 3,
        projectTitle: "Kitchen extension",
        builderUid: "lead_xyz",
        companyName: "AD House Construction",
        photoUrl: null,
        tradesCsv: "Roofing",
        yearsTrading: 4,
        googleRating: null,
        googleReviewCount: 0,
        profileScore: 60,
        vmbBadge: "",
        chStatus: null,
        cvStatus: null,
        chMatchScore: null,
        source: "subscribed",
        status: "matched",
      }),
    ]);

    const req = { user: { uid: "ho1" } };
    const res: any = {
      json: vi.fn(),
      status: vi.fn(function (this: any) {
        return this;
      }),
    };
    await handler(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.matches).toHaveLength(2);

    expect(out.matches[0]).toMatchObject({
      matchId: "11",
      projectId: "3",
      projectTitle: "Kitchen extension",
      builderUid: "lead_abc",
      companyName: "BP Builds",
      photoUrl: "https://cdn.example/photo.jpg",
      trades: ["Building", "Plastering"],
      yearsTrading: 10,
      googleRating: 4.7,
      googleReviewCount: 132,
      vmbScore: 85,
      vmbBadge: "gold",
      chVerified: true,
      chMatchScore: 95,
      likesCount: 24,
      winsCount: 7,
      source: "recommended",
      status: "waiting",
      whyMatch: "Recommended · Free to contact",
    });
    // googleRating should be a number, not a string
    expect(typeof out.matches[0].googleRating).toBe("number");

    expect(out.matches[1]).toMatchObject({
      matchId: "12",
      companyName: "AD House Construction",
      photoUrl: null,
      googleRating: null,
      googleReviewCount: 0,
      vmbBadge: null, // empty string normalised to null
      chVerified: false,
      chMatchScore: null,
      source: "ai-matched",
      status: "matched",
      whyMatch: "Matched on area + trade",
      trades: ["Roofing"],
    });

    // builderFirstName is gone
    expect(out.matches[0]).not.toHaveProperty("builderFirstName");
  });

  it("treats chVerified as true when company_verifications says verified even if tradesmen.ch_status is empty", async () => {
    mockMatchRows(mysqlQuery, [
      baseRow({
        matchId: 21,
        chStatus: null,
        cvStatus: "verified",
        chMatchScore: 92,
      }),
      baseRow({
        matchId: 22,
        chStatus: "matched",
        cvStatus: null,
        chMatchScore: null,
      }),
      baseRow({
        matchId: 23,
        chStatus: null,
        cvStatus: null,
        chMatchScore: null,
      }),
    ]);

    const req = { user: { uid: "ho1" } };
    const res: any = {
      json: vi.fn(),
      status: vi.fn(function (this: any) {
        return this;
      }),
    };
    await handler(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.matches[0].chVerified).toBe(true);
    expect(out.matches[0].chMatchScore).toBe(92);
    expect(out.matches[1].chVerified).toBe(true);
    expect(out.matches[1].chMatchScore).toBeNull();
    expect(out.matches[2].chVerified).toBe(false);
  });

  it("derives counts correctly across waiting and matched buckets", async () => {
    // The SQL filter excludes declined_by_builder / expired upstream so
    // those statuses never reach mapStatus in production. Mock only the
    // statuses the DB would return.
    mockMatchRows(mysqlQuery, [
      baseRow({ matchId: 1, source: "recommended", status: "pending" }),
      baseRow({ matchId: 2, source: "subscribed", status: "pending" }),
      baseRow({ matchId: 3, source: "recommended", status: "matched" }),
      baseRow({ matchId: 4, source: "subscribed", status: "matched" }),
    ]);

    const req = { user: { uid: "ho1" } };
    const res: any = {
      json: vi.fn(),
      status: vi.fn(function (this: any) {
        return this;
      }),
    };
    await handler(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.counts).toEqual({ matched: 2, waiting: 2 });
  });

  it("returns 401 when req.user?.uid is missing", async () => {
    const req = { user: null };
    const res: any = {
      json: vi.fn(),
      status: vi.fn(function (this: any) {
        return this;
      }),
    };
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("uses the recommendation score when present (overrides profile vmb_score)", async () => {
    // Explicit recommendationScore on the row simulates the case where
    // /matches found a recommendation linked to this (project, builder)
    // and computed/normalised its score. In this test path we don't need
    // the second query to actually return rows — the explicit field on
    // the joined main row short-circuits the bulk computation.
    mockMatchRows(mysqlQuery, [
      baseRow({
        matchId: 31,
        projectId: 7,
        builderUid: "elegant_uid",
        companyName: "Elegant Building Services",
        profileScore: 93, // builder's profile-wide score
        recommendationScore: 90, // project-scoped rec score (desktop number)
      }),
    ]);

    const req = { user: { uid: "ho1" } };
    const res: any = {
      json: vi.fn(),
      status: vi.fn(function (this: any) {
        return this;
      }),
    };
    await handler(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.matches).toHaveLength(1);
    // Recommendation score wins over the profile score
    expect(out.matches[0].vmbScore).toBe(90);
  });

  it("MAX-es the recommendation computeScore against tradesperson_pipeline.vetting_score", async () => {
    // Mirrors the desktop ratings endpoint: when a builder has an approved
    // tradesperson_pipeline row with a vetting_score, the rec score floor is
    // raised to that value. Without this the mobile /matches view would show
    // a lower computed score (e.g. 51) than the desktop (90).
    //
    // Mock sequence after the main rows query:
    //   1. recRows  — one rec with pipelineVettingScore = 90, source 'magic'
    //   2. likes
    //   3. recPhotos
    //   4. closures
    //   5. hires
    //   6. CH verification (recommendation_id variant succeeds first try)
    //   7. project_completions (try succeeds, returns no rows)
    mysqlQuery.mockResolvedValueOnce([
      baseRow({
        matchId: 51,
        projectId: 1,
        builderUid: "elegant_uid",
        companyName: "Elegant Building Services",
        profileScore: 0,
        recommendationScore: undefined, // force the bulk-recRows path
      }),
    ]);
    // recRows
    mysqlQuery.mockResolvedValueOnce([
      {
        id: 1,
        projectId: 1,
        builderUid: "elegant_uid",
        source: "magic",
        createdAt: new Date().toISOString(),
        pipelineVettingScore: 90,
      },
    ]);
    // likes / recPhotos / closures / hires / CH / project_completions
    mysqlQuery.mockResolvedValueOnce([]); // likes
    mysqlQuery.mockResolvedValueOnce([]); // recPhotos
    mysqlQuery.mockResolvedValueOnce([]); // closures
    mysqlQuery.mockResolvedValueOnce([]); // hires
    mysqlQuery.mockResolvedValueOnce([]); // CH verifications
    mysqlQuery.mockResolvedValueOnce([]); // project_completions

    const req = { user: { uid: "ho1" } };
    const res: any = {
      json: vi.fn(),
      status: vi.fn(function (this: any) {
        return this;
      }),
    };
    await handler(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.matches).toHaveLength(1);
    // computeScore for (magic, no likes/wins/photos/ch) would normalise far
    // below 90; the pipeline vetting score should floor it at 90.
    expect(out.matches[0].vmbScore).toBe(90);
  });

  it("falls back to profile vmb_score when no recommendation score is available", async () => {
    mockMatchRows(mysqlQuery, [
      baseRow({
        matchId: 41,
        projectId: 8,
        builderUid: "ai_match_builder",
        companyName: "AI Matched Co",
        profileScore: 75,
        recommendationScore: null, // no project-scoped rec
      }),
    ]);

    const req = { user: { uid: "ho1" } };
    const res: any = {
      json: vi.fn(),
      status: vi.fn(function (this: any) {
        return this;
      }),
    };
    await handler(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.matches).toHaveLength(1);
    // Falls back to the builder's profile vmb_score
    expect(out.matches[0].vmbScore).toBe(75);
  });
});
