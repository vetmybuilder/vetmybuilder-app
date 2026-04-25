import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Compose from "@/pages/projects/[id]/unlock/compose";

const get = vi.fn(async () => ({
  data: { project: { id: "p1", title: "Kitchen extension",
    budget: "£15k–£25k", outward: "E4", homeownerFirstName: "Sarah" } },
}));
const post = vi.fn(async () => ({ data: { status: "sent" } }));
vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post }) }));
vi.mock("@/utils/auth", () => ({ useAuth: () => ({ user: { uid: "b1" } }) }));
vi.mock("next/router", () => ({
  useRouter: () => ({ query: { id: "p1" }, isReady: true, push: vi.fn(),
    pathname: "/projects/[id]/unlock/compose", asPath: "/projects/p1/unlock/compose" }),
}));

describe("Compose page", () => {
  beforeEach(() => { post.mockClear(); });

  it("inserts template when chip tapped and the chip then becomes inert", async () => {
    render(<Compose />);
    await waitFor(() => screen.getByText(/Kitchen extension/));
    const chip = screen.getByRole("button", { name: /Introduce myself/ });
    fireEvent.click(chip);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(ta.value).toMatch(/Hi \{firstName\}/);
    // second click must NOT append again (chip inert after first tap)
    fireEvent.click(chip);
    const count = (ta.value.match(/Hi \{firstName\}/g) || []).length;
    expect(count).toBe(1);
  });

  it("sends message to API on Send", async () => {
    render(<Compose />);
    await waitFor(() => screen.getByText(/Kitchen extension/));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hi Sarah" } });
    fireEvent.click(screen.getByRole("button", { name: /Send to Sarah/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/api/projects/p1/inbox-message", { body: "Hi Sarah" }));
  });
});
