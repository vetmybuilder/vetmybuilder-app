// tests/web/pages/inbox.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InboxPage from "@/pages/inbox";

const pitches = [
  {
    messageId: "m1",
    projectId: "p1",
    projectTitle: "Kitchen extension",
    builderFirstName: "James",
    companyName: "Harrow",
    yearsTrading: 12,
    outward: "E4",
    body: "Hi — I'm James",
    hoursAgo: 2,
    status: "new" as const,
  },
  {
    messageId: "m2",
    projectId: "p2",
    projectTitle: "Roof repair",
    builderFirstName: "Alan",
    companyName: "Lister",
    yearsTrading: 8,
    outward: "E17",
    body: "Happy to send photos",
    hoursAgo: 24,
    status: "new" as const,
  },
];

const get = vi.fn(async () => ({ data: { pitches, unreadCount: 2 } }));
const post = vi.fn(async () => ({ data: { status: "ok" } }));
vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post }) }));
vi.mock("@/utils/auth", () => ({ useAuth: () => ({ user: { uid: "ho1" } }) }));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    isReady: true,
    push: vi.fn(),
    back: vi.fn(),
    pathname: "/inbox",
    asPath: "/inbox",
  }),
}));

describe("InboxPage", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it("renders hero, tabs, and pitch cards tagged with project", async () => {
    render(<InboxPage />);
    await waitFor(() =>
      expect(screen.getByText(/Pitches from/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("James")).toBeInTheDocument();
    expect(screen.getByText("Alan")).toBeInTheDocument();
    expect(screen.getAllByText(/Kitchen extension|Roof repair/)).toHaveLength(2);
  });

  it("dismisses a pitch optimistically", async () => {
    render(<InboxPage />);
    await waitFor(() => screen.getByText("James"));
    const dismissButtons = screen.getAllByRole("button", { name: /Dismiss/i });
    fireEvent.click(dismissButtons[0]);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/projects/p1/inbox/m1/dismiss",
        {},
      ),
    );
  });

  it("accepts & replies optimistically", async () => {
    render(<InboxPage />);
    await waitFor(() => screen.getByText("James"));
    const acceptButtons = screen.getAllByRole("button", {
      name: /Accept & reply/i,
    });
    fireEvent.click(acceptButtons[0]);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/projects/p1/inbox/m1/reply", {}),
    );
  });

  it("switches to Replied tab and shows empty state", async () => {
    render(<InboxPage />);
    await waitFor(() => screen.getByText("James"));
    fireEvent.click(screen.getByRole("tab", { name: /^Replied/i }));
    expect(screen.getByText(/No replies yet/i)).toBeInTheDocument();
  });
});
