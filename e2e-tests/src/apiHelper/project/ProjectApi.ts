import { expect } from "@playwright/test";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
  get: (path: string) => Promise<ApiResponse>;
};

type CreateProjectOptions = {
  publish?: boolean;
};

export class ProjectApi {
  constructor(private readonly apiClient: ApiClient) {}

  async createProject(payload: any, opts: CreateProjectOptions = {}) {
    const res = await this.apiClient.post("/api/projects", payload);
    expect(res.status()).toBe(201);

    const body = await res.json();

    expect(body.project).toBeTruthy();
    expect(body.project.id).toBeTruthy();

    const createdProject = body.project;

    if (opts.publish) {
      return this.publishProject(createdProject.id);
    }

    return createdProject;
  }

  async createProjectForLoggedInHomeowner(
    payload: any,
    opts?: CreateProjectOptions,
  ) {
    return this.createProject(payload, opts);
  }

  async getProject(projectId: string | number) {
    const res = await this.apiClient.get(`/api/projects/${projectId}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.project).toBeTruthy();
    expect(body.project.id).toBeTruthy();

    return body.project;
  }

  async publishProject(projectId: string | number) {
    const res = await this.apiClient.post(`/api/projects/${projectId}/publish`);
    expect(res.status()).toBe(200);

    const body = await res.json();

    expect(body.project).toBeTruthy();
    expect(body.project.id).toBeTruthy();
    expect(String(body.project.status || "").toLowerCase()).toBe("live");

    return body.project;
  }
}

export default ProjectApi;
