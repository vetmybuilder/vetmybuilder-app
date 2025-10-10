// e2e-tests/src/api-utils/projects-api.ts
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import { expect, request as pwRequest } from "@playwright/test";
import { ApiBase } from "./api-base";
import Project from "../models/Project";
import User from "../models/User";

type ProjectRecord = {
  id: number;
  name: string;
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;
  status: string;
  createdAt: string; // ISO datetime
  ownerUserId: string;
};

type CreateProjectResponseBody = { project: ProjectRecord };

/** Minimal shapes so we don't import test fixtures here */
type UsersApiLike = {
  createUser(u: User): Promise<{ uid?: string }>;
};
type AuthApiLike = {
  idTokenForUid(uid: string): Promise<string>;
  customToken(uid: string): Promise<string>;
};

const DEFAULT_API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";

/** Track open APIRequestContexts so we can auto-dispose them in fixture teardown */
const __openContexts = new Set<() => Promise<void>>();
export async function __disposeAllProjectApiContexts() {
  const disposers = Array.from(__openContexts);
  __openContexts.clear();
  await Promise.all(disposers.map((fn) => fn()));
}

export class ProjectsApi extends ApiBase {
  constructor(request: APIRequestContext) {
    super(request);
  }

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

  /**
   * Create a project via real endpoint POST /api/projects.
   * Requires the APIRequestContext to be authenticated (Bearer ID token or cookie).
   */
  async createProject(
    project: Project,
    extraHeaders?: Record<string, string>
  ): Promise<APIResponse> {
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

    const res = await this.request.post(`/api/projects`, {
      data: payload,
      headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
    });

    const raw = await res.text();
    let body: CreateProjectResponseBody | undefined;

    try {
      body = raw ? (JSON.parse(raw) as CreateProjectResponseBody) : undefined;
    } catch {
      expect(
        res.ok(),
        `Project create returned non-JSON. status=${res.status()} body=${raw.slice(
          0,
          300
        )}`
      ).toBeTruthy();
    }

    expect(
      res.ok(),
      `Project not created successfully — status=${res.status()} body=${raw}`
    ).toBeTruthy();
    expect(
      body && body.project,
      `Response missing 'project' field — body=${raw}`
    ).toBeTruthy();

    this.hydrate(project, body!.project);
    return res;
  }

  /** Convenience: return parsed body directly. */
  async createProjectBody(
    project: Project,
    extraHeaders?: Record<string, string>
  ): Promise<CreateProjectResponseBody> {
    const res = await this.createProject(project, extraHeaders);
    return (await res.json()) as CreateProjectResponseBody;
  }

  /** Create many projects in sequence (preserves order). */
  async createProjects(
    projects: Project[],
    extraHeaders?: Record<string, string>
  ): Promise<CreateProjectResponseBody[]> {
    const out: CreateProjectResponseBody[] = [];
    for (const p of projects) {
      const res = await this.createProject(p, extraHeaders);
      out.push((await res.json()) as CreateProjectResponseBody);
    }
    return out;
  }

  /**
   * Publish by project id. Validates JSON and surfaces clear errors (403/404, etc.).
   * Server endpoint: POST /api/projects/:id/publish
   */
  async publishProject(projectId: number): Promise<APIResponse> {
    const res = await this.request.post(`/api/projects/${projectId}/publish`, {
      headers: { "Content-Type": "application/json" },
    });
    const raw = await res.text();

    // Try to parse JSON for better messages
    let json: any = undefined;
    try {
      json = raw ? JSON.parse(raw) : undefined;
    } catch {
      // keep going; assertion below will show the HTML snippet if non-JSON
    }

    expect(
      res.ok(),
      `Publish failed — status=${res.status()} body=${raw.slice(0, 300)}`
    ).toBeTruthy();

    if (!json?.project) {
      throw new Error(
        `Publish succeeded but response missing 'project' — body=${raw.slice(
          0,
          300
        )}`
      );
    }

    return res;
  }

  /** Publish and return parsed body */
  async publishProjectBody(
    projectId: number
  ): Promise<{ project: ProjectRecord }> {
    const res = await this.publishProject(projectId);
    return (await res.json()) as { project: ProjectRecord };
  }

  /** Publish a Project instance and hydrate it from the server response. */
  async publish(project: Project): Promise<APIResponse> {
    if (!project.id)
      throw new Error("publish(project): project.id is required");
    const res = await this.publishProject(project.id);
    const body = (await res.json()) as { project: ProjectRecord };
    if (body?.project) this.hydrate(project, body.project);
    return res;
  }

  // ===== Lazy factory helpers (tests can ignore dispose; fixture will auto-clean) =====

  /**
   * Create an authenticated ProjectsApi for an existing UID.
   * Useful if your test already created a user elsewhere.
   */
  static async createForUid(opts: {
    uid: string;
    authApi: AuthApiLike;
    baseURL?: string;
    headers?: Record<string, string>;
  }): Promise<{ api: ProjectsApi; dispose: () => Promise<void> }> {
    const baseURL = opts.baseURL ?? DEFAULT_API_BASE;
    const idToken = await opts.authApi.idTokenForUid(opts.uid);
    const ctx = await pwRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });

    const disposer = async () => {
      await ctx.dispose();
      __openContexts.delete(disposer);
    };
    __openContexts.add(disposer);

    return { api: new ProjectsApi(ctx), dispose: disposer };
  }

  /**
   * Create an authenticated ProjectsApi tied to a fresh owner user.
   * Optionally logs the browser in as that owner (single redirect), if you pass `page`.
   * Nothing runs until you call this method from your test.
   */
  static async createForNewOwner(opts: {
    usersApi: UsersApiLike;
    authApi: AuthApiLike;
    page?: Page; // provide to perform browser login
    loginInBrowser?: boolean; // default false
    redirect?: string; // default "/projects"
    owner?: User; // default: generated user
    baseURL?: string; // default: E2E_API_BASE or http://localhost:8787
    headers?: Record<string, string>;
  }): Promise<{
    api: ProjectsApi;
    uid: string;
    owner: User;
    dispose: () => Promise<void>;
  }> {
    const {
      usersApi,
      authApi,
      page,
      loginInBrowser = false,
      redirect = "/projects",
      owner = User.aUser()
        .withEmail(`e2e+${Date.now()}@example.com`)
        .withPostcode("E4")
        .withPassword("Passw0rd1"),
      baseURL = DEFAULT_API_BASE,
      headers = {},
    } = opts;

    // 1) Create owner
    const { uid } = await usersApi.createUser(owner);
    if (!uid) throw new Error("owner uid missing");

    // 2) Optional browser login for UI flows
    if (loginInBrowser) {
      if (!page) throw new Error("page is required when loginInBrowser=true");
      const customToken = await authApi.customToken(uid);
      await page.goto(
        `/__test__/login-with-token?token=${encodeURIComponent(
          customToken
        )}&redirect=${encodeURIComponent(redirect)}`
      );
      await page.waitForLoadState("networkidle");
    }

    // 3) Authenticated APIRequestContext
    const idToken = await authApi.idTokenForUid(uid);
    const ctx = await pwRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
        ...headers,
      },
    });

    const disposer = async () => {
      await ctx.dispose();
      __openContexts.delete(disposer);
    };
    __openContexts.add(disposer);

    return {
      api: new ProjectsApi(ctx),
      uid,
      owner,
      dispose: disposer, // optional for specs; fixture can auto-clean by calling __disposeAllProjectApiContexts()
    };
  }
}
