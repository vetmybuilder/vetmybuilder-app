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
  // The component fetches ?grouped=1 which expects { groups, ungrouped, unread }
  api.get.mockResolvedValue({ data: { groups: [], ungrouped: items, unread } });
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

    // Menu visible with Mark all as read button
    const markAll = await screen.findByRole("button", {
      name: /mark all as read/i,
    });
    expect(markAll).toBeEnabled();

    // Click "Mark all as read" -> POST called and button disabled
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
    const item = await screen.findByText(/builder invited to your project/i);
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
      await screen.findByText(/you.re all caught up/i)
    ).toBeInTheDocument();
    const markAll = await screen.findByRole("button", {
      name: /mark all as read/i,
    });
    expect(markAll).toBeDisabled();
  });

  // Scenario B2: a tradesperson sends a chat message on a matched thread.
  // The recipient (homeowner here) gets a bell entry that names the
  // sender and routes to the chat thread on click. Notification shape is
  // emitted by server/routes/chat/messages.post.js — type/message/linkPath
  // here mirror that exactly so the test guards rendering against the
  // real producer.
  it("renders a chat_message_new notification with the sender name and routes to the thread on click", async () => {
    const createdAt = new Date().toISOString();
    renderBellLoggedIn({
      unread: 1,
      items: [
        {
          id: 77,
          type: "chat_message_new",
          message: "New message from Tina Trader",
          projectId: 15,
          linkPath: "/chat/42",
          createdAt,
          readAt: null,
        },
      ],
    });

    const btn = await screen.findByRole("button", {
      name: /notifications \(unread\)/i,
    });
    fireEvent.click(btn);

    const item = await screen.findByText(/new message from tina trader/i);
    fireEvent.click(item);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/notifications/77/read");
      expect(pushMock).toHaveBeenCalledWith("/chat/42");
    });
  });

  // Scenario B1: a match is formed when both sides have right-swiped. The
  // bell entry on each side has a different message — the homeowner sees
  // the tradesperson's company name, the tradesperson sees only "a
  // homeowner" (homeowner identity stays masked until contact is unlocked
  // / chat is opened). Both deep-link into the new /chat/:matchId page.
  // Notification shape is emitted by server/lib/fireMatchFormed.js.
  it("renders a match_formed notification on the homeowner side with the trade name", async () => {
    renderBellLoggedIn({
      unread: 1,
      items: [
        {
          id: 88,
          type: "match_formed",
          message: '🎉 You matched with Acme Trades on "Replace bathroom flooring with LVT"',
          projectId: 15,
          linkPath: "/chat/42",
          createdAt: new Date().toISOString(),
          readAt: null,
        },
      ],
    });

    const btn = await screen.findByRole("button", {
      name: /notifications \(unread\)/i,
    });
    fireEvent.click(btn);

    const item = await screen.findByText(/you matched with acme trades/i);
    fireEvent.click(item);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/notifications/88/read");
      expect(pushMock).toHaveBeenCalledWith("/chat/42");
    });
  });

  it("renders a match_formed notification on the tradesperson side without naming the homeowner", async () => {
    renderBellLoggedIn({
      unread: 1,
      items: [
        {
          id: 89,
          type: "match_formed",
          message: '🎉 You matched with a homeowner on "Replace bathroom flooring with LVT"',
          projectId: 15,
          linkPath: "/chat/42",
          createdAt: new Date().toISOString(),
          readAt: null,
        },
      ],
    });

    const btn = await screen.findByRole("button", {
      name: /notifications \(unread\)/i,
    });
    fireEvent.click(btn);

    const item = await screen.findByText(/you matched with a homeowner/i);
    fireEvent.click(item);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/notifications/89/read");
      expect(pushMock).toHaveBeenCalledWith("/chat/42");
    });
  });

  // Scenario B3: a new recommendation arrives on a homeowner's project.
  // The bell entry is intentionally anonymous about the recommender (we
  // want the signal to be about the trade, not who suggested them) and
  // routes to the project page rather than a chat thread, because there
  // is no chat yet. Notification shape is emitted by
  // server/routes/projects/recommendations.post.js.
  it("renders a recommendation_new notification anonymously and routes to the project page on click", async () => {
    renderBellLoggedIn({
      unread: 1,
      items: [
        {
          id: 91,
          type: "recommendation_new",
          message:
            'Someone has recommended a tradesperson to your project “Replace bathroom flooring with LVT”',
          projectId: 15,
          linkPath: "/projects/15",
          createdAt: new Date().toISOString(),
          readAt: null,
        },
      ],
    });

    const btn = await screen.findByRole("button", {
      name: /notifications \(unread\)/i,
    });
    fireEvent.click(btn);

    const item = await screen.findByText(
      /someone has recommended a tradesperson/i,
    );
    fireEvent.click(item);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/notifications/91/read");
      expect(pushMock).toHaveBeenCalledWith("/projects/15");
    });
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
