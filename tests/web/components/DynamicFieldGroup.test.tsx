import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";

import DynamicFieldGroup, {
  validateGroup,
} from "../../../web/components/forms/DynamicFieldGroup";
import { JOB_FIELDS } from "../../../web/config/jobFields";

const flooringGroup = JOB_FIELDS.find((s) => s.id === "flooring")!.groups[0];

function renderGroup(initial: Record<string, any> = {}, onChange = vi.fn()) {
  const Harness: React.FC = () => {
    const [value, setValue] = React.useState<Record<string, any>>({
      _version: 1,
      ...initial,
    });
    return (
      <DynamicFieldGroup
        group={flooringGroup}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  };
  return { ...render(<Harness />), onChange };
}

describe("<DynamicFieldGroup /> — flooring", () => {
  describe("rendering", () => {
    it("renders all non-conditional fields", () => {
      renderGroup();

      // "either" field — both branch labels + numeric input
      expect(screen.getByText("Total floor area")).toBeInTheDocument();
      expect(screen.getByText("Number of rooms")).toBeInTheDocument();
      expect(screen.getByTestId("field-flooring-size-value")).toBeInTheDocument();

      // floor_type chip buttons
      expect(screen.getByTestId("field-flooring-floor_type-carpet")).toBeInTheDocument();
      expect(screen.getByTestId("field-flooring-floor_type-laminate")).toBeInTheDocument();

      // removal_required chip button
      expect(
        screen.getByTestId("field-flooring-removal_required"),
      ).toBeInTheDocument();
    });

    it("hides subfloor_condition when removal_required is not true (showIf)", () => {
      renderGroup({ flooring: { removal_required: false } });
      expect(
        screen.queryByTestId("field-flooring-subfloor_condition-unknown"),
      ).not.toBeInTheDocument();
    });

    it("shows subfloor_condition when removal_required is true", () => {
      renderGroup({ flooring: { removal_required: true } });
      expect(
        screen.getByTestId("field-flooring-subfloor_condition-unknown"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("field-flooring-subfloor_condition-level"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("field-flooring-subfloor_condition-needs_levelling"),
      ).toBeInTheDocument();
    });

    it("pre-populates controls from the incoming value", () => {
      renderGroup({
        flooring: {
          size: { kind: "m2", value: 42 },
          floor_type: "laminate",
          removal_required: true,
          subfloor_condition: "needs_levelling",
        },
      });
      expect(screen.getByTestId("field-flooring-size-value")).toHaveValue(42);

      // Laminate chip should have the selected styling (amber border)
      const laminateChip = screen.getByTestId("field-flooring-floor_type-laminate");
      expect(laminateChip.className).toContain("border-amber");

      // Removal chip should have selected styling
      const removalChip = screen.getByTestId("field-flooring-removal_required");
      expect(removalChip.className).toContain("border-amber");

      // Subfloor needs_levelling chip should have selected styling
      const subfloorChip = screen.getByTestId("field-flooring-subfloor_condition-needs_levelling");
      expect(subfloorChip.className).toContain("border-amber");
    });
  });

  describe("onChange emission", () => {
    it("emits a new answers object when floor_type changes", () => {
      const { onChange } = renderGroup();

      fireEvent.click(screen.getByTestId("field-flooring-floor_type-carpet"));

      const last = onChange.mock.calls.at(-1)?.[0];
      expect(last.flooring.floor_type).toBe("carpet");
    });

    it("emits { kind, value } when the either field is toggled + filled", () => {
      const { onChange } = renderGroup();

      fireEvent.click(
        screen.getByTestId("field-flooring-size-kind-rooms-label"),
      );
      fireEvent.change(screen.getByTestId("field-flooring-size-value"), {
        target: { value: "3" },
      });

      const last = onChange.mock.calls.at(-1)?.[0];
      expect(last.flooring.size).toEqual({ kind: "rooms", value: 3 });
    });

    it("emits removal_required=true when the chip is clicked", () => {
      const { onChange } = renderGroup();

      fireEvent.click(screen.getByTestId("field-flooring-removal_required"));

      const last = onChange.mock.calls.at(-1)?.[0];
      expect(last.flooring.removal_required).toBe(true);
    });
  });

  describe("auto-purge on showIf transitions", () => {
    it("drops subfloor_condition when removal_required goes true -> false", async () => {
      const { onChange } = renderGroup({
        flooring: {
          size: { kind: "m2", value: 50 },
          floor_type: "lvt",
          removal_required: true,
          subfloor_condition: "needs_levelling",
        },
      });

      // Initial render should have the field visible
      expect(
        screen.getByTestId("field-flooring-subfloor_condition-needs_levelling"),
      ).toBeInTheDocument();

      // Click removal chip to toggle it off
      fireEvent.click(screen.getByTestId("field-flooring-removal_required"));

      await Promise.resolve();

      const last = onChange.mock.calls.at(-1)?.[0];
      expect(last.flooring.removal_required).toBe(false);
      expect(last.flooring.subfloor_condition).toBeUndefined();

      expect(
        screen.queryByTestId("field-flooring-subfloor_condition-needs_levelling"),
      ).not.toBeInTheDocument();
    });
  });

  describe("client validator (validateGroup)", () => {
    it("reports the required `size` missing", () => {
      const errors = validateGroup(flooringGroup, {
        _version: 1,
        flooring: { floor_type: "carpet" },
      });
      expect(errors["flooring.size"]).toBeTruthy();
    });

    it("accepts a minimal valid answers object", () => {
      const errors = validateGroup(flooringGroup, {
        _version: 1,
        flooring: {
          size: { kind: "m2", value: 10 },
          floor_type: "carpet",
        },
      });
      expect(errors).toEqual({});
    });

    it("reports required `floor_type` missing", () => {
      const errors = validateGroup(flooringGroup, {
        _version: 1,
        flooring: { size: { kind: "m2", value: 10 } },
      });
      expect(errors["flooring.floor_type"]).toBe("Required");
    });

    it("skips validation for fields hidden by showIf", () => {
      const errors = validateGroup(flooringGroup, {
        _version: 1,
        flooring: {
          size: { kind: "m2", value: 10 },
          floor_type: "carpet",
          removal_required: false,
        },
      });
      expect(errors["flooring.subfloor_condition"]).toBeUndefined();
    });
  });
});
