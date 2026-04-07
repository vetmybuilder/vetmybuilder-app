// tests/web/components/SpotlightStrip.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

// ---- Mocks ----
const api = {
  get: vi.fn(),
};
vi.mock("@/utils/api", () => ({
  useApi: () => api,
}));

import SpotlightStrip from "../../../web/components/tradesmen/SpotlightStrip";

function aSpotlightItem(overrides: any = {}) {
  return {
    builderId: "tm-abc-xyz",
    publicId: "elegant-public-id",
    companyName: "Elegant Building Services",
    displayName: "Elegant Building Services",
    tierActiveUntil: null,
    avatarUrl: null,
    gallery: [],
    ...overrides,
  };
}

describe("<SpotlightStrip />", () => {
  // jsdom's window.location is read-only by default — make it writable for the
  // duration of these tests so we can assert on the assignment the click does.
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = { href: "" } as Location;
  });

  afterEach(() => {
    (window as any).location = originalLocation;
  });

  it("clicking the tile navigates to the tradesman profile WITH the project context", async () => {
    api.get.mockResolvedValue({
      data: { items: [aSpotlightItem()] },
    });

    render(<SpotlightStrip projectId="42" />);

    const tile = await screen.findByRole("button", {
      name: /View Elegant Building Services/i,
    });
    fireEvent.click(tile);

    expect(window.location.href).toBe(
      "/tradesman/elegant-public-id?projectId=42",
    );
  });

  it("falls back to builderId in the URL when there is no publicId", async () => {
    api.get.mockResolvedValue({
      data: {
        items: [aSpotlightItem({ publicId: null })],
      },
    });

    render(<SpotlightStrip projectId="42" />);

    const tile = await screen.findByRole("button", {
      name: /View Elegant Building Services/i,
    });
    fireEvent.click(tile);

    expect(window.location.href).toBe(
      "/tradesman/tm-abc-xyz?projectId=42",
    );
  });

  it("calls onClickCard instead of navigating when the prop is provided", async () => {
    api.get.mockResolvedValue({
      data: { items: [aSpotlightItem()] },
    });
    const onClickCard = vi.fn();

    render(<SpotlightStrip projectId="42" onClickCard={onClickCard} />);

    const tile = await screen.findByRole("button", {
      name: /View Elegant Building Services/i,
    });
    fireEvent.click(tile);

    expect(onClickCard).toHaveBeenCalledWith("tm-abc-xyz");
    expect(window.location.href).toBe("");
  });

  it("shows the empty state when there are no spotlight items", async () => {
    api.get.mockResolvedValue({ data: { items: [] } });

    render(<SpotlightStrip projectId="42" />);

    expect(
      await screen.findByText(/No spotlight tradesmen are available/i),
    ).toBeInTheDocument();
  });
});
