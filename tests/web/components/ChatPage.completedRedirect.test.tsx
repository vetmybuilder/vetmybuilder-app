// tests/web/components/ChatPage.completedRedirect.test.tsx
//
// Regression guard for the May 2026 "stale chat URL" fix: once a project
// has been closed the chat thread drops out of both inboxes, but a user
// might still hit the URL via an old email link or bookmark. The page
// must redirect them to a canonical "this is done" surface:
//   - homeowner → /projects/:id/completed
//   - tradesman → /tradesman/matches
//
// Without this guard anyone removing the redirect effect in
// web/pages/chat/[matchId].tsx ships a chat the user can never reach
// from the UI, with no test failing to flag it.

import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const replace = vi.fn();

vi.mock("next/router", () => ({
  useRouter: () => ({
    isReady: true,
    pathname: "/chat/[matchId]",
    query: { matchId: "11" },
    push: vi.fn(),
    replace,
    back: vi.fn(),
  }),
}));

// AuthedOnly wraps the page; under jsdom we want to render the inner
// page directly without the redirect/loading branches.
vi.mock("@/components/AuthedOnly", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/utils/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    loading: false,
    token: "test-token",
  }),
}));

// Heavy children we don't need to test through here.
vi.mock("@/components/fileUpload/FileGridUploader", () => ({
  default: () => <div />,
}));
vi.mock("@/components/PhotoLightbox", () => ({ default: () => null }));

// jsdom doesn't implement matchMedia. The chat page reads it to decide
// whether to bounce desktop visitors to /matches; we force the "mobile"
// branch (matches: false) so the redirect we're testing for is the
// completed-project one, not the desktop one.
//
// jsdom also lacks Element.prototype.scrollIntoView; the chat page calls
// it inside a setTimeout after the initial render. The redirect we're
// testing fires earlier so the test still passes, but the unhandled
// scrollIntoView throw shows up in the report. Stub once at module load.
if (typeof window !== "undefined" && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const baseChatData = {
  matchId: 11,
  projectId: 95,
  projectName: "Loft conversion",
  source: "subscribed",
  otherParty: {
    role: "tradesman",
    uid: "t1",
    name: "Adam",
    firstName: "Adam",
  },
  me: { role: "homeowner" as const, uid: "u1", senderUids: ["u1"] },
  messages: [],
};

const get = vi.fn();
const apiInstance = { get, post: vi.fn() };
vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

import ChatPage from "@/pages/chat/[matchId]";

describe("<ChatPage /> - completed-project redirect", () => {
  beforeEach(() => {
    replace.mockClear();
    get.mockReset();
  });

  it("redirects a homeowner viewer to /projects/:id/completed", async () => {
    get.mockResolvedValueOnce({
      data: { ...baseChatData, projectStatus: "completed" },
    });

    render(<ChatPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/projects/95/completed");
    });
  });

  it("redirects a tradesman viewer to /tradesman/matches", async () => {
    get.mockResolvedValueOnce({
      data: {
        ...baseChatData,
        projectStatus: "completed",
        me: { role: "tradesman", uid: "t1", senderUids: ["t1"] },
        otherParty: {
          role: "homeowner",
          uid: "u1",
          name: "Chris",
          firstName: "Chris",
        },
      },
    });

    render(<ChatPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/tradesman/matches");
    });
  });

  it("does NOT redirect when the project is still live", async () => {
    get.mockResolvedValueOnce({
      data: { ...baseChatData, projectStatus: "live" },
    });

    render(<ChatPage />);

    // Give React a chance to run the redirect effect if it were going to
    // fire. 50ms is enough — the effect would have run by then.
    await new Promise((r) => setTimeout(r, 50));

    expect(replace).not.toHaveBeenCalledWith("/projects/95/completed");
    expect(replace).not.toHaveBeenCalledWith("/tradesman/matches");
  });
});
