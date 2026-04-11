import { expect, type APIRequestContext } from "@playwright/test";
import type Tradesman from "../../models/tradesman";

export class TradesmanApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
  ) {}

  async join(tradesman: Tradesman): Promise<string> {
    const res = await this.request.post(`${this.baseUrl}/api/tradesmen/join`, {
      data: tradesman.toJoinPayload(),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    return String(body.id);
  }

  async joinAsUser(
    uid: string,
    data: { companyName: string; tradeTypes: string; serviceAreas: string },
  ): Promise<string> {
    const testSecret = process.env.E2E_TEST_SECRET;
    if (!testSecret) throw new Error("Missing E2E_TEST_SECRET");
    const res = await this.request.post(`${this.baseUrl}/api/tradesmen/join`, {
      headers: { "X-Sim-Uid": uid, "X-Test-Secret": testSecret },
      data,
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    return String(body.id);
  }
}

export default TradesmanApi;
