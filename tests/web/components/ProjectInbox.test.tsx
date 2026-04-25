import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProjectInbox from "@/components/project/ProjectInbox";

const post = vi.fn(async () => ({ data: { status: "ok" } }));
vi.mock("@/utils/api", () => ({ useApi: () => ({ post, get: vi.fn() }) }));

const pitches = [
  { messageId: "i1", builderFirstName: "James", companyName: "Harrow", yearsTrading: 12,
    outward: "E4", body: "Hi — I'm James, I run a small team…", hoursAgo: 2,
    status: "new" as const },
  { messageId: "i2", builderFirstName: "Peter", companyName: "Ramsay", yearsTrading: 8,
    outward: "E4", body: "Saw your job…", hoursAgo: 24, status: "new" as const },
];

describe("ProjectInbox", () => {
  beforeEach(() => post.mockClear());

  it("renders pitch cards with preview and action buttons", () => {
    render(<ProjectInbox projectId="p1" pitches={pitches} />);
    expect(screen.getByText("James")).toBeInTheDocument();
    expect(screen.getByText(/I'm James/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Accept & reply/ })).toHaveLength(2);
  });

  it("dismisses a pitch", async () => {
    render(<ProjectInbox projectId="p1" pitches={pitches} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Dismiss/ })[0]);
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/api/projects/p1/inbox/i1/dismiss", {}));
  });

  it("accepts & replies", async () => {
    render(<ProjectInbox projectId="p1" pitches={pitches} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Accept & reply/ })[0]);
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/api/projects/p1/inbox/i1/reply", {}));
  });
});
