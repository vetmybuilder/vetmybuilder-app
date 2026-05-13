// tests/web/components/BuilderCardBack.test.tsx
//
// Pins the CR3 surfaces on the back of the swipe-deck card.
//
// Each test awaits `waitFor` after render so the profile-fetch
// useEffect resolves inside React's act() before the test exits.
// Without that flush, the late setProfile() shows up as a noisy
// "update outside act" warning and is suspected of leaking jsdom
// state between tests, which is what tipped CI's vitest worker into
// a heap OOM after a long full-suite run.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";

const useRecentCompletedMock = vi.fn();
vi.mock("@/hooks/useRecentCompleted", () => ({
  useRecentCompleted: (uid: string | null | undefined) =>
    useRecentCompletedMock(uid),
}));

const get = vi.fn();
vi.mock("@/utils/api", () => ({
  useApi: () => ({ get }),
}));

// PhotoLightbox is fully real otherwise (portal + body scroll lock,
// etc.) - stub it down to a presence marker so we can assert the band
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
    useRecentCompletedMock.mockReset();
    get.mockReset();
    get.mockResolvedValue({ data: { item: null } });
  });

  it("renders the emerald band when a boosted closure has photos", async () => {
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
    // Wait for the profile-fetch useEffect to settle inside act() so
    // the late setProfile doesn't leak past the test boundary.
    await waitFor(() => expect(get).toHaveBeenCalled());

    const band = screen.getByTestId("card-recent-completed-band");
    expect(band).toBeInTheDocument();
    expect(band).toHaveTextContent(/Recently completed in E4/i);
  });

  it("opens the lightbox with the closure photos when the band is tapped", async () => {
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
    await waitFor(() => expect(get).toHaveBeenCalled());

    expect(screen.queryByTestId("lightbox-open")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("card-recent-completed-band"));
    const lightbox = screen.getByTestId("lightbox-open");
    expect(lightbox).toBeInTheDocument();
    expect(lightbox).toHaveTextContent("/uploads/p1.jpg");
    expect(lightbox).toHaveTextContent("/uploads/p2.jpg");
  });

  it("hides the band when there are no boosted closures", async () => {
    useRecentCompletedMock.mockReturnValue({
      loading: false,
      topTradesperson: false,
      items: [],
    });

    render(<BuilderCardBack builder={builder} />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByTestId("card-recent-completed-band"),
    ).not.toBeInTheDocument();
  });

  it("renders the band but as a non-interactive div when a boosted closure has no photos", async () => {
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
    await waitFor(() => expect(get).toHaveBeenCalled());

    const band = screen.getByTestId("card-recent-completed-band");
    expect(band).toBeInTheDocument();
    expect(band).toHaveTextContent(/Recently completed in E4/i);
    expect(band.tagName).toBe("DIV");
    expect(band).not.toHaveTextContent(/Tap to see/i);
    fireEvent.click(band);
    expect(screen.queryByTestId("lightbox-open")).not.toBeInTheDocument();
  });

  it("does not render a standalone Verified pill (front of card owns it)", async () => {
    useRecentCompletedMock.mockReturnValue({
      loading: false,
      topTradesperson: false,
      items: [],
    });
    render(<BuilderCardBack builder={builder} />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByText(/^Verified$/)).not.toBeInTheDocument();
  });
});
