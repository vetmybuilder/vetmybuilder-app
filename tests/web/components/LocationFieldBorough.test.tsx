import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import LocationField from "@/components/forms/LocationField";

describe("LocationField — borough results", () => {
  let fetchMock: any;
  beforeEach(() => {
    fetchMock = vi.fn((url: RequestInfo) => {
      const u = String(url);
      if (u.includes("/api/boroughs/search")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { name: "Waltham Forest", outwardCodes: ["E4", "E10", "E11", "E17"] },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ status: 200, result: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    global.fetch = fetchMock;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a borough match with the Borough badge at the top of the dropdown", async () => {
    const onChange = vi.fn();
    render(
      <LocationField
        value=""
        onChange={onChange}
        placeholder="Type a postcode or place"
      />,
    );
    const input = screen.getByPlaceholderText(/Type a postcode or place/i);
    fireEvent.change(input, { target: { value: "waltham" } });

    await waitFor(() => {
      expect(screen.getByText(/Waltham Forest/)).toBeInTheDocument();
    });
    expect(screen.getByText(/^Borough$/i)).toBeInTheDocument();
    expect(screen.getByText(/4 postcodes covered/i)).toBeInTheDocument();
  });

  it("fires onChange with meta.borough when a borough row is clicked", async () => {
    const onChange = vi.fn();
    render(
      <LocationField
        value=""
        onChange={onChange}
        placeholder="Type a postcode or place"
      />,
    );
    const input = screen.getByPlaceholderText(/Type a postcode or place/i);
    fireEvent.change(input, { target: { value: "waltham" } });

    const row = await screen.findByTestId("borough-option-Waltham Forest");
    fireEvent.click(row);

    const boroughCall = onChange.mock.calls.find(
      ([, meta]) => meta && meta.borough,
    );
    expect(boroughCall).toBeTruthy();
    expect(boroughCall![1].borough).toEqual({
      name: "Waltham Forest",
      outwardCodes: ["E4", "E10", "E11", "E17"],
    });
  });

  it("does not call the borough endpoint when the query looks like an outward code", async () => {
    render(
      <LocationField
        value=""
        onChange={() => {}}
        placeholder="Type a postcode or place"
      />,
    );
    const input = screen.getByPlaceholderText(/Type a postcode or place/i);
    fireEvent.change(input, { target: { value: "E4" } });
    await new Promise((r) => setTimeout(r, 300)); // exceed LocationField's debounce
    const calledBoroughs = fetchMock.mock.calls.some(([u]: any[]) =>
      String(u).includes("/api/boroughs/search"),
    );
    expect(calledBoroughs).toBe(false);
  });
});
