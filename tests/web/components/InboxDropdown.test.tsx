// tests/web/components/InboxDropdown.test.tsx
//
// Covers the homeowner global header inbox dropdown:
//   - Renders Messages tab by default with match rows from /api/matches
//   - Activity tab can be selected and surfaces /api/notifications items
//   - Header "View all" link routes to /matches
//
// Mobile responsive coverage is owned by the Playwright e2e suite -
// jsdom only sees the desktop dropdown markup.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const matches = [
  {
    matchId: 11,
    projectId: 7,
    projectTitle: "Loft conversion",
    companyName: "Harrow Building Ltd",
    photoUrl: null,
    unreadCount: 2,
    lastMessage: {
      body: "Happy to swing by Thursday at 3 if that suits.",
      createdAt: "2026-05-04T10:00:00Z",
      attachmentCount: 0,
    },
  },
  {
    matchId: 12,
    projectId: 8,
    projectTitle: "Bathroom refit",
    companyName: "Northwood Plumbing",
    photoUrl: null,
    unreadCount: 0,
    lastMessage: null,
  },
];

const notifications = [
  {
    id: 101,
    type: "recommendation_new",
    message: "Priya recommended a tradesperson for your project",
    projectId: 7,
    linkPath: "/projects/7",
    createdAt: "2026-05-04T11:00:00Z",
    readAt: null,
  },
];

const get = vi.fn(async (url: string) => {
  if (url.startsWith("/api/matches")) return { data: { matches } };
  if (url.startsWith("/api/notifications")) return { data: { items: notifications } };
  return { data: {} };
});
const post = vi.fn(async () => ({ data: {} }));

// Stable api reference: the dropdown's useInboxUnread hook depends on
// the api object via useCallback, so a fresh object each render would
// loop refetch -> setState -> render -> refetch.
const apiInstance = { get, post };
vi.mock("@/utils/api", () => ({
  useApi: () => apiInstance,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/projects",
    asPath: "/projects",
    query: {},
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

import InboxDropdown, { useInboxUnread } from "@/components/InboxDropdown";

// The dropdown reads its rows from a module-level cache populated by
// useInboxUnread (which SiteHeader normally calls). Render both
// together so the fetch fires before the dropdown reads state.
function Harness({ onClose }: { onClose: () => void }) {
  useInboxUnread(true);
  return <InboxDropdown onClose={onClose} />;
}

describe("<InboxDropdown />", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it("renders match rows on the Messages tab by default", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    // Messages tab is the default; match rows should appear after fetch.
    await waitFor(() => {
      expect(screen.getByText(/Harrow Building Ltd/)).toBeInTheDocument();
      expect(screen.getByText(/Northwood Plumbing/)).toBeInTheDocument();
    });

    // Snippet (last-message body) renders for the match that has one.
    expect(
      screen.getByText(/Happy to swing by Thursday/),
    ).toBeInTheDocument();

    // Unread dot is announced for the row with unreadCount > 0.
    expect(
      screen.getByLabelText("2 unread"),
    ).toBeInTheDocument();
  });

  it("switches to the Activity tab and shows notification items", async () => {
    render(<Harness onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /activity/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /activity/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Priya recommended a tradesperson/),
      ).toBeInTheDocument();
    });
  });

  it("exposes a 'View all' link pointing at /matches", async () => {
    render(<Harness onClose={vi.fn()} />);
    const viewAll = screen.getByRole("link", { name: /view all/i });
    expect(viewAll).toHaveAttribute("href", "/matches");
  });
});
