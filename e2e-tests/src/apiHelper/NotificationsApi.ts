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
  post: (path: string, data?: any) => Promise<ApiResponse>;
  del: (path: string) => Promise<ApiResponse>;
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

  // ─── Mutations ────────────────────────────────────────────────────

  async markAsRead(id: number): Promise<void> {
    const res = await this.apiClient.post(`/api/notifications/${id}/read`);
    expect(res.status(), `Mark notification ${id} as read`).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  }

  async dismiss(id: number): Promise<void> {
    const res = await this.apiClient.del(`/api/notifications/${id}`);
    expect(res.status(), `Dismiss notification ${id}`).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  }

  // ─── Assertions ───────────────────────────────────────────────────

  async expectUnreadCount(expected: number): Promise<void> {
    const { unread } = await this.list();
    expect(unread, `Expected ${expected} unread notifications`).toBe(expected);
  }

  async expectNotificationExists(id: number): Promise<NotificationItem> {
    const { items } = await this.list();
    const found = items.find((n) => n.id === id);
    expect(found, `Notification ${id} should exist`).toBeTruthy();
    return found!;
  }

  async expectNotificationGone(id: number): Promise<void> {
    const { items } = await this.list();
    const found = items.find((n) => n.id === id);
    expect(found, `Notification ${id} should not exist`).toBeFalsy();
  }

  async expectNotificationRead(id: number): Promise<void> {
    const n = await this.expectNotificationExists(id);
    expect(n.readAt, `Notification ${id} should have a readAt timestamp`).toBeTruthy();
  }

  async expectNotificationUnread(id: number): Promise<void> {
    const n = await this.expectNotificationExists(id);
    expect(n.readAt, `Notification ${id} should not have a readAt timestamp`).toBeNull();
  }

  /**
   * Polls until a notification of the given type appears, or times out.
   * Useful for fire-and-forget notifications that involve async work (LLM enrichment, etc.).
   */
  async waitForType(
    type: string,
    { timeoutMs = 10_000, intervalMs = 500 } = {},
  ): Promise<NotificationItem> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await this.findLatestByType(type);
      if (found) return found;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Notification of type "${type}" did not appear within ${timeoutMs}ms`);
  }

  /**
   * Polls until a notification of the given type appears, then waits a settle
   * period and returns the final count. Used for dedup assertions.
   */
  async waitAndCountByType(
    type: string,
    { waitMs = 10_000, settleMs = 2_000, intervalMs = 500 } = {},
  ): Promise<NotificationItem[]> {
    // First wait for at least one to appear
    await this.waitForType(type, { timeoutMs: waitMs, intervalMs });
    // Then settle to let any duplicates arrive
    await new Promise((r) => setTimeout(r, settleMs));
    return this.findAllByType(type);
  }

  async listGrouped(): Promise<{ groups: any[]; ungrouped: any[]; unread: number }> {
    const res = await this.apiClient.get(`/api/notifications?grouped=1`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.groups)).toBe(true);
    expect(typeof body.unread).toBe("number");
    return body;
  }

  async expectGroupForProject(projectId: number): Promise<any> {
    const { groups } = await this.listGrouped();
    const group = groups.find((g: any) => g.projectId === projectId);
    expect(group, `Expected notification group for project ${projectId}`).toBeTruthy();
    return group;
  }

  async expectNoGroupForProject(projectId: number): Promise<void> {
    const { groups } = await this.listGrouped();
    const group = groups.find((g: any) => g.projectId === projectId);
    expect(group, `Expected no notification group for project ${projectId}`).toBeFalsy();
  }
}

export default NotificationsApi;
