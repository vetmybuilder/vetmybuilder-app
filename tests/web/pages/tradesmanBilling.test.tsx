import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BillingPage from "@/pages/tradesman/billing";

const get = vi.fn(async () => ({ data: { subscription: null } }));
const post = vi.fn(async () => ({ data: { url: "https://stripe.test/checkout" } }));
vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post }) }));
vi.mock("@/utils/auth", () => ({ useAuth: () => ({ user: { uid: "b1" } }) }));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    isReady: true,
    pathname: "/tradesman/billing",
    asPath: "/tradesman/billing",
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("BillingPage", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "", pathname: "/tradesman/billing", search: "", assign: vi.fn() },
    });
  });

  it("defaults to Month tier with Best value pill", async () => {
    render(<BillingPage />);
    await waitFor(() => expect(screen.getByText(/Best value/i)).toBeInTheDocument());
    expect(screen.getAllByText(/£9\.99/).length).toBeGreaterThan(0);
  });

  it("switches tier and posts checkout on Continue", async () => {
    render(<BillingPage />);
    await waitFor(() => screen.getByText(/Best value/i));
    fireEvent.click(screen.getByRole("button", { name: /^Week$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/api/subscriptions/checkout", { tier: "week_1" }));
  });
});
