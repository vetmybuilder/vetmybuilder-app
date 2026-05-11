// tests/web/components/DesktopInbox.test.tsx
//
// Two-pane inbox column rendered on /matches:
//   - Left: match list (Messages) or notification list (Activity)
//   - Right: selected thread / notification detail
//
// Mobile coverage is owned by the Playwright e2e suite.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const matches = [
  {
    matchId: 11,
    projectId: 7,
    projectTitle: "Loft conversion",
    companyName: "Harrow Building Ltd",
    photoUrl: null,
    unreadCount: 1,
    lastMessage: {
      body: "Happy to swing by Thursday.",
      createdAt: "2026-05-04T10:00:00Z",
      attachmentCount: 0,
    },
  },
];

const notifications = [
  {
    id: 101,
    type: "recommendation_new",
    message: "Priya recommended a tradesperson",
    projectId: 7,
    linkPath: "/projects/7",
    createdAt: "2026-05-04T11:00:00Z",
    readAt: null,
  },
];

const chatThread = {
  matchId: 11,
  projectId: 7,
  projectName: "Loft conversion",
  otherParty: { role: "tradesman", uid: "t1", name: "Adam", firstName: "Adam", avatarUrl: null },
  me: { role: "homeowner", uid: "u1" },
  messages: [
    {
      id: 1,
      senderUid: "u1",
      senderRole: "homeowner",
      senderName: "Chris",
      body: "Hi, are you free Thursday?",
      createdAt: "2026-05-04T10:00:00Z",
      attachments: [],
    },
  ],
};

const get = vi.fn(async (url: string) => {
  if (url === "/api/matches") return { data: { matches } };
  if (url.startsWith("/api/notifications")) return { data: { items: notifications } };
  if (url.startsWith("/api/chat/")) return { data: chatThread };
  return { data: {} };
});
const post = vi.fn(async () => ({ data: {} }));
const apiInstance = { get, post };
vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

vi.mock("@/utils/useSseEvent", () => ({ useSseEvent: () => {} }));

// DesktopInbox calls useRouter() to pick up ?matchId=N for deep-links.
// Provide a minimal stub so the component mounts under jsdom.
vi.mock("next/router", () => ({
  useRouter: () => ({
    isReady: true,
    pathname: "/matches",
    query: {},
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import DesktopInbox from "@/components/messaging/DesktopInbox";

describe("<DesktopInbox />", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it("renders the match list and auto-selects the first thread", async () => {
    render(<DesktopInbox />);
    // Left list row
    await waitFor(() =>
      expect(screen.getAllByText("Harrow Building Ltd").length).toBeGreaterThan(0),
    );
    // Right pane thread loaded for the auto-selected match
    await waitFor(() =>
      expect(screen.getByText(/Hi, are you free Thursday/)).toBeInTheDocument(),
    );
  });

  it("switches to Activity tab and shows notifications", async () => {
    render(<DesktopInbox />);
    const activityTab = await screen.findByRole("tab", { name: /activity/i });
    fireEvent.click(activityTab);
    // The message appears in both the list pane (left) and the detail
    // pane (right) once selected, hence getAllByText.
    await waitFor(() =>
      expect(
        screen.getAllByText(/Priya recommended a tradesperson/).length,
      ).toBeGreaterThan(0),
    );
  });

  it("typing a reply and pressing Send posts to /api/chat/:matchId/messages", async () => {
    render(<DesktopInbox />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Type a reply/)).toBeInTheDocument(),
    );

    const input = screen.getByPlaceholderText(/Type a reply/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "See you then." } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/chat/11/messages", {
        body: "See you then.",
      }),
    );
  });
});
