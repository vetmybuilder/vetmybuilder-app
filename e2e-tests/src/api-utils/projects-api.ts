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
  createdAt: string;
  ownerUserId: string;
};

type CreateProjectResponseBody = { project: ProjectRecord };
type FavouriteResponse = { ok?: boolean };

type UsersApiLike = {
  createUser(u: User): Promise<{ uid?: string }>;
};
type AuthApiLike = {
  idTokenForUid(uid: string): Promise<string>;
  customToken(uid: string): Promise<string>;
};

const DEFAULT_API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";
const API_PREFIX = process.env.E2E_API_PREFIX || "/api";

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

    const res = await this.request.post(`${API_PREFIX}/projects`, {
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

  async createProjectBody(
    project: Project,
    extraHeaders?: Record<string, string>
  ): Promise<CreateProjectResponseBody> {
    const res = await this.createProject(project, extraHeaders);
    return (await res.json()) as CreateProjectResponseBody;
  }

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

  async publishProject(projectId: number): Promise<APIResponse> {
    const res = await this.request.post(
      `${API_PREFIX}/projects/${projectId}/publish`,
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    const raw = await res.text();

    let json: any = undefined;
    try {
      json = raw ? JSON.parse(raw) : undefined;
    } catch {}

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

  async publishProjectBody(
    projectId: number
  ): Promise<{ project: ProjectRecord }> {
    const res = await this.publishProject(projectId);
    return (await res.json()) as { project: ProjectRecord };
  }

  async publish(project: Project): Promise<APIResponse> {
    if (!project.id)
      throw new Error("publish(project): project.id is required");
    const res = await this.publishProject(project.id);
    const body = (await res.json()) as { project: ProjectRecord };
    if (body?.project) this.hydrate(project, body.project);
    return res;
  }

  async favouriteProject(
    projectId: number,
    opts: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<void> {
    const timeout = opts.timeoutMs ?? 5_000;
    const interval = opts.intervalMs ?? 250;

    await expect
      .poll(
        async () => {
          const res = await this.request.post(
            `${API_PREFIX}/projects/${projectId}/favourite`,
            { headers: { "Content-Type": "application/json" } }
          );
          try {
            const json = (await res.json()) as FavouriteResponse;
            return json?.ok === true;
          } catch {
            return false;
          }
        },
        {
          timeout,
          intervals: [interval],
          message: `POST ${API_PREFIX}/projects/${projectId}/favourite did not yield { ok: true } within ${timeout}ms`,
        }
      )
      .toBe(true);
  }

  async favourite(
    project: { id?: number },
    opts?: { timeoutMs?: number; intervalMs?: number }
  ): Promise<void> {
    if (!project.id)
      throw new Error("favourite(project): project.id is required");
    await this.favouriteProject(project.id, opts);
  }

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

  static async createForNewOwner(opts: {
    usersApi: UsersApiLike;
    authApi: AuthApiLike;
    page?: Page;
    loginInBrowser?: boolean;
    redirect?: string;
    owner?: User;
    baseURL?: string;
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

    const { uid } = await usersApi.createUser(owner);
    if (!uid) throw new Error("owner uid missing");

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
      dispose: disposer,
    };
  }
}
