import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import React from "react";
import PasswordChecklist, {
  isStrongPassword,
  PASSWORD_RULES,
} from "../../../web/components/forms/PasswordChecklist";

const ALL_RULE_LABELS = [
  "At least 8 characters",
  "One uppercase letter (A–Z)",
  "One lowercase letter (a–z)",
  "One number (0–9)",
  "One special character (!@#…)",
];

/**
 * The visual state of a rule (pass vs not yet) is encoded in its text colour
 * — `text-emerald-600` when satisfied, `text-zinc-400` when not. The list
 * items don't have unique testids, so we walk the rendered DOM by label and
 * inspect the className of the closest <li>.
 */
function ruleListItem(label: string): HTMLElement {
  const node = screen.getByText(label);
  const li = node.closest("li");
  if (!li) throw new Error(`No <li> ancestor for rule "${label}"`);
  return li as HTMLElement;
}

function expectRulePass(label: string) {
  expect(ruleListItem(label).className).toContain("text-emerald-600");
}

function expectRuleFail(label: string) {
  expect(ruleListItem(label).className).toContain("text-zinc-400");
}

describe("<PasswordChecklist />", () => {
  it("does not render when password is empty (default)", () => {
    const { container } = render(<PasswordChecklist password="" />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("password-checklist")).toBeNull();
  });

  it("renders all 5 rules once the user starts typing", () => {
    render(<PasswordChecklist password="a" />);
    expect(screen.getByTestId("password-checklist")).toBeInTheDocument();
    for (const label of ALL_RULE_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders even when empty if alwaysShow is true", () => {
    render(<PasswordChecklist password="" alwaysShow />);
    expect(screen.getByTestId("password-checklist")).toBeInTheDocument();
    for (const label of ALL_RULE_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks all rules as failing when only a single lowercase char is typed", () => {
    render(<PasswordChecklist password="a" />);
    expectRuleFail("At least 8 characters");
    expectRuleFail("One uppercase letter (A–Z)");
    expectRulePass("One lowercase letter (a–z)");
    expectRuleFail("One number (0–9)");
    expectRuleFail("One special character (!@#…)");
  });

  it("marks all 5 rules as passing for a fully strong password", () => {
    render(<PasswordChecklist password="Passw0rd!" />);
    for (const label of ALL_RULE_LABELS) {
      expectRulePass(label);
    }
  });

  it("flips individual rules independently as the password grows", () => {
    const { rerender } = render(<PasswordChecklist password="abcdefgh" />);
    // 8+ chars and lowercase satisfied; missing upper, digit, symbol
    expectRulePass("At least 8 characters");
    expectRulePass("One lowercase letter (a–z)");
    expectRuleFail("One uppercase letter (A–Z)");
    expectRuleFail("One number (0–9)");
    expectRuleFail("One special character (!@#…)");

    rerender(<PasswordChecklist password="Abcdefgh" />);
    expectRulePass("One uppercase letter (A–Z)");
    expectRuleFail("One number (0–9)");

    rerender(<PasswordChecklist password="Abcdefg1" />);
    expectRulePass("One number (0–9)");
    expectRuleFail("One special character (!@#…)");

    rerender(<PasswordChecklist password="Abcdefg1!" />);
    expectRulePass("One special character (!@#…)");
  });

  it("forwards a custom className to the <ul>", () => {
    render(<PasswordChecklist password="x" className="custom-cls" />);
    expect(screen.getByTestId("password-checklist").className).toContain(
      "custom-cls",
    );
  });
});

describe("isStrongPassword()", () => {
  it("returns true for a password that satisfies every rule", () => {
    expect(isStrongPassword("Passw0rd!")).toBe(true);
    expect(isStrongPassword("Aa1!aaaa")).toBe(true);
  });

  it("returns false when below 8 characters", () => {
    expect(isStrongPassword("Aa1!")).toBe(false);
  });

  it("returns false when missing uppercase", () => {
    expect(isStrongPassword("passw0rd!")).toBe(false);
  });

  it("returns false when missing lowercase", () => {
    expect(isStrongPassword("PASSW0RD!")).toBe(false);
  });

  it("returns false when missing a digit", () => {
    expect(isStrongPassword("Password!")).toBe(false);
  });

  it("returns false when missing a symbol", () => {
    expect(isStrongPassword("Passw0rdX")).toBe(false);
  });

  it("returns false for the empty string", () => {
    expect(isStrongPassword("")).toBe(false);
  });
});

describe("PASSWORD_RULES export", () => {
  it("exposes exactly 5 rules in the documented order", () => {
    expect(PASSWORD_RULES).toHaveLength(5);
    expect(PASSWORD_RULES.map((r) => r.label)).toEqual(ALL_RULE_LABELS);
  });
});
