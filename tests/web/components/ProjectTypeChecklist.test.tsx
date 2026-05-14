// tests/web/components/ProjectTypeChecklist.test.tsx
//
// Covers the homeowner /projects left-sidebar filter: categories render
// flat (no sub-types), checking a category selects every leaf type
// under it, and the search box narrows the visible list by category
// name only (so "insulation" doesn't surface Roofing just because it
// has a leaf called "Loft & Roof Insulation").
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ProjectTypeChecklist from "@/components/filters/ProjectTypeChecklist";
import { PROJECT_TYPES } from "@/types/projectTypes";

function setup(initial: string[] = []) {
  const onChangeTypes = vi.fn();
  // Controlled wrapper so toggling updates the rendered checked state.
  function Harness() {
    const [v, setV] = (require("react") as typeof import("react")).useState(initial);
    return (
      <ProjectTypeChecklist
        selectedTypes={v}
        onChangeTypes={(next) => {
          onChangeTypes(next);
          setV(next);
        }}
      />
    );
  }
  render(<Harness />);
  return { onChangeTypes };
}

describe("ProjectTypeChecklist", () => {
  it("renders every PROJECT_TYPES category as a toggleable pill", () => {
    setup();
    for (const cat of PROJECT_TYPES) {
      expect(
        screen.getByTestId(`projects-filter-category-${cat.category}`),
      ).toBeInTheDocument();
    }
  });

  it("does not render leaf type checkboxes (categories only)", () => {
    setup();
    // Pick a known leaf type from the taxonomy. "External Wall Insulation"
    // lives under the Insulation category and shouldn't have its own row.
    const leaf = "External Wall Insulation";
    // Sanity: the leaf actually exists in the taxonomy.
    const hasLeaf = PROJECT_TYPES.some((c) => c.types.includes(leaf));
    expect(hasLeaf).toBe(true);
    expect(screen.queryByText(leaf)).not.toBeInTheDocument();
  });

  it("checking a category selects the category name and every leaf under it", () => {
    const { onChangeTypes } = setup();
    const insulation = PROJECT_TYPES.find((c) => c.category === "Insulation");
    expect(insulation, "Insulation category exists").toBeTruthy();
    if (!insulation) return;

    const cb = screen.getByTestId("projects-filter-category-Insulation");
    fireEvent.click(cb);

    expect(onChangeTypes).toHaveBeenCalledTimes(1);
    const passed = onChangeTypes.mock.calls[0][0] as string[];
    // Includes the category name itself so legacy rows whose `type`
    // column holds the category string still match the filter, plus
    // every leaf type for rows that store a leaf.
    expect(new Set(passed)).toEqual(
      new Set([insulation.category, ...insulation.types]),
    );
  });

  it("unchecking a category removes only that category's leaves + name", () => {
    const insulation = PROJECT_TYPES.find((c) => c.category === "Insulation")!;
    const kitchen = PROJECT_TYPES.find((c) => c.category === "Kitchen")!;
    // Pre-seed both categories fully checked.
    const { onChangeTypes } = setup([
      insulation.category,
      ...insulation.types,
      kitchen.category,
      ...kitchen.types,
    ]);

    const cb = screen.getByTestId("projects-filter-category-Insulation");
    // Selected pills carry aria-pressed="true" instead of the old
    // checkbox's `.checked` boolean.
    expect(cb.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(cb);

    const passed = onChangeTypes.mock.calls[0][0] as string[];
    expect(new Set(passed)).toEqual(
      new Set([kitchen.category, ...kitchen.types]),
    );
  });

  it("search filters categories by name only", () => {
    setup();
    const input = screen.getByTestId(
      "projects-filter-search",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "insulation" } });

    // Insulation visible.
    expect(
      screen.getByTestId("projects-filter-category-Insulation"),
    ).toBeInTheDocument();

    // A leaf-only match must NOT bring its parent category in. Pick a
    // category that has the word "insulation" in a leaf but not in its
    // own name, if one exists.
    const leafOnlyMatch = PROJECT_TYPES.find(
      (c) =>
        !c.category.toLowerCase().includes("insulation") &&
        c.types.some((t) => t.toLowerCase().includes("insulation")),
    );
    if (leafOnlyMatch) {
      expect(
        screen.queryByTestId(
          `projects-filter-category-${leafOnlyMatch.category}`,
        ),
      ).not.toBeInTheDocument();
    }
  });

  it("shows a friendly empty state when the search matches nothing", () => {
    setup();
    const input = screen.getByTestId("projects-filter-search");
    fireEvent.change(input, { target: { value: "zzznosuchtype" } });
    expect(screen.getByText(/No types match/i)).toBeInTheDocument();
  });

  it("renders the reset button only when something is selected", () => {
    const { onChangeTypes } = setup();
    expect(screen.queryByTestId("projects-filter-reset")).not.toBeInTheDocument();

    // Toggle a category, then the reset should appear.
    fireEvent.click(screen.getByTestId("projects-filter-category-Insulation"));
    const reset = screen.getByTestId("projects-filter-reset");
    fireEvent.click(reset);
    // The last call clears the selection.
    const last = onChangeTypes.mock.calls.at(-1)![0];
    expect(last).toEqual([]);
  });
});
