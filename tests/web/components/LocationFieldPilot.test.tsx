import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import LocationField from "@/components/forms/LocationField";

/**
 * pilotOnly=true validates picks against the enabled borough set using
 * postcodes.io's `admin_district` field (returned on /postcodes/<pc> and
 * /outcodes/<outward> lookups). The static outward map is gone - source
 * of truth is postcodes.io.
 */

function buildFetchMock({
  pilotBoroughs,
  postcodeAutocomplete = [],
  postcodeMeta = null,
  outwardDistricts = {},
  boroughSearch = [],
}: {
  pilotBoroughs: string[];
  postcodeAutocomplete?: string[];
  postcodeMeta?: any;
  outwardDistricts?: Record<string, string[]>;
  boroughSearch?: Array<{ name: string; outwardCodes: string[] }>;
}) {
  return vi.fn(async (url: RequestInfo) => {
    const u = String(url);
    if (u.endsWith("/api/pilot/areas")) {
      return new Response(
        JSON.stringify({
          boroughs: pilotBoroughs.map((name) => ({ name })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.includes("/api/boroughs/search")) {
      return new Response(JSON.stringify(boroughSearch), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (/postcodes\.io\/postcodes\/.+\/autocomplete/.test(u)) {
      return new Response(JSON.stringify({ result: postcodeAutocomplete }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const outcodeMatch = u.match(/postcodes\.io\/outcodes\/([^/?]+)$/);
    if (outcodeMatch) {
      const o = decodeURIComponent(outcodeMatch[1]).toUpperCase();
      const districts = outwardDistricts[o] || [];
      return new Response(
        JSON.stringify({ result: { outcode: o, admin_district: districts } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (/postcodes\.io\/postcodes\/[^/?]+$/.test(u) && postcodeMeta) {
      return new Response(JSON.stringify({ result: postcodeMeta }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("LocationField - pilotOnly mode (admin_district based)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides postcode autocomplete results whose outward resolves outside the enabled boroughs", async () => {
    const fetchMock = buildFetchMock({
      pilotBoroughs: ["Waltham Forest"],
      postcodeAutocomplete: ["SW10 0AA", "SW10 0AB", "SW10 0AC"],
      outwardDistricts: { SW10: ["Kensington and Chelsea"] },
    });
    global.fetch = fetchMock as any;

    render(<LocationField value="" onChange={() => {}} pilotOnly />);
    // Wait for initial /api/pilot/areas resolution.
    await waitFor(() => {
      const called = fetchMock.mock.calls.some(([u]: any[]) =>
        String(u).endsWith("/api/pilot/areas"),
      );
      expect(called).toBe(true);
    });
    await new Promise((r) => setTimeout(r, 50));

    const input = screen.getByPlaceholderText(/Postcode or place/i);
    fireEvent.change(input, { target: { value: "SW10" } });

    await waitFor(() => {
      // Filter pulled all results - block message appears.
      expect(screen.getByTestId("pilot-block-sheet")).toBeInTheDocument();
    });
    expect(screen.queryByText(/SW10 0AA/)).not.toBeInTheDocument();
  });

  it("rejects a typed-in unsupported postcode using meta.admin_district from postcodes.io", async () => {
    const onChange = vi.fn();
    const fetchMock = buildFetchMock({
      pilotBoroughs: ["Waltham Forest"],
      postcodeMeta: {
        postcode: "SW10 0AA",
        outcode: "SW10",
        incode: "0AA",
        admin_district: "Kensington and Chelsea",
        latitude: 51.5,
        longitude: -0.1,
      },
    });
    global.fetch = fetchMock as any;

    render(<LocationField value="" onChange={onChange} pilotOnly />);
    await waitFor(() => {
      const called = fetchMock.mock.calls.some(([u]: any[]) =>
        String(u).endsWith("/api/pilot/areas"),
      );
      expect(called).toBe(true);
    });
    await new Promise((r) => setTimeout(r, 50));

    const input = screen.getByPlaceholderText(/Postcode or place/i);
    fireEvent.change(input, { target: { value: "SW10 0AA" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByTestId("pilot-block-sheet")).toHaveTextContent(
        /Waltham Forest/,
      );
    });

    // No commit with meta should have happened.
    const committedWithMeta = onChange.mock.calls.find(
      ([, meta]) => meta && meta.outward,
    );
    expect(committedWithMeta).toBeFalsy();
  });

  it("allows selection when meta.admin_district matches an enabled borough", async () => {
    const onChange = vi.fn();
    const fetchMock = buildFetchMock({
      pilotBoroughs: ["Waltham Forest"],
      postcodeMeta: {
        postcode: "E4 7ER",
        outcode: "E4",
        incode: "7ER",
        admin_district: "Waltham Forest",
        latitude: 51.6,
        longitude: 0.0,
      },
    });
    global.fetch = fetchMock as any;

    render(<LocationField value="" onChange={onChange} pilotOnly />);
    await waitFor(() => {
      const called = fetchMock.mock.calls.some(([u]: any[]) =>
        String(u).endsWith("/api/pilot/areas"),
      );
      expect(called).toBe(true);
    });
    await new Promise((r) => setTimeout(r, 50));

    const input = screen.getByPlaceholderText(/Postcode or place/i);
    fireEvent.change(input, { target: { value: "E4 7ER" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      const committedWithMeta = onChange.mock.calls.find(
        ([, meta]) => meta && meta.outward === "E4",
      );
      expect(committedWithMeta).toBeTruthy();
    });
    expect(screen.queryByTestId("pilot-block-sheet")).not.toBeInTheDocument();
  });

  it("filters borough search results to enabled boroughs only", async () => {
    const fetchMock = buildFetchMock({
      pilotBoroughs: ["Waltham Forest"],
      boroughSearch: [
        { name: "Waltham Forest", outwardCodes: ["E4"] },
        { name: "Hackney", outwardCodes: ["E5"] },
      ],
    });
    global.fetch = fetchMock as any;

    render(<LocationField value="" onChange={() => {}} pilotOnly />);
    // Wait for /api/pilot/areas to populate the enabled set so the borough
    // effect's filter has something to match against.
    await waitFor(() => {
      const called = fetchMock.mock.calls.some(([u]: any[]) =>
        String(u).endsWith("/api/pilot/areas"),
      );
      expect(called).toBe(true);
    });
    await new Promise((r) => setTimeout(r, 100));

    // "waltham" - longer than "ham" so it can't double as a postcode
    // fragment, which means only the borough effect fires.
    const input = screen.getByPlaceholderText(/Postcode or place/i);
    fireEvent.change(input, { target: { value: "waltham" } });

    await waitFor(() => {
      expect(screen.getByTestId("borough-option-Waltham Forest")).toBeInTheDocument();
    });
    // Hackney was in the borough endpoint response but not in the enabled
    // set, so it must NOT render.
    expect(screen.queryByTestId("borough-option-Hackney")).not.toBeInTheDocument();
  });

  it("does not filter when pilotOnly is false (default behaviour preserved)", async () => {
    global.fetch = buildFetchMock({
      pilotBoroughs: [],
      postcodeAutocomplete: ["SW10 0AA", "SW10 0AB"],
    }) as any;

    render(<LocationField value="" onChange={() => {}} />);
    const input = screen.getByPlaceholderText(/Postcode or place/i);
    fireEvent.change(input, { target: { value: "SW10" } });

    await waitFor(() => {
      expect(screen.getByText("SW10 0AA")).toBeInTheDocument();
    });
  });
});
