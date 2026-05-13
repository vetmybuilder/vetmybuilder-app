// tests/web/components/BuilderCardBack.test.tsx
//
// Pins the CR3 surfaces on the back of the swipe-deck card:
//   - emerald "Recently completed in {area}" band only when the
//     useRecentCompleted hook reports at least one boosted closure
//     with photos
//   - tapping the band opens PhotoLightbox with that closure's photos
//   - the standalone Verified pill (which used to live here) is gone
//     — it's already on the front of the card now
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const useRecentCompletedMock = vi.fn();
vi.mock("@/hooks/useRecentCompleted", () => ({
  useRecentCompleted: (uid: string | null | undefined) =>
    useRecentCompletedMock(uid),
}));

// Stub the /api/tradesmen/:uid fetch the back fires on mount.
const get = vi.fn();
vi.mock("@/utils/api", () => ({
  useApi: () => ({ get }),
}));

// PhotoLightbox is fully real otherwise (portal + body scroll lock,
// etc.) — stub it down to a presence marker so we can assert the band
// opens it without dealing with portal rendering.
vi.mock("@/components/PhotoLightbox", () => ({
  default: ({ open, photos }: { open: boolean; photos: string[] }) =>
    open ? (
      <div data-testid="lightbox-open">
        {photos.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>
    ) : null,
}));

import BuilderCardBack from "@/components/project/BuilderCardBack";

const builder = {
  uid: "b-1",
  displayName: "James H.",
  companyName: "Harrow Building Ltd",
  photoUrl: null,
  starRating: 4.8,
  reviewCount: 27,
  yearsTrading: 12,
  chVerified: true,
  whyMatch: null,
  tier: "ai-matched" as const,
  primaryTrade: "Bathroom",
  secondaryTrades: [],
  serviceAreas: ["E4"],
};

describe("BuilderCardBack — CR3 surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty profile fetch so the test isn't fighting the
    // real /api/tradesmen/:uid endpoint.
    get.mockResolvedValue({ data: { item: null } });
  });

  it("renders the emerald band when a boosted closure has photos", () => {
    useRecentCompletedMock.mockReturnValue({
      loading: false,
      topTradesperson: true,
      items: [
        {
          projectType: "Bathroom",
          area: "E4",
          closedAt: "2026-05-01T00:00:00.000Z",
          photos: ["/uploads/p1.jpg", "/uploads/p2.jpg"],
        },
      ],
    });

    render(<BuilderCardBack builder={builder} />);
    const band = screen.getByTestId("card-recent-completed-band");
    expect(band).toBeInTheDocument();
    expect(band).toHaveTextContent(/Recently completed in E4/i);
  });

  it("opens the lightbox with the closure photos when the band is tapped", () => {
    useRecentCompletedMock.mockReturnValue({
      loading: false,
      topTradesperson: true,
      items: [
        {
          projectType: "Bathroom",
          area: "E4",
          closedAt: null,
          photos: ["/uploads/p1.jpg", "/uploads/p2.jpg"],
        },
      ],
    });

    render(<BuilderCardBack builder={builder} />);
    expect(screen.queryByTestId("lightbox-open")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("card-recent-completed-band"));
    const lightbox = screen.getByTestId("lightbox-open");
    expect(lightbox).toBeInTheDocument();
    expect(lightbox).toHaveTextContent("/uploads/p1.jpg");
    expect(lightbox).toHaveTextContent("/uploads/p2.jpg");
  });

  it("hides the band when there are no boosted closures", () => {
    useRecentCompletedMock.mockReturnValue({
      loading: false,
      topTradesperson: false,
      items: [],
    });

    render(<BuilderCardBack builder={builder} />);
    expect(
      screen.queryByTestId("card-recent-completed-band"),
    ).not.toBeInTheDocument();
  });

  it("renders the band but as a non-interactive div when a boosted closure has no photos", () => {
    // boost_consent was ticked but the homeowner didn't upload any
    // photos, so the photos array on the response is empty. We still
    // want the band visible (the boost is its own social signal) but
    // tapping it must not open a lightbox - there's nothing to show.
    useRecentCompletedMock.mockReturnValue({
      loading: false,
      topTradesperson: true,
      items: [
        {
          projectType: "Bathroom",
          area: "E4",
          closedAt: null,
          photos: [],
        },
      ],
    });

    render(<BuilderCardBack builder={builder} />);
    const band = screen.getByTestId("card-recent-completed-band");
    expect(band).toBeInTheDocument();
    expect(band).toHaveTextContent(/Recently completed in E4/i);
    // Non-interactive: rendered as a <div>, not a <button>, and
    // "Tap to see the work" subtitle is suppressed.
    expect(band.tagName).toBe("DIV");
    expect(band).not.toHaveTextContent(/Tap to see/i);
    // Tapping doesn't open the lightbox.
    fireEvent.click(band);
    expect(screen.queryByTestId("lightbox-open")).not.toBeInTheDocument();
  });

  it("does not render a standalone Verified pill (front of card owns it)", () => {
    useRecentCompletedMock.mockReturnValue({
      loading: false,
      topTradesperson: false,
      items: [],
    });
    render(<BuilderCardBack builder={builder} />);
    // The back used to show a "Verified" pill row. Now it doesn't -
    // the chip lives on the front of the card alongside reviews/yrs.
    expect(screen.queryByText(/^Verified$/)).not.toBeInTheDocument();
  });
});
