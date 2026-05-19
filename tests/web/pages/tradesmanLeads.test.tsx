import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const baseLead = {
  matchId: "m1",
  projectId: "p1",
  title: "Kitchen extension with bifolds",
  budget: "£15k–£25k",
  outward: "E4",
  startWindow: "1 month",
  homeownerFirstName: "Sarah",
  description: "4m rear extension…",
  trades: ["Building", "Electrics"],
  source: "recommended" as const,
  recommenderName: "Alex",
  pickedHoursAgo: 2,
};

let leadsResponse: { leads: any[]; subscriptionActive: boolean } = {
  leads: [baseLead],
  subscriptionActive: true,
};

const get = vi.fn(async () => ({ data: leadsResponse }));
const post = vi.fn(async () => ({ data: { status: "matched" } }));

vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post }) }));
// useAuth must return STABLE references across renders. The leads page's
// fetch effect depends on [authLoading, user]; if every render returns
// a fresh object, the cleanup keeps cancelling the in-flight fetch and
// loading never flips to false. vi.hoisted runs before vi.mock so the
// factory can close over a single instance.
const { stableAuth } = vi.hoisted(() => ({
  stableAuth: {
    user: { uid: "b1" },
    loading: false,
    profileComplete: true,
    ensureSignedIn: () => {},
  },
}));
vi.mock("@/utils/auth", () => ({
  useAuth: () => stableAuth,
}));
// /tradesman/leads is wrapped in <TradesmanOnly> which gates on
// useRole() returning "tradesman". Mock the hook to skip the gate.
vi.mock("@/utils/useRole", () => ({
  useRole: () => ({ role: "tradesman", loading: false }),
}));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    isReady: true,
    pathname: "/tradesman/leads",
    asPath: "/tradesman/leads",
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Stub the global header chrome - it has its own /api/tradesmen/me
// fetch + SSE connection that aren't relevant to lead-row behaviour
// and would otherwise hang the test in jsdom.
vi.mock("@/components/SiteHeader", () => ({
  default: () => null,
}));

// The lead-acceptance flow that used to live at /tradesman/matches now
// lives at /tradesman/leads. /tradesman/matches is for *formed* matches
// only; /tradesman/leads holds the still-to-decide swipe deck. The
// underlying lead shape and POST contract are unchanged.
import TradesmanLeads from "@/pages/tradesman/leads";

