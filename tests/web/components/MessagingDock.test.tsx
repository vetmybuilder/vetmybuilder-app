// tests/web/components/MessagingDock.test.tsx
//
// Project-scoped LinkedIn-style chat dock for homeowners. Mounts on
// /projects/[id] only; lists matches for that project, expands to a
// row list, and pops a ChatWindow when a row is clicked.
//
// Mobile coverage is owned by the Playwright e2e suite - jsdom only
// sees the desktop dock markup.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const matchesProject7 = [
  {
    matchId: 11,
    projectId: 7,
    projectTitle: "Loft conversion",
    companyName: "Harrow Building Ltd",
    photoUrl: null,
    status: "matched",
    unreadCount: 2,
    lastMessage: {
      body: "Happy to swing by Thursday",
      createdAt: "2026-05-04T10:00:00Z",
      attachmentCount: 0,
    },
  },
  // Different project - dock should filter this out when on /projects/7
  {
    matchId: 12,
    projectId: 99,
    projectTitle: "Bathroom",
    companyName: "Other Project Ltd",
    photoUrl: null,
    status: "matched",
    unreadCount: 0,
    lastMessage: null,
  },
];

const get = vi.fn(async (url: string) => {
  if (url === "/api/matches") return { data: { matches: matchesProject7 } };
  return { data: {} };
});
const post = vi.fn(async () => ({ data: {} }));
const apiInstance = { get, post };

vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

vi.mock("@/utils/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, loading: false }),
}));

vi.mock("@/utils/useSseEvent", () => ({
  useSseEvent: () => {},
}));

const routerState = { pathname: "/projects/[id]", query: { id: "7" } };
vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: routerState.pathname,
    query: routerState.query,
    asPath: "/projects/7",
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// ChatWindow has its own /api/chat fetches + SSE - stub it so we can
// observe "did the dock open a chat for this matchId?" cleanly.
vi.mock("@/components/messaging/ChatWindow", () => ({
  default: ({ matchId }: { matchId: number }) => (
    <div data-testid={`stub-chat-${matchId}`}>chat for {matchId}</div>
  ),
}));

import MessagingDock from "@/components/messaging/MessagingDock";

describe("<MessagingDock />", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it("shows the collapsed pill once project-scoped matches load", async () => {
    render(<MessagingDock />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /open messaging/i }),
      ).toBeInTheDocument();
    });
    // Total unread badge sums project-7 only (2). The other-project row
    // (unread 0) is filtered out before the badge tallies.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("expanding the dock lists only matches for the current project", async () => {
    render(<MessagingDock />);
    const pill = await screen.findByRole("button", { name: /open messaging/i });
    fireEvent.click(pill);

    // Project 7 row appears...
    await waitFor(() => {
      expect(screen.getByText("Harrow Building Ltd")).toBeInTheDocument();
    });
    // ...project 99 row does NOT.
    expect(screen.queryByText("Other Project Ltd")).not.toBeInTheDocument();
  });

  it("clicking a row pops a chat window for that matchId", async () => {
    render(<MessagingDock />);
    const pill = await screen.findByRole("button", { name: /open messaging/i });
    fireEvent.click(pill);
    const row = await screen.findByText("Harrow Building Ltd");
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getByTestId("stub-chat-11")).toBeInTheDocument();
    });
  });
});
