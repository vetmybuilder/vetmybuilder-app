// tests/web/components/ChatWindow.test.tsx
//
// Floating + inline chat panel used by the messaging docks AND inline
// in the /tradesman/matches right pane. Covers:
//   - Renders messages fetched from /api/chat/:matchId/messages
//   - Typing in the composer + clicking Send fires the POST and
//     appends the new message to the list
//   - Inline variant omits the floating chrome (close + minimize)

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const initialMessages = [
  {
    id: 1,
    senderUid: "u1",
    senderRole: "homeowner" as const,
    senderName: "Chris",
    body: "Hi, are you free next Thursday?",
    createdAt: "2026-05-04T10:00:00Z",
    attachments: [],
  },
  {
    id: 2,
    senderUid: "t1",
    senderRole: "tradesman" as const,
    senderName: "Adam",
    body: "Thursday afternoon works for me.",
    createdAt: "2026-05-04T10:05:00Z",
    attachments: [],
  },
];

const chatData = {
  matchId: 11,
  projectId: 7,
  projectName: "Loft conversion",
  otherParty: {
    role: "tradesman",
    uid: "t1",
    name: "Adam Smith",
    firstName: "Adam",
    avatarUrl: null,
  },
  me: { role: "homeowner", uid: "u1" },
  messages: initialMessages,
};

const get = vi.fn(async () => ({ data: chatData }));
const post = vi.fn(async (_url: string, body: any) => ({
  data: {
    id: 3,
    senderUid: "u1",
    senderRole: "homeowner",
    senderName: "Chris",
    body: body?.body || "",
    createdAt: "2026-05-04T10:10:00Z",
    attachments: [],
  },
}));
const apiInstance = { get, post };
vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

vi.mock("@/utils/useSseEvent", () => ({ useSseEvent: () => {} }));

// Side modals - not relevant to this test, stub to noop.
vi.mock("@/components/PhotoLightbox", () => ({ default: () => null }));
vi.mock("@/components/project/TradesmanProfileModal", () => ({
  default: () => null,
}));

import ChatWindow from "@/components/messaging/ChatWindow";

describe("<ChatWindow />", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it("renders messages from /api/chat/:matchId/messages", async () => {
    render(<ChatWindow matchId={11} variant="inline" />);
    await waitFor(() => {
      expect(
        screen.getByText(/are you free next Thursday/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Thursday afternoon works for me/)).toBeInTheDocument();
    });
    // Header surfaces the project name + other party once data resolves.
    expect(screen.getByText("Adam Smith")).toBeInTheDocument();
    expect(screen.getByText("Loft conversion")).toBeInTheDocument();
  });

  it("typing + clicking Send POSTs the body and appends the new message", async () => {
    render(<ChatWindow matchId={11} variant="inline" />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Message Adam")).toBeInTheDocument(),
    );

    const input = screen.getByPlaceholderText("Message Adam") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Great, see you then." } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith("/api/chat/11/messages", {
        body: "Great, see you then.",
      });
    });
    // New message appended optimistically.
    await waitFor(() =>
      expect(screen.getByText("Great, see you then.")).toBeInTheDocument(),
    );
  });

  it("inline variant omits close + minimize chrome", async () => {
    render(<ChatWindow matchId={11} variant="inline" />);
    await waitFor(() =>
      expect(screen.getByText("Adam Smith")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /close chat/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /minimize/i })).toBeNull();
  });
});
