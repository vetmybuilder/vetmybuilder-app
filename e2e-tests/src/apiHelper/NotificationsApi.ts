// e2e-tests/src/apiHelper/NotificationsApi.ts
//
// API helper for /api/notifications. Used by tests that verify notification
// side effects (e.g. "the tradesman receives hire_received when hired").

import { expect } from "@playwright/test";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  get: (path: string) => Promise<ApiResponse>;
};

export type NotificationItem = {
  id: number;
  type: string;
  message: string;
  projectId: number | null;
  linkPath: string | null;
  createdAt: string;
  readAt: string | null;
};

export class NotificationsApi {
  constructor(private readonly apiClient: ApiClient) {}

  /**
   * Fetches the calling user's notifications. Asserts 200 and returns the
   * parsed body — `{ items, unread }`.
   */
  async list(): Promise<{ items: NotificationItem[]; unread: number }> {
    const res = await this.apiClient.get(`/api/notifications`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.unread).toBe("number");

    return body;
  }

  /**
   * Returns the most recent notification of the given type, or null.
   * Useful for asserting "the tradesman received a hire_received notification
   * for project X" without depending on ordering details.
   */
  async findLatestByType(type: string): Promise<NotificationItem | null> {
    const { items } = await this.list();
    return items.find((n) => n.type === type) || null;
  }

  /**
   * Returns all notifications of the given type. Useful for asserting
   * deduplication — e.g. "only one notification of this type exists".
   */
  async findAllByType(type: string): Promise<NotificationItem[]> {
    const { items } = await this.list();
    return items.filter((n) => n.type === type);
  }
}

export default NotificationsApi;
