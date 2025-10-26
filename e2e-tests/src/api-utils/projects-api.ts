// e2e-tests/src/api-utils/projects-api.ts
import type { APIResponse } from "@playwright/test";
import { expect } from "@playwright/test";
import Project from "../models/Project";

/* ---------- Types ---------- */

type ProjectRecord = {
  id: number;
  name: string;
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;
  status: string;
  createdAt: string;
  ownerUserId: string;
};

type CreateProjectResponseBody = { project: ProjectRecord };

/**
 * Minimal request-like interface so we can pass in a session-bound client
 * (e.g. the wrapper built on top of `page.request`).
 */
type RequestLike = {
  get: (url: string, opts?: Record<string, any>) => Promise<APIResponse>;
  post: (url: string, opts?: Record<string, any>) => Promise<APIResponse>;
  put: (url: string, opts?: Record<string, any>) => Promise<APIResponse>;
  delete: (url: string, opts?: Record<string, any>) => Promise<APIResponse>;
};

// --- add near the other top-level types ---
export type CloseProjectOptions = {
  didGoAhead: boolean;
  reasons?: Array<
    "budget" | "no_show" | "quote_too_high" | "other" | "tradesman_unavailable"
  >;
  otherReason?: string;
  selectedRecommendationId?: number;
  winnerFromCommunity?: boolean | 0 | 1 | "0" | "1" | "true" | "false";
  wouldUseAgain?: boolean | 0 | 1 | "0" | "1" | "true" | "false" | null;
  /** When provided, waits until project reaches this status after close (e.g. "archived" | "completed") */
  waitForStatus?: string;
};

export type ClosePhotosInput = Array<{
  name: string;
  mimeType: string;
  buffer: Buffer;
}>;

/* ---------- Env ---------- */

const API_PREFIX = process.env.E2E_API_PREFIX || "/api";

/* ---------- API Client ---------- */

export class ProjectsApi {
  constructor(private readonly request: RequestLike) {}

  private hydrate(target: Project, src: ProjectRecord) {
    target.id = src.id;
    target.name = src.name;
    target.type = src.type;
    target.location = src.location;
    target.description = src.description;
    target.propertyType = src.propertyType;
    target.bedrooms = src.bedrooms;
    (target as any).status = src.status;
    (target as any).createdAt = src.createdAt;
    (target as any).ownerUserId = src.ownerUserId;
  }

