import { expect } from "@playwright/test";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
  get: (path: string) => Promise<ApiResponse>;
};

export class ProjectApi {
  constructor(private readonly apiClient: ApiClient) {}

  async createProject(payload: any) {
    const res = await this.apiClient.post("/api/projects", payload);
    expect(res.status()).toBe(201);

    const body = await res.json();

    expect(body.project).toBeTruthy();
    expect(body.project.id).toBeTruthy();

    return body.project;
  }

  async createProjectForLoggedInHomeowner(payload: any) {
    return this.createProject(payload);
  }

  async getProject(projectId: string | number) {
    const res = await this.apiClient.get(`/api/projects/${projectId}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.project).toBeTruthy();
    expect(body.project.id).toBeTruthy();

    return body.project;
  }
}
