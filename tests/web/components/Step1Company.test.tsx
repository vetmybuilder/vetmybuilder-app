import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Step1Company, {
  type Step1Form,
} from "@/components/vendor-register/Step1Company";

function makeForm(overrides: Partial<Step1Form> = {}): Step1Form {
  return {
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    serviceAreas: [],
    website: "",
    socials: {
      instagram: "",
      tiktok: "",
      facebook: "",
      x: "",
      youtube: "",
      linkedin: "",
    },
    reviewLinks: {
      trustpilot: "",
      bark: "",
      mybuilder: "",
      checkatrade: "",
      houzz: "",
      yell: "",
    },
    ...overrides,
  };
}

function renderStep1(
  overrides: Partial<Step1Form> = {},
  errors: Record<string, string | null> = {},
) {
  const set = vi.fn();
  const onNext = vi.fn((e: any) => e.preventDefault());
  render(
    <Step1Company
      form={makeForm(overrides)}
      set={set}
      addServiceAreaOutward={() => {}}
      addServiceAreaBorough={() => {}}
      removeServiceAreaAt={() => {}}
      areaQuery=""
      setAreaQuery={() => {}}
      websiteInput=""
      setWebsiteInput={() => {}}
      commitWebsite={() => {}}
      onWebsiteKey={() => {}}
      clearWebsite={() => {}}
      canProceed={true}
      onNext={onNext}
      userIsAuthed={false}
      nextQuery=""
      errors={errors}
    />,
  );
  return { set, onNext };
}

describe("Step1Company — inline errors", () => {
  it("renders per-field error messages when errors prop is populated", () => {
    renderStep1({}, {
      companyName: "Company name is required",
      phone: "Enter a valid UK phone number (e.g. 07123 456789)",
    });
    expect(screen.getByText("Company name is required")).toBeInTheDocument();
    expect(
      screen.getByText(/Enter a valid UK phone number/i),
    ).toBeInTheDocument();
  });

  it("applies red border classes to errored inputs", () => {
    renderStep1({}, { companyName: "Company name is required" });
    const input = screen.getByTestId("input-company-name");
    expect(input.className).toMatch(/border-red-400/);
  });

  it("sets aria-invalid on errored inputs", () => {
    renderStep1({}, { phone: "invalid" });
    expect(screen.getByTestId("input-phone")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
