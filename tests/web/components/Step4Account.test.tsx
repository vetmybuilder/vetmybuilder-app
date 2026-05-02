import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import Step4Account from "../../../web/components/vendor-register/Step4Account";

const defaults = {
  email: "test@example.com",
  password: "",
  confirmPassword: "",
  setPassword: vi.fn(),
  setConfirmPassword: vi.fn(),
  onBack: vi.fn(),
  onCreate: vi.fn(),
};

describe("<Step4Account /> terms checkbox", () => {
  it("renders the terms checkbox unchecked by default", () => {
    render(<Step4Account {...defaults} />);
    const checkbox = screen.getByTestId("agree-terms").querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);
  });

  // The "disable/enable Create button on terms checkbox" tests were
  // removed when the wizard rebuild moved the submit button into a
  // hidden form element and shifted the agreedTerms gate to the
  // WizardNavBar (lives in the parent shell, not in Step4Account). The
  // checkbox-state and terms links are still covered below.

  it("links to Terms of Use and Acceptable Use Policy", () => {
    render(<Step4Account {...defaults} />);
    const links = screen.getByTestId("agree-terms").querySelectorAll("a");
    const hrefs = Array.from(links).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/acceptable-use");
  });
});
