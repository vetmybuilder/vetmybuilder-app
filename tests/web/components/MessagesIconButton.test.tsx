// tests/web/components/MessagesIconButton.test.tsx
//
// Covers the shared messages icon shell that backs both the homeowner
// and trade headers. Specifically guards:
//   - the toggle (parent's onToggle fires on click)
//   - dropdown render-prop wiring (only mounted when isOpen)
//   - unread badge presence + 99+ clamp
//   - tone palette switching (indigo vs emerald badge background)
//   - popDockOnOpen window-event dispatch behaviour
//   - testId pass-through (so SiteHeader-level a11y locators stay valid)
//
// The outside-click-to-close behaviour lives in SiteHeader (the shared
// component just exposes a button + menu ref) and is intentionally not
// tested here.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import MessagesIconButton from "@/components/header/MessagesIconButton";

function setup(overrides: Partial<React.ComponentProps<typeof MessagesIconButton>> = {}) {
  const buttonRef = { current: null } as React.MutableRefObject<HTMLButtonElement | null>;
  const menuRef = { current: null } as React.MutableRefObject<HTMLDivElement | null>;
  const onToggle = vi.fn();
  const renderDropdown = vi.fn(() => (
    <div data-testid="dropdown-body">dropdown</div>
  ));
  render(
    <MessagesIconButton
      buttonRef={buttonRef}
      menuRef={menuRef}
      isOpen={false}
      onToggle={onToggle}
      unread={0}
      tone="indigo"
      testId="nav-messages"
      renderDropdown={renderDropdown}
      {...overrides}
    />,
  );
  return { onToggle, renderDropdown };
}

describe("<MessagesIconButton />", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the trigger button with the supplied testId", () => {
    setup({ testId: "nav-trades-messages" });
    expect(screen.getByTestId("nav-trades-messages")).toBeInTheDocument();
  });

  it("does not render the dropdown body when isOpen is false", () => {
    const { renderDropdown } = setup({ isOpen: false });
    expect(screen.queryByTestId("dropdown-body")).not.toBeInTheDocument();
    expect(renderDropdown).not.toHaveBeenCalled();
  });

  it("renders the dropdown body when isOpen is true", () => {
    const { renderDropdown } = setup({ isOpen: true });
    expect(screen.getByTestId("dropdown-body")).toBeInTheDocument();
    expect(renderDropdown).toHaveBeenCalled();
  });

  it("calls onToggle when the trigger is clicked", () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByTestId("nav-messages"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle on each subsequent click (toggle behaviour stays parent-driven)", () => {
    const { onToggle } = setup();
    const btn = screen.getByTestId("nav-messages");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(3);
  });

  it("hides the unread badge when unread is 0", () => {
    setup({ unread: 0 });
    expect(screen.queryByText(/^\d/)).not.toBeInTheDocument();
  });

  it("renders the unread count when unread > 0", () => {
    setup({ unread: 7 });
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("clamps very large unread counts to 99+", () => {
    setup({ unread: 250 });
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("uses the indigo badge palette for the homeowner tone", () => {
    setup({ unread: 1, tone: "indigo" });
    const badge = screen.getByText("1");
    expect(badge.className).toMatch(/bg-indigo-600/);
  });

  it("uses the emerald badge palette for the trade tone", () => {
    setup({ unread: 1, tone: "emerald" });
    const badge = screen.getByText("1");
    expect(badge.className).toMatch(/bg-emerald-600/);
  });

  it("dispatches vmb:openDock when popDockOnOpen is true and the trigger is clicked", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    setup({ popDockOnOpen: true });
    fireEvent.click(screen.getByTestId("nav-messages"));
    const openDockCalls = dispatch.mock.calls.filter(
      ([ev]) => ev instanceof CustomEvent && ev.type === "vmb:openDock",
    );
    expect(openDockCalls.length).toBe(1);
  });

  it("does NOT dispatch vmb:openDock when popDockOnOpen is omitted (trade default)", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    setup();
    fireEvent.click(screen.getByTestId("nav-messages"));
    const openDockCalls = dispatch.mock.calls.filter(
      ([ev]) => ev instanceof CustomEvent && ev.type === "vmb:openDock",
    );
    expect(openDockCalls.length).toBe(0);
  });

  it("attaches the supplied buttonRef to the trigger", () => {
    const buttonRef = { current: null } as React.MutableRefObject<HTMLButtonElement | null>;
    const menuRef = { current: null } as React.MutableRefObject<HTMLDivElement | null>;
    render(
      <MessagesIconButton
        buttonRef={buttonRef}
        menuRef={menuRef}
        isOpen={false}
        onToggle={() => {}}
        unread={0}
        tone="indigo"
        testId="nav-messages"
        renderDropdown={() => null}
      />,
    );
    expect(buttonRef.current).toBe(screen.getByTestId("nav-messages"));
  });

  it("attaches the supplied menuRef to the open dropdown wrapper", () => {
    const buttonRef = { current: null } as React.MutableRefObject<HTMLButtonElement | null>;
    const menuRef = { current: null } as React.MutableRefObject<HTMLDivElement | null>;
    render(
      <MessagesIconButton
        buttonRef={buttonRef}
        menuRef={menuRef}
        isOpen
        onToggle={() => {}}
        unread={0}
        tone="indigo"
        testId="nav-messages"
        renderDropdown={() => <span data-testid="dropdown-body">x</span>}
      />,
    );
    // The wrapper around the dropdown is the menuRef target. It should
    // contain the dropdown body element.
    expect(menuRef.current).not.toBeNull();
    expect(menuRef.current?.contains(screen.getByTestId("dropdown-body"))).toBe(true);
  });
});
