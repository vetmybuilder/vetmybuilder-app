import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SupportingDocsField, {
  type SupportingDoc,
} from "@/components/vendor-register/SupportingDocsField";

/**
 * Light controlled-component harness so tests can read the current docs
 * array via a side-effect spy without re-implementing state mgmt in
 * every test.
 */
function Harness({
  initial = [],
  onChange,
}: {
  initial?: SupportingDoc[];
  onChange?: (d: SupportingDoc[]) => void;
}) {
  const [docs, setDocs] = useState<SupportingDoc[]>(initial);
  return (
    <SupportingDocsField
      docs={docs}
      onChange={(next) => {
        setDocs(next);
        onChange?.(next);
      }}
    />
  );
}

describe("SupportingDocsField", () => {
  it("renders the dashed Add tile when there are no docs", () => {
    render(<Harness />);
    expect(screen.getByTestId("doc-add")).toBeInTheDocument();
    expect(screen.getByText(/Add a document/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Insurance, certifications or memberships/i),
    ).toBeInTheDocument();
  });

  it('adds a new row defaulting to type="public_liability" when Add is clicked', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByTestId("doc-add"));

    expect(onChange).toHaveBeenCalledWith([
      { type: "public_liability", label: "" },
    ]);
    expect(screen.getByTestId("doc-row-0")).toBeInTheDocument();
  });

  it("updates a row's type via the popover dropdown and shows the customType input only for Other", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByTestId("doc-add"));
    expect(screen.queryByTestId("doc-custom-type-0")).not.toBeInTheDocument();

    // Custom Select: click the button to open, then click the option.
    fireEvent.click(screen.getByTestId("doc-type-0-button"));
    fireEvent.click(screen.getByTestId("doc-type-0-option-other"));

    expect(screen.getByTestId("doc-custom-type-0")).toBeInTheDocument();
    const lastCall = onChange.mock.calls.at(-1)![0];
    expect(lastCall[0].type).toBe("other");
  });

  it("removes a row when the × button is clicked", () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={[
          { type: "public_liability", label: "Hiscox £2m" },
          { type: "industry_membership", label: "Gas Safe" },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId("doc-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("doc-row-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("doc-remove-0"));

    // First row gone, second row promoted to index 0.
    expect(screen.queryByTestId("doc-row-1")).not.toBeInTheDocument();
    const remaining = onChange.mock.calls.at(-1)![0];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].label).toBe("Gas Safe");
  });

  it("updates the label and bubbles it to onChange", () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={[{ type: "trade_certification", label: "" }]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("doc-label-0"), {
      target: { value: "City & Guilds L3" },
    });

    const last = onChange.mock.calls.at(-1)![0][0];
    expect(last.label).toBe("City & Guilds L3");
  });

  it("renders the upload-proof prompt when no file is attached", () => {
    render(
      <Harness initial={[{ type: "public_liability", label: "Hiscox" }]} />,
    );
    expect(screen.getByTestId("doc-upload-0")).toBeInTheDocument();
  });

  it("renders the Replace control when a fileUrl is already set", () => {
    render(
      <Harness
        initial={[
          {
            type: "public_liability",
            label: "Hiscox",
            fileUrl: "/uploads/tradesmen-docs/abc.pdf",
            fileName: "abc.pdf",
          },
        ]}
      />,
    );
    expect(screen.getByTestId("doc-replace-0")).toBeInTheDocument();
    expect(screen.queryByTestId("doc-upload-0")).not.toBeInTheDocument();
    expect(screen.getByText("abc.pdf")).toBeInTheDocument();
  });
});
