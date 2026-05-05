import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BuilderInfoModal from "@/components/project/BuilderInfoModal";

const builder = {
  uid: "b1", displayName: "James H.", companyName: "Harrow", photoUrl: null,
  starRating: 4.8, reviewCount: 27, yearsTrading: 12, chVerified: true,
  trades: ["Building", "Extensions"], whyMatch: "Covers E4",
  tier: "recommended" as const, recommenderName: "Alex",
  bio: "Family-run builder in E4 since 2012.",
  serviceAreas: ["E4", "E17"],
  recentPhotos: [],
  reviews: [{ reviewerName: "Alex", stars: 5, quote: "Fantastic job." }],
  recommenders: ["Alex"],
};

describe("BuilderInfoModal", () => {
  it("renders sections and fires Like/Pass via footer CTAs", () => {
    const onLike = vi.fn();
    const onPass = vi.fn();
    render(<BuilderInfoModal builder={builder} onClose={() => {}} onLike={onLike} onPass={onPass} />);
    expect(screen.getByText("James H.")).toBeInTheDocument();
    expect(screen.getByText(/Family-run/)).toBeInTheDocument();
    expect(screen.getAllByText(/E4/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^like$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^pass$/i }));
    expect(onLike).toHaveBeenCalledOnce();
    expect(onPass).toHaveBeenCalledOnce();
  });
});
