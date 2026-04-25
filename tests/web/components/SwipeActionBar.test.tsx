import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SwipeActionBar from "@/components/project/SwipeActionBar";

describe("SwipeActionBar", () => {
  it("fires onPass, onInfo, onLike when buttons clicked", () => {
    const onPass = vi.fn();
    const onInfo = vi.fn();
    const onLike = vi.fn();
    render(<SwipeActionBar onPass={onPass} onInfo={onInfo} onLike={onLike} />);

    fireEvent.click(screen.getByRole("button", { name: /pass/i }));
    fireEvent.click(screen.getByRole("button", { name: /info/i }));
    fireEvent.click(screen.getByRole("button", { name: /like/i }));

    expect(onPass).toHaveBeenCalledOnce();
    expect(onInfo).toHaveBeenCalledOnce();
    expect(onLike).toHaveBeenCalledOnce();
  });
});