describe("Tradesman leads page", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
    leadsResponse = { leads: [baseLead], subscriptionActive: true };
  });

  // Targets the desktop lead row (`desktop-lead-accept-<matchId>`).
  // Note: homeownerFirstName ("Sarah") is intentionally NOT surfaced
  // by the new IncomingLeadCard - the card leads with project title +
  // recommender attribution instead.
  it("renders a lead card and commits accept on desktop", async () => {
    render(<TradesmanLeads />);
    await waitFor(() =>
      expect(screen.getAllByText(/Kitchen extension/).length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText(/Recommended by Alex/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("desktop-lead-accept-m1"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/swipe-interest/m1/respond", {
        direction: "right",
      }),
    );
  });

  it("commits pass on desktop", async () => {
    render(<TradesmanLeads />);
    await waitFor(() =>
      expect(screen.getAllByText(/Kitchen extension/).length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByTestId("desktop-lead-pass-m1"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/swipe-interest/m1/respond", {
        direction: "left",
      }),
    );
  });

  it("commits reply on mobile", async () => {
    render(<TradesmanLeads />);
    await waitFor(() =>
      expect(screen.getAllByText(/Kitchen extension/).length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByTestId("mobile-lead-accept"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/swipe-interest/m1/respond", {
        direction: "right",
      }),
    );
  });

  it("commits pass on mobile", async () => {
    render(<TradesmanLeads />);
    await waitFor(() =>
      expect(screen.getAllByText(/Kitchen extension/).length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByTestId("mobile-lead-pass"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/swipe-interest/m1/respond", {
        direction: "left",
      }),
    );
  });

  // Subscribed-tier lead + builder is NOT subscribed. Reply must open
  // the SwipePayGate modal and NOT POST /respond - the gate finishes
  // the flow once payment succeeds.
  it("opens the paygate when a gated lead is replied to", async () => {
    leadsResponse = {
      leads: [{ ...baseLead, source: "subscribed", recommenderName: null }],
      subscriptionActive: false,
    };

    render(<TradesmanLeads />);
    await waitFor(() =>
      expect(screen.getAllByText(/Kitchen extension/).length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByTestId("mobile-lead-accept"));
    await waitFor(() =>
      expect(screen.getByTestId("swipe-paygate")).toBeInTheDocument(),
    );
    expect(post).not.toHaveBeenCalled();
  });

  // Regression: when a match forms on the trade side (right-swipe →
  // server returns status='matched'), pop the bottom-right
  // TradesmanMessagingDock via the vmb:openDock + vmb:openChat events
  // instead of full-page navigating to /chat/<matchId>. The homeowner
  // side already uses the dock; both sides should land in the same
  // chat surface.
  it("dispatches vmb:openDock + vmb:openChat when a lead is matched on mobile", async () => {
    leadsResponse = {
      leads: [baseLead],
      subscriptionActive: true,
    };
    post.mockResolvedValueOnce({ data: { status: "matched" } });

    const events: Array<{ type: string; detail: any }> = [];
    const onDock = (e: any) => events.push({ type: e.type, detail: e.detail });
    const onChat = (e: any) => events.push({ type: e.type, detail: e.detail });
    window.addEventListener("vmb:openDock", onDock);
    window.addEventListener("vmb:openChat", onChat);

    try {
      render(<TradesmanLeads />);
      await waitFor(() =>
        expect(screen.getAllByText(/Kitchen extension/).length).toBeGreaterThan(0),
      );

      fireEvent.click(screen.getByTestId("mobile-lead-accept"));
      await waitFor(() => expect(post).toHaveBeenCalled());

      expect(events.some((e) => e.type === "vmb:openDock")).toBe(true);
      expect(events.some((e) => e.type === "vmb:openChat")).toBe(true);
    } finally {
      window.removeEventListener("vmb:openDock", onDock);
      window.removeEventListener("vmb:openChat", onChat);
    }
  });

  // Regression: declining a subscribed-tier lead must NOT open the
  // paygate. Charging a trade to say "no thanks" is bad UX and risks
  // them silently ignoring leads instead of explicitly declining,
  // which leaves the homeowner waiting. Only right-swipe (accept) is
  // gated behind subscription.
  it("does NOT open the paygate when a gated lead is passed on (mobile)", async () => {
    leadsResponse = {
      leads: [{ ...baseLead, source: "subscribed", recommenderName: null }],
      subscriptionActive: false,
    };

    render(<TradesmanLeads />);
    await waitFor(() =>
      expect(screen.getAllByText(/Kitchen extension/).length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByTestId("mobile-lead-pass"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/swipe-interest/m1/respond", {
        direction: "left",
      }),
    );
    // Paygate must NOT render on a decline.
    expect(screen.queryByTestId("swipe-paygate")).not.toBeInTheDocument();
  });

  it("does NOT open the paygate when a gated lead is passed on (desktop)", async () => {
    leadsResponse = {
      leads: [{ ...baseLead, source: "subscribed", recommenderName: null }],
      subscriptionActive: false,
    };

    render(<TradesmanLeads />);
    await waitFor(() =>
      expect(screen.getAllByText(/Kitchen extension/).length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByTestId("desktop-lead-pass-m1"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/swipe-interest/m1/respond", {
        direction: "left",
      }),
    );
    expect(screen.queryByTestId("swipe-paygate")).not.toBeInTheDocument();
  });
});