  private async waitForProjectPersisted(
    id: number,
    opts: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<void> {
    const timeout = opts.timeoutMs ?? 5000;
    const interval = opts.intervalMs ?? 200;

    await expect
      .poll(
        async () => {
          const res = await this.request.get(`${API_PREFIX}/projects/${id}`);
          if (!res.ok()) return null;
          try {
            const json: any = await res.json();
            return json?.project?.id ?? json?.id ?? null;
          } catch {
            return null;
          }
        },
        {
          timeout,
          intervals: [interval],
          message: `Project ${id} not readable at GET ${API_PREFIX}/projects/${id}`,
        }
      )
      .toBe(id);
  }

  /**
   * Creates a project using the SAME session as the browser (when passed a session-bound request).
   * Asserts 201, hydrates the given Project model, and waits until the project is readable.
   */
  async createProject(
    project: Project,
    extraHeaders?: Record<string, string>
  ): Promise<void> {
    const src: any =
      typeof (project as any).toJSON === "function"
        ? (project as any).toJSON()
        : project;

    const payload = {
      name: String(src.name ?? "").trim(),
      type: String(src.type ?? "").trim(),
      location: String(src.location ?? "").trim(),
      description: String(src.description ?? "").trim(),
      propertyType: String(src.propertyType ?? "").trim(),
      bedrooms: Number(src.bedrooms ?? 0),
    };

    const url = `${API_PREFIX}/projects`;
    const res = await this.request.post(url, {
      data: payload,
      headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
    });

    const raw = await res.text();

    expect(
      res.status(),
      `Project not created — status=${res.status()} url=${url} body=${raw.slice(
        0,
        500
      )}`
    ).toBe(201);

    let body: CreateProjectResponseBody | undefined;
    try {
      body = raw ? (JSON.parse(raw) as CreateProjectResponseBody) : undefined;
    } catch {
      expect(false, `Non-JSON response from ${url}: ${raw.slice(0, 500)}`).toBe(
        true
      );
    }

    expect(
      body?.project,
      `Response missing 'project' — body=${raw.slice(0, 500)}`
    ).toBeTruthy();

    this.hydrate(project, body!.project);
    expect(
      project.id,
      "project.id should be hydrated after creation"
    ).toBeTruthy();

    // Ensure the new project is readable before returning
    await this.waitForProjectPersisted(project.id!);
  }

  async createProjectBody(
    project: Project,
    extraHeaders?: Record<string, string>
  ): Promise<CreateProjectResponseBody> {
    await this.createProject(project, extraHeaders);
    // Re-fetch body for callers that need it (GET by id for consistency)
    const res = await this.request.get(`${API_PREFIX}/projects/${project.id}`);
    const json = (await res.json()) as any;
    return (
      json?.project ? json : { project: json }
    ) as CreateProjectResponseBody;
  }

  async createProjects(
    projects: Project[],
    extraHeaders?: Record<string, string>
  ): Promise<CreateProjectResponseBody[]> {
    const out: CreateProjectResponseBody[] = [];
    for (const p of projects) {
      await this.createProject(p, extraHeaders);
      const res = await this.request.get(`${API_PREFIX}/projects/${p.id}`);
      const json = (await res.json()) as any;
      out.push(json?.project ? json : { project: json });
    }
    return out;
  }

  /** Poll until a project reaches a specific status */
  private async waitForProjectStatus(
    id: number,
    expectedStatus: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<void> {
    const timeout = opts.timeoutMs ?? 5000;
    const interval = opts.intervalMs ?? 200;

    await expect
      .poll(
        async () => {
          const res = await this.request.get(`${API_PREFIX}/projects/${id}`);
          if (!res.ok()) return null;
          try {
            const json: any = await res.json();
            const p = json?.project ?? json;
            return p?.status ?? null;
          } catch {
            return null;
          }
        },
        {
          timeout,
          intervals: [interval],
          message: `Project ${id} did not reach status "${expectedStatus}"`,
        }
      )
      .toBe(expectedStatus);
  }

  /** Publish by ID and return the published record */
  async publishProject(
    projectId: number,
    extraHeaders?: Record<string, string>,
    opts: { waitForStatus?: string } = {}
  ): Promise<ProjectRecord> {
    const url = `${API_PREFIX}/projects/${projectId}/publish`;
    const res = await this.request.post(url, {
      headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
    });

    const raw = await res.text();
    expect(
      res.ok(),
      `Publish failed — status=${res.status()} body=${raw.slice(0, 500)}`
    ).toBeTruthy();

    let body: { project?: ProjectRecord } | undefined;
    try {
      body = raw ? (JSON.parse(raw) as { project?: ProjectRecord }) : undefined;
    } catch {
      expect(false, `Non-JSON response from ${url}: ${raw.slice(0, 500)}`).toBe(
        true
      );
    }

    expect(
      body?.project,
      `Publish response missing 'project' — body=${raw.slice(0, 500)}`
    ).toBeTruthy();

    if (opts.waitForStatus) {
      await this.waitForProjectStatus(projectId, opts.waitForStatus);
    }

    return body!.project!;
  }

  /** Publish and hydrate a Project model instance */
  async publish(
    project: Project,
    extraHeaders?: Record<string, string>,
    opts: { waitForStatus?: string } = { waitForStatus: "live" }
  ): Promise<void> {
    if (!project.id) {
      throw new Error("publish(project): project.id is required");
    }
    const rec = await this.publishProject(project.id, extraHeaders, opts);
    this.hydrate(project, rec);
  }
  /** Close a project by ID; returns the updated record. */
  async closeProject(
    projectId: number,
    opts: CloseProjectOptions,
    extraHeaders?: Record<string, string>
  ): Promise<ProjectRecord> {
    const url = `${API_PREFIX}/projects/${projectId}/close`;

    const payload = {
      didGoAhead: !!opts.didGoAhead,
      ...(opts.reasons ? { reasons: opts.reasons } : {}),
      ...(opts.otherReason ? { otherReason: opts.otherReason } : {}),
      ...(Number.isFinite(opts.selectedRecommendationId)
        ? { selectedRecommendationId: Number(opts.selectedRecommendationId) }
        : {}),
      ...(typeof opts.winnerFromCommunity !== "undefined"
        ? { winnerFromCommunity: opts.winnerFromCommunity as any }
        : {}),
      ...(typeof opts.wouldUseAgain !== "undefined"
        ? { wouldUseAgain: opts.wouldUseAgain as any }
        : {}),
    };

    const res = await this.request.post(url, {
      data: payload,
      headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
    });

    const raw = await res.text();
    expect(
      res.ok(),
      `Close failed — status=${res.status()} body=${raw.slice(0, 500)}`
    ).toBeTruthy();

    let body: { ok?: boolean; project?: ProjectRecord } | undefined;
    try {
      body = raw ? (JSON.parse(raw) as any) : undefined;
    } catch {
      expect(false, `Non-JSON response from ${url}: ${raw.slice(0, 500)}`).toBe(
        true
      );
    }

    expect(body?.ok, `Close response missing { ok:true } — body=${raw}`).toBe(
      true
    );
    expect(
      body?.project,
      `Close response missing 'project' — body=${raw}`
    ).toBeTruthy();

    if (opts.waitForStatus) {
      await this.waitForProjectStatus(projectId, opts.waitForStatus);
    }

    return body!.project!;
  }

  /** Close and hydrate a Project model instance. */
  async close(
    project: Project,
    opts: CloseProjectOptions,
    extraHeaders?: Record<string, string>
  ): Promise<void> {
    if (!project.id) throw new Error("close(project): project.id is required");
    const rec = await this.closeProject(project.id, opts, extraHeaders);
    this.hydrate(project, rec);
  }

  /**
   * Attach closure photos. If `photos` is empty/omitted, this no-ops successfully.
   * Returns `{ ok: boolean, count: number }`.
   */

  /** Upload one or more closure photos (loops: one file per request). */
  async closeProjectPhotos(
    projectId: number,
    photos?: ClosePhotosInput
  ): Promise<{ ok: boolean; count: number }> {
    const url = `${API_PREFIX}/projects/${projectId}/close/photos`;

    // No files? server treats non-multipart as a no-op
    if (!photos || photos.length === 0) {
      const res = await this.request.post(url);
      expect(res.ok(), `Close photos failed: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as { ok: boolean; count: number };
    }

    let total = 0;
    for (const f of photos) {
      const res = await this.request.post(url, {
        multipart: {
          photos: {
            name: f.name,
            mimeType: f.mimeType,
            buffer: f.buffer,
          },
        },
      });
      expect(res.ok(), `Close photos failed: ${await res.text()}`).toBeTruthy();
      const json = (await res.json()) as { ok: boolean; count: number };
      total += json.count ?? 0;
    }

    return { ok: true, count: total };
  }
}

export default ProjectsApi;
