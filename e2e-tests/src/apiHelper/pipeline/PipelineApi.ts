import { expect } from "@playwright/test";
import { connect } from "../../db/mysql";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
  get: (path: string) => Promise<ApiResponse>;
  patch: (path: string, payload?: any) => Promise<ApiResponse>;
};

type PipelineEntry = {
  companyName: string;
  tradeTypes: string;
  serviceAreas: string;
  googleRating?: number;
  googleReviewsCount?: number;
  vettingScore?: number;
  status?: "pending" | "approved" | "rejected";
  phone?: string;
  email?: string;
  website?: string;
  companyNumber?: string;
};

export class PipelineApi {
  constructor(
    private readonly adminClient: ApiClient,
    private readonly dbName: string,
  ) {}

  // ─── Direct DB insert (no admin insert API exists) ─────────────

  async insertEntry(entry: PipelineEntry): Promise<number> {
    const conn = await connect({
      host: process.env.TEST_DB_HOST || "localhost",
      port: Number(process.env.TEST_DB_PORT || 3306),
      user: process.env.TEST_DB_USER || "root",
      password: process.env.TEST_DB_PASSWORD || "",
      database: this.dbName,
    });

    const [result] = await conn.query(
      `INSERT INTO tradesperson_pipeline
         (company_name, trade_types, service_areas, google_rating,
          google_reviews_count, vetting_score, status, discovered_at,
          phone, email, website, company_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
      [
        entry.companyName,
        entry.tradeTypes,
        entry.serviceAreas,
        entry.googleRating ?? null,
        entry.googleReviewsCount ?? null,
        entry.vettingScore ?? 75,
        entry.status ?? "pending",
        entry.phone ?? null,
        entry.email ?? null,
        entry.website ?? null,
        entry.companyNumber ?? null,
      ],
    );

    await conn.end();
    return (result as any).insertId;
  }

  // ─── Admin API ─────────────────────────────────────────────────

  async list(
    params?: { status?: string; q?: string },
  ): Promise<{ items: any[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);
    qs.set("limit", "50");

    const res = await this.adminClient.get(
      `/api/admin/trades-pipeline?${qs.toString()}`,
    );
    expect(res.status()).toBe(200);
    return res.json();
  }

  async approve(id: number): Promise<void> {
    const res = await this.adminClient.patch(
      `/api/admin/trades-pipeline/${id}`,
      { status: "approved" },
    );
    expect(res.status()).toBe(200);
  }

  async reject(id: number): Promise<void> {
    const res = await this.adminClient.patch(
      `/api/admin/trades-pipeline/${id}`,
      { status: "rejected" },
    );
    expect(res.status()).toBe(200);
  }

  // ─── DB queries for assertions ─────────────────────────────────

  async getEntryById(id: number): Promise<any> {
    const conn = await connect({
      host: process.env.TEST_DB_HOST || "localhost",
      port: Number(process.env.TEST_DB_PORT || 3306),
      user: process.env.TEST_DB_USER || "root",
      password: process.env.TEST_DB_PASSWORD || "",
      database: this.dbName,
    });

    const [rows] = await conn.query(
      "SELECT * FROM tradesperson_pipeline WHERE id = ?",
      [id],
    );
    await conn.end();
    return (rows as any[])[0] ?? null;
  }

  // ─── Named assertions ─────────────────────────────────────────

  async expectClaimed(id: number, uid: string): Promise<void> {
    const entry = await this.getEntryById(id);
    expect(entry, `Pipeline entry ${id} should exist`).toBeTruthy();
    expect(
      entry.claimed_by,
      `Pipeline entry ${id} should be claimed by ${uid}`,
    ).toBe(uid);
  }

  async expectNotClaimed(id: number): Promise<void> {
    const entry = await this.getEntryById(id);
    expect(entry, `Pipeline entry ${id} should exist`).toBeTruthy();
    expect(
      entry.claimed_by,
      `Pipeline entry ${id} should not be claimed`,
    ).toBeNull();
  }

  async expectEntryCount(
    params: { status?: string },
    expectedCount: number,
  ): Promise<void> {
    const { total } = await this.list(params);
    expect(total, `Expected ${expectedCount} entries`).toBe(expectedCount);
  }

  // ─── Direct DB insert for pipeline recommendations ─────────────

  async insertPipelineRecommendation(
    projectId: number,
    companyName: string,
  ): Promise<number> {
    const conn = await this.connectDb();
    const [result] = await conn.query(
      `INSERT INTO recommendations
         (projectId, recommenderUserId, createdAt, name, company, rating, comment, isAnonymous, source)
       VALUES (?, NULL, NOW(), 'VetMyBuilder', ?, 5, 'Vetted local business', 0, 'pipeline')`,
      [projectId, companyName],
    );
    await conn.end();
    return (result as any).insertId;
  }

  // ─── Recommendation assertions ────────────────────────────────

  /**
   * Poll the recommendations list until a pipeline-sourced rec for the
   * given company appears. Returns the matched recommendation item.
   * Handles the async fire-and-forget nature of auto-surface.
   */
  async expectPipelineRecSurfaced(
    recsClient: ApiClient,
    projectId: number,
    companyName: string,
  ): Promise<any> {
    let matched: any;
    await expect
      .poll(
        async () => {
          const res = await recsClient.get(
            `/api/projects/${projectId}/recommendations?limit=50`,
          );
          const body = await res.json();
          const items = body.items ?? [];
          matched = items.find(
            (r: any) => r.source === "pipeline" && r.company === companyName,
          );
          return !!matched;
        },
        {
          message: `Pipeline rec for "${companyName}" should appear on project ${projectId}`,
          timeout: 30_000,
          intervals: [500, 1000, 2000, 3000, 5000],
        },
      )
      .toBe(true);
    return matched;
  }

  /** Assert that no pipeline-sourced recommendation exists on a project (via API). */
  async expectNoPipelineRecs(
    recsClient: ApiClient,
    projectId: number,
  ): Promise<void> {
    const res = await recsClient.get(
      `/api/projects/${projectId}/recommendations?limit=50`,
    );
    const body = await res.json();
    const items = body.items ?? [];
    const pipelineRecs = items.filter((r: any) => r.source === "pipeline");
    expect(
      pipelineRecs.length,
      `Expected no pipeline recs on project ${projectId}`,
    ).toBe(0);
  }

  /** Assert that no pipeline-sourced recommendation exists on a project (via DB). */
  async expectNoPipelineRecsInDb(projectId: number): Promise<void> {
    // Small delay to let any async inserts complete
    await new Promise((r) => setTimeout(r, 1000));
    const conn = await this.connectDb();
    const [rows] = await conn.query(
      "SELECT id FROM recommendations WHERE source = 'pipeline' AND projectId = ?",
      [projectId],
    );
    await conn.end();
    expect(
      (rows as any[]).length,
      `Expected no pipeline recs in DB for project ${projectId}`,
    ).toBe(0);
  }

  /**
   * Poll the DB until a pipeline-sourced recommendation for the given company
   * appears on the project. Avoids API endpoint issues by checking the DB directly.
   */
  async expectPipelineRecInDb(
    projectId: number,
    companyName: string,
  ): Promise<void> {
    await expect
      .poll(
        async () => {
          const conn = await this.connectDb();
          const [rows] = await conn.query(
            "SELECT id FROM recommendations WHERE source = 'pipeline' AND company = ? AND projectId = ?",
            [companyName, projectId],
          );
          await conn.end();
          return (rows as any[]).length > 0;
        },
        {
          message: `Pipeline rec for "${companyName}" should exist in DB for project ${projectId}`,
          timeout: 15_000,
          intervals: [500, 1000, 2000, 3000],
        },
      )
      .toBe(true);
  }

  /** Assert a pipeline recommendation's linked_tradesman_uid in the DB. Polls to handle fire-and-forget async claim. */
  async expectRecLinkedToTradesman(
    companyName: string,
  ): Promise<void> {
    await expect
      .poll(
        async () => {
          const conn = await this.connectDb();
          const [rows] = await conn.query(
            "SELECT linked_tradesman_uid FROM recommendations WHERE source IN ('pipeline', 'community_match') AND company = ?",
            [companyName],
          );
          await conn.end();
          const rec = (rows as any[])[0];
          return rec?.linked_tradesman_uid != null;
        },
        {
          message: `Pipeline rec for "${companyName}" should be linked to a tradesman`,
          timeout: 10_000,
          intervals: [500, 1000, 2000],
        },
      )
      .toBe(true);
  }

  // ─── Private ──────────────────────────────────────────────────

  private async connectDb() {
    return connect({
      host: process.env.TEST_DB_HOST || "localhost",
      port: Number(process.env.TEST_DB_PORT || 3306),
      user: process.env.TEST_DB_USER || "root",
      password: process.env.TEST_DB_PASSWORD || "",
      database: this.dbName,
    });
  }
}

export default PipelineApi;
