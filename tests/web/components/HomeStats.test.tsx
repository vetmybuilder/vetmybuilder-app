// tests/web/components/HomeStats.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

import HomeStats, {
  MIN_COMMUNITY_MEMBERS_TO_SHOW_STATS,
} from "../../../web/components/home/HomeStats";

function mockStatsResponse(body: {
  communityMembers: number;
  recommendations?: number;
  shortlists?: number;
}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      communityMembers: body.communityMembers,
      recommendations: body.recommendations ?? 0,
      shortlists: body.shortlists ?? 0,
    }),
  } as unknown as Response);
}

beforeEach(() => {
  // CountUp uses IntersectionObserver — jsdom doesn't ship one. Stub to a
  // no-op so the component mounts without crashing.
  (globalThis as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomeStats", () => {
  it(`renders nothing when communityMembers is below the threshold (${MIN_COMMUNITY_MEMBERS_TO_SHOW_STATS})`, async () => {
    const fetchMock = mockStatsResponse({
      communityMembers: MIN_COMMUNITY_MEMBERS_TO_SHOW_STATS - 1,
      recommendations: 12,
      shortlists: 7,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<HomeStats />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/stats",
        expect.objectContaining({ cache: "no-store" }),
      );
    });

    expect(screen.queryByTestId("home-stats")).toBeNull();
    expect(container.querySelector("section")).toBeNull();
  });

  it(`renders the stats section when communityMembers meets the threshold (${MIN_COMMUNITY_MEMBERS_TO_SHOW_STATS})`, async () => {
    vi.stubGlobal(
      "fetch",
      mockStatsResponse({
        communityMembers: MIN_COMMUNITY_MEMBERS_TO_SHOW_STATS,
        recommendations: 25,
        shortlists: 18,
      }),
    );

    render(<HomeStats />);

    const section = await screen.findByTestId("home-stats");
    expect(section).toBeTruthy();
    expect(section.textContent).toContain("Members");
    expect(section.textContent).toContain("Recommendations");
    expect(section.textContent).toContain("Shortlists");
  });

  it("hides the section when the stats fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as unknown as Response),
    );

    render(<HomeStats />);

    await waitFor(() => {
      expect(screen.queryByTestId("home-stats")).toBeNull();
    });
  });
});
