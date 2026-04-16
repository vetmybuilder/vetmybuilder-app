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

  it("disables the Create account button when checkbox is unchecked", () => {
    render(<Step4Account {...defaults} />);
    const button = screen.getByTestId("btn-create-account");
    expect(button).toBeDisabled();
  });

  it("enables the Create account button when checkbox is checked", () => {
    render(<Step4Account {...defaults} />);
    const checkbox = screen.getByTestId("agree-terms").querySelector("input[type='checkbox']") as HTMLInputElement;
    fireEvent.click(checkbox);
    const button = screen.getByTestId("btn-create-account");
    expect(button).toBeEnabled();
  });

  it("links to Terms of Use and Acceptable Use Policy", () => {
    render(<Step4Account {...defaults} />);
    const links = screen.getByTestId("agree-terms").querySelectorAll("a");
    const hrefs = Array.from(links).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/acceptable-use");
  });
});
