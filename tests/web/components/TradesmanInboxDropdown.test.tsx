// tests/web/components/TradesmanInboxDropdown.test.tsx
//
// Trade-side analogue of InboxDropdown.test. Covers the bulk + per-row
// actions on the global header inbox:
//   - Messages tab: "Mark all as read" -> POST /api/matches/read-all
//   - Activity tab: "Clear all"       -> POST /api/notifications/dismiss-all
//   - Activity tab: per-row dismiss   -> DELETE /api/notifications/:id
//
// Behaviour mirrors the homeowner dropdown - same endpoints, same
// optimistic-update pattern - just rendered with emerald accents and
// pulled from /api/tradesman/matches instead of /api/matches.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const matches = [
  {
    matchId: "21",
    projectId: 7,
    projectName: "Loft conversion",
    projectType: "Loft Conversion",
    projectLocation: "E4",
    homeownerFirstName: "Chris",
    source: "subscribed",
    matchedAt: "2026-05-04T10:00:00Z",
    lastMessage: null,
    unreadCount: 3,
  },
];

const notifications = [
  {
    id: 201,
    type: "project_match",
    message: "A new External Wall Insulation job was posted",
    projectId: 7,
    linkPath: "/tradesman/jobs/7",
    createdAt: "2026-05-04T11:00:00Z",
    readAt: null,
  },
];

const get = vi.fn(async (url: string) => {
  if (url.startsWith("/api/tradesman/matches")) return { data: { matches } };
  if (url.startsWith("/api/notifications"))
    return { data: { items: notifications } };
  return { data: {} };
});
const post = vi.fn(async () => ({ data: {} }));
const del = vi.fn(async () => ({ data: {} }));
const apiInstance = { get, post, delete: del };

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
  useTradesInboxUnread,
} from "@/components/TradesmanInboxDropdown";

function Harness({ onClose }: { onClose: () => void }) {
  // The dropdown reads its rows from a module-level cache the unread
  // hook populates. Render both together so the fetch fires before
  // the dropdown reads state.
  useTradesInboxUnread(true);
  return <TradesmanInboxDropdown onClose={onClose} />;
}

describe("<TradesmanInboxDropdown />", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
    del.mockClear();
  });

  it("shows Mark-all-as-read on Messages when unread exists and POSTs /api/matches/read-all", async () => {
    render(<Harness onClose={vi.fn()} />);

    const btn = await screen.findByTestId("inbox-mark-all-read");
    fireEvent.click(btn);

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/matches/read-all", {}),
    );
  });

  it("shows Clear-all on Activity and POSTs /api/notifications/dismiss-all on click", async () => {
    render(<Harness onClose={vi.fn()} />);

    // Flip to Activity. There's only one button labelled Activity (the
    // tab pill), so a plain getByText works.
    fireEvent.click(await screen.findByText(/^Activity$/));

    const clear = await screen.findByTestId("inbox-clear-all");
    fireEvent.click(clear);

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/notifications/dismiss-all",
        {},
      ),
    );
    expect(
      screen.queryByText(/A new External Wall Insulation job/),
    ).not.toBeInTheDocument();
  });

  it("per-row dismiss DELETEs /api/notifications/:id and drops the row optimistically", async () => {
    render(<Harness onClose={vi.fn()} />);

    fireEvent.click(await screen.findByText(/^Activity$/));

    const dismiss = await screen.findByTestId("inbox-activity-dismiss-201");
    fireEvent.click(dismiss);

    await waitFor(() =>
      expect(del).toHaveBeenCalledWith("/api/notifications/201"),
    );
    expect(
      screen.queryByText(/A new External Wall Insulation job/),
    ).not.toBeInTheDocument();
  });
});
