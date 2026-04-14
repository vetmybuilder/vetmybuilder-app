import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";

import DynamicFieldGroup, {
  validateGroup,
} from "../../../web/components/forms/DynamicFieldGroup";
import { JOB_FIELDS } from "../../../web/config/jobFields";

// The flooring spec is the only one defined today and is the subject of the
// feature being tested. Pulling it from JOB_FIELDS rather than re-declaring
// keeps the test coupled to the real config so config drift can't silently
// invalidate assertions.
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

      expect(screen.getByTestId("field-flooring-floor_type")).toBeInTheDocument();
      expect(
        screen.getByTestId("field-flooring-removal_required"),
      ).toBeInTheDocument();
    });

    it("hides subfloor_condition when removal_required is not true (showIf)", () => {
      renderGroup({ flooring: { removal_required: false } });
      expect(
        screen.queryByTestId("field-flooring-subfloor_condition"),
      ).not.toBeInTheDocument();
    });

    it("shows subfloor_condition when removal_required is true", () => {
      renderGroup({ flooring: { removal_required: true } });
      expect(
        screen.getByTestId("field-flooring-subfloor_condition"),
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
      expect(screen.getByTestId("field-flooring-floor_type")).toHaveValue(
        "laminate",
      );
      expect(
        screen.getByTestId("field-flooring-removal_required"),
      ).toBeChecked();
      expect(
        screen.getByTestId("field-flooring-subfloor_condition"),
      ).toHaveValue("needs_levelling");
    });
  });

  describe("onChange emission", () => {
    it("emits a new answers object when floor_type changes", () => {
      const { onChange } = renderGroup();

      fireEvent.change(screen.getByTestId("field-flooring-floor_type"), {
        target: { value: "carpet" },
      });

      // Last call is the most recent state after our change
      const last = onChange.mock.calls.at(-1)?.[0];
      expect(last.flooring.floor_type).toBe("carpet");
    });

    it("emits { kind, value } when the either field is toggled + filled", () => {
      const { onChange } = renderGroup();

      // Switch to rooms branch via the label
      fireEvent.click(
        screen.getByTestId("field-flooring-size-kind-rooms-label"),
      );
      fireEvent.change(screen.getByTestId("field-flooring-size-value"), {
        target: { value: "3" },
      });

      const last = onChange.mock.calls.at(-1)?.[0];
      expect(last.flooring.size).toEqual({ kind: "rooms", value: 3 });
    });

    it("emits removal_required=true when the checkbox is ticked", () => {
      const { onChange } = renderGroup();

      fireEvent.click(screen.getByTestId("field-flooring-removal_required"));

      const last = onChange.mock.calls.at(-1)?.[0];
      expect(last.flooring.removal_required).toBe(true);
    });
  });

  describe("auto-purge on showIf transitions", () => {
    it("drops subfloor_condition when removal_required goes true → false", async () => {
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
        screen.getByTestId("field-flooring-subfloor_condition"),
      ).toBeInTheDocument();

      // Uncheck removal
      fireEvent.click(screen.getByTestId("field-flooring-removal_required"));

      // The purge effect runs in a useEffect, so wait a microtask for the
      // follow-up onChange call.
      await Promise.resolve();

      // The most recent onChange call must no longer contain subfloor_condition
      const last = onChange.mock.calls.at(-1)?.[0];
      expect(last.flooring.removal_required).toBe(false);
      expect(last.flooring.subfloor_condition).toBeUndefined();

      // And the field is hidden in the DOM
      expect(
        screen.queryByTestId("field-flooring-subfloor_condition"),
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
      // subfloor_condition is required-less and also hidden here — either way,
      // validator should not report an error for it.
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
