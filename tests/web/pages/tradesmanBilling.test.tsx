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
    // Tier button labels were renamed Week / Fortnight / Month -> 7-day
    // / 14-day / 30-day in the billing page redesign. The underlying
    // TierIds are unchanged (week_1 = 7-day).
    fireEvent.click(screen.getByRole("button", { name: /^7-day$/ }));
    // The "Continue" CTA was redesigned to show the selected tier
    // inline ("Get 7-day pass - £3.99"). Same onClick handler.
    fireEvent.click(screen.getByRole("button", { name: /Get 7-day pass/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/api/subscriptions/checkout", { tier: "week_1" }));
  });
});
