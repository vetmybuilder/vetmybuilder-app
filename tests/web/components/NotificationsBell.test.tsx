// tests/web/components/NotificationsBell.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// ---- Mocks ----

// auth: allow toggling user vs logged-out
const useAuthMock = vi.fn();
vi.mock("@/utils/auth", () => ({
  useAuth: () => useAuthMock(),
}));

// api: stable instance whose methods we can modify in each test
const api = {
  get: vi.fn(),
  post: vi.fn(),
};
vi.mock("@/utils/api", () => ({
  useApi: () => api,
}));

// router: capture push calls
const pushMock = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Ensure Link renders a simple anchor (Next’s Link is fine, but this keeps it simple)
vi.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  );
  return { default: Link };
});

import NotificationsBell from "../../../web/components/NotificationsBell";

function renderBellLoggedIn({
  unread = 3,
  items = [
    {
      id: -1,
      type: "test",
      message: "Welcome notification",
      projectId: null,
      linkPath: null,
      createdAt: new Date().toISOString(),
      readAt: null,
    },
  ],
}: {
  unread?: number;
  items?: any[];
} = {}) {
  useAuthMock.mockReturnValue({
    user: { getIdToken: vi.fn().mockResolvedValue(undefined) }, // no SSE in tests
    loading: false,
  });
  api.get.mockResolvedValue({ data: { items, unread } });
  api.post.mockResolvedValue({ data: {} });

  return render(<NotificationsBell />);
}

describe("<NotificationsBell />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows badge, opens menu, and can mark all as read", async () => {
    renderBellLoggedIn({ unread: 3 });

    // Button shows unread indicator
    const btn = await screen.findByRole("button", {
      name: /notifications \(unread\)/i,
    });
    expect(btn).toBeInTheDocument();

    // Open menu
    fireEvent.click(btn);

    // Menu visible with Clear all button
    const markAll = await screen.findByRole("button", {
      name: /clear all/i,
    });
    expect(markAll).toBeEnabled();

    // Click "Clear all" -> POST called and button disabled
    fireEvent.click(markAll);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/notifications/read-all");
      expect(markAll).toBeDisabled();
    });
  });

  it("clicking an item marks it read and navigates", async () => {
    const createdAt = new Date().toISOString();
    renderBellLoggedIn({
      unread: 1,
      items: [
        {
          id: 42,
          type: "invitation",
          message: "Builder invited to your project",
          projectId: 123,
          linkPath: "/projects/123",
          createdAt,
          readAt: null,
        },
      ],
    });

    const btn = await screen.findByRole("button", {
      name: /notifications \(unread\)/i,
    });
    fireEvent.click(btn);

    // Click the item
    const item = await screen.findByRole("menuitem", {
      name: /builder invited to your project/i,
    });
    fireEvent.click(item);

    // Marks read + navigates
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/notifications/42/read");
      expect(pushMock).toHaveBeenCalledWith("/projects/123");
    });
  });

  it("empty state shows “You’re all caught up.” and disables “Mark all read”", async () => {
    renderBellLoggedIn({ unread: 0, items: [] });

    const btn = await screen.findByRole("button", { name: /notifications/i });
    fireEvent.click(btn);

    expect(
      await screen.findByText(/you’re all caught up\./i)
    ).toBeInTheDocument();
    const markAll = await screen.findByRole("button", {
      name: /clear all/i,
    });
    expect(markAll).toBeDisabled();
  });

  it("renders fine when logged out", async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });
    api.get.mockResolvedValue({ data: { items: [], unread: 0 } });

    render(<NotificationsBell />);

    // Should still render a bell button
    const btn = await screen.findByRole("button", { name: /notifications/i });
    expect(btn).toBeInTheDocument();
  });
});
