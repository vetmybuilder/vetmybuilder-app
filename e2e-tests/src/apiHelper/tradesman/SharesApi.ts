import { expect } from "@playwright/test";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
  get: (path: string) => Promise<ApiResponse>;
};

export type TradeShare = {
  id: number;
  projectId: number;
  tradesmanUid: string;
  companyName: string | null;
  primaryPhotoUrl: string | null;
  photos: Array<{ url?: string; absoluteUrl?: string }>;
  message: string;
  createdAt: string;
};

export class SharesApi {
  constructor(private readonly apiClient: ApiClient) {}

  async shareProfile(projectId: number): Promise<void> {
    const res = await this.apiClient.post("/api/tradesmen/shares", { projectId });
    expect(res.status()).toBe(201);
  }

  async getShares(projectId: number): Promise<TradeShare[]> {
    const res = await this.apiClient.get(
      `/api/tradesmen/shares?projectId=${projectId}`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    return body.shares as TradeShare[];
  }
}

export default SharesApi;
