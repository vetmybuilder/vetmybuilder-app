import { expect } from "@playwright/test";
import type { TradesmanStatus } from "../../types/tradesman";

type ApiClient = {
  post: (path: string, payload?: any) => Promise<{ status(): number }>;
};

export class AdminApi {
  constructor(private readonly apiClient: ApiClient) {}

  async setTradesmanStatus(
    userId: string,
    status: TradesmanStatus,
    assignTo?: string,
  ): Promise<void> {
    const payload: Record<string, string> = { status };
    if (assignTo) payload.assignTo = assignTo;

    const res = await this.apiClient.post(
      `/api/admin/tradesmen/${userId}/status`,
      payload,
    );
    expect(res.status()).toBe(200);
  }
}

export default AdminApi;
