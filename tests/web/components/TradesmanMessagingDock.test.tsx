// tests/web/components/TradesmanMessagingDock.test.tsx
//
// Tradesperson LinkedIn-style chat dock. Unlike the homeowner dock,
// this is NOT scoped to a specific project - tradespeople see every
// active conversation across their matches.
//
// Mobile coverage is owned by the Playwright e2e suite.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const matches = [
  {
    matchId: "21",
    projectId: 9,
    projectName: "External wall insulation",
    homeownerFirstName: "Chris",
    source: "recommended",
    matchedAt: "2026-05-04T09:00:00Z",
    unreadCount: 1,
    photoUrl: null,
    lastMessage: {
      body: "Could you start the week of the 12th?",
      createdAt: "2026-05-04T10:00:00Z",
      attachmentCount: 0,
    },
  },
  {
    matchId: "22",
    projectId: 10,
    projectName: "Loft conversion",
    homeownerFirstName: "Priya",
    source: "subscribed",
    matchedAt: "2026-05-03T14:00:00Z",
    unreadCount: 0,
    photoUrl: null,
    lastMessage: null,
  },
];

const get = vi.fn(async (url: string) => {
  if (url === "/api/tradesman/matches") return { data: { matches } };
  return { data: {} };
});
const post = vi.fn(async () => ({ data: {} }));
const apiInstance = { get, post };

vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

vi.mock("@/utils/auth", () => ({
  useAuth: () => ({ user: { uid: "t1" }, loading: false }),
}));

vi.mock("@/utils/useSseEvent", () => ({ useSseEvent: () => {} }));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/tradesman/jobs",
    query: {},
    asPath: "/tradesman/jobs",
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// ChatWindow is heavy (own /api/chat fetches + SSE) - stub so we can
// observe that the dock pops a window for the right matchId.
vi.mock("@/components/messaging/ChatWindow", () => ({
  default: ({ matchId }: { matchId: number }) => (
    <div data-testid={`stub-chat-${matchId}`}>chat for {matchId}</div>
  ),
}));

import TradesmanMessagingDock from "@/components/messaging/TradesmanMessagingDock";

describe("<TradesmanMessagingDock />", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it("shows the collapsed pill with the cross-project unread total", async () => {
    render(<TradesmanMessagingDock />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /open messaging/i }),
      ).toBeInTheDocument();
    });
    // Total unread = 1 (only matchId 21 has unread). The dock is NOT
    // project-scoped, so any cross-project unread tallies in.
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("expanding the dock lists every active match (not project-scoped)", async () => {
    render(<TradesmanMessagingDock />);
    const pill = await screen.findByRole("button", { name: /open messaging/i });
    fireEvent.click(pill);

    await waitFor(() => {
      expect(
        screen.getByText("External wall insulation"),
      ).toBeInTheDocument();
    });
    // Both projects are visible - confirms no per-project filter.
    expect(screen.getByText("Loft conversion")).toBeInTheDocument();
  });

  it("clicking a row pops a chat window for that matchId", async () => {
    render(<TradesmanMessagingDock />);
    const pill = await screen.findByRole("button", { name: /open messaging/i });
    fireEvent.click(pill);
    const row = await screen.findByText("External wall insulation");
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getByTestId("stub-chat-21")).toBeInTheDocument();
    });
  });
});
