// tests/web/components/TradesmanInboxDropdown.test.tsx
//
// Covers the tradesperson global header inbox dropdown:
//   - Renders match rows from /api/tradesman/matches on Messages tab
//   - Activity tab surfaces /api/notifications items
//   - Header "View all" link routes to /tradesman/matches
//
// Mobile coverage is owned by the Playwright e2e suite.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const matches = [
  {
    matchId: 21,
    projectId: 9,
    projectName: "External wall insulation for end-of-terrace",
    homeownerFirstName: "Chris",
    source: "recommended",
    matchedAt: "2026-05-04T09:00:00Z",
    unreadCount: 1,
    lastMessage: {
      body: "Could you start the week of the 12th?",
      createdAt: "2026-05-04T10:00:00Z",
      attachmentCount: 0,
    },
  },
  {
    matchId: 22,
    projectId: 10,
    projectName: "Loft conversion - dormer with en-suite",
    homeownerFirstName: "Priya",
    source: "subscribed",
    matchedAt: "2026-05-03T14:00:00Z",
    unreadCount: 0,
    lastMessage: null,
  },
];

const notifications = [
  {
    id: 201,
    type: "lead_new",
    message: "Sarah picked you for her kitchen project",
    projectId: 11,
    linkPath: "/tradesman/leads",
    createdAt: "2026-05-04T11:00:00Z",
    readAt: null,
  },
];

const get = vi.fn(async (url: string) => {
  if (url.startsWith("/api/tradesman/matches")) return { data: { matches } };
  if (url.startsWith("/api/notifications")) return { data: { items: notifications } };
  return { data: {} };
});
const post = vi.fn(async () => ({ data: {} }));

const apiInstance = { get, post };
vi.mock("@/utils/api", () => ({
  useApi: () => apiInstance,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/tradesman/jobs",
    asPath: "/tradesman/jobs",
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

import TradesmanInboxDropdown, {
  useTradesmanInboxUnread,
} from "@/components/TradesmanInboxDropdown";

// As with InboxDropdown: the dropdown reads from a module-level cache
// the hook fills, so we render both together.
function Harness({ onClose }: { onClose: () => void }) {
  useTradesmanInboxUnread(true);
  return <TradesmanInboxDropdown onClose={onClose} />;
}

describe("<TradesmanInboxDropdown />", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it("renders match rows on the Messages tab by default", async () => {
    render(<Harness onClose={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(/External wall insulation/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Loft conversion/)).toBeInTheDocument();
    });

    // Snippet (last-message body) renders for the match that has one.
    expect(
      screen.getByText(/Could you start the week of the 12th/),
    ).toBeInTheDocument();

    expect(screen.getByLabelText("1 unread")).toBeInTheDocument();
  });

  it("switches to the Activity tab and shows notification items", async () => {
    render(<Harness onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /activity/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /activity/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Sarah picked you for her kitchen project/),
      ).toBeInTheDocument();
    });
  });

  it("exposes a 'View all' link pointing at /tradesman/matches", () => {
    render(<Harness onClose={vi.fn()} />);
    const viewAll = screen.getByRole("link", { name: /view all/i });
    expect(viewAll).toHaveAttribute("href", "/tradesman/matches");
  });
});
