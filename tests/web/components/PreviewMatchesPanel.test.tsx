// tests/web/components/PreviewMatchesPanel.test.tsx
//
// Render tests for the post-job wizard's preview-matches step. Covers
// each branch the panel can be in - loading, error, empty, healthy
// supply, padded supply (with "Nearby" badges) - and asserts the
// auth-aware locked CTA copy changes as expected.
//
// Catches regressions like:
//   - cards stop rendering when matches arrive (silent breakage)
//   - the "Nearby" badge stops showing on padded matches
//   - the locked CTA text drifts away from the auth gating
//   - the eyebrow counter mis-counts local vs nearby

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PreviewMatchesPanel from "@/components/project/PreviewMatchesPanel";
import type { PreviewMatch } from "@/pages/projects/new";

function makeMatch(overrides: Partial<PreviewMatch> = {}): PreviewMatch {
  return {
    id: "abc",
    company: "Elegant Building Services",
    trade: "Builder · Bathroom",
    location: "E4",
    rating: 4.8,
    reviewCount: 12,
    friendCount: 0,
    photoUrl: "https://cdn/elegant.jpg",
    blurb: "Tidy team, finished a week early.",
    isLocal: true,
    ...overrides,
  };
}

describe("<PreviewMatchesPanel />", () => {
  it("renders skeleton cards while loading", () => {
    render(
      <PreviewMatchesPanel matches={null} loading={true} err={null} isGuest />,
    );
    // The eyebrow tells the user we're searching - no real cards yet
    expect(
      screen.getByText(/finding your local matches/i),
    ).toBeInTheDocument();
    // No actual match cards rendered
    expect(screen.queryByTestId(/^preview-match-/)).not.toBeInTheDocument();
  });

  it("renders the friendly empty state when no matches were found", () => {
    render(
      <PreviewMatchesPanel matches={[]} loading={false} err={null} isGuest />,
    );
    expect(screen.getByText(/no matches in your area yet/i)).toBeInTheDocument();
    // Auth-aware copy: guest is told to sign up
    expect(screen.getByText(/sign up and we'll keep looking/i)).toBeInTheDocument();
  });

  it("renders the empty-state copy differently for an authed user", () => {
    render(
      <PreviewMatchesPanel
        matches={[]}
        loading={false}
        err={null}
        isGuest={false}
      />,
    );
    // No "sign up" framing - the user already has an account
    expect(screen.getByText(/post your job anyway/i)).toBeInTheDocument();
  });

  it("renders the error state when the API call failed", () => {
    render(
      <PreviewMatchesPanel
        matches={null}
        loading={false}
        err="boom"
        isGuest
      />,
    );
    expect(
      screen.getByText(/couldn't load your matches just now/i),
    ).toBeInTheDocument();
  });

  it("renders match cards with company, trade, location, rating and blurb", () => {
    const match = makeMatch({ id: "elegant-1" });
    render(
      <PreviewMatchesPanel
        matches={[match]}
        loading={false}
        err={null}
        isGuest
      />,
    );
    const card = screen.getByTestId("preview-match-elegant-1");
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent(match.company);
    expect(card).toHaveTextContent(match.trade!);
    expect(card).toHaveTextContent(match.location!);
    expect(card).toHaveTextContent("4.8");
    expect(card).toHaveTextContent("(12)");
    expect(card).toHaveTextContent(match.blurb!);
  });

  it("shows 'Sign up to message' on the locked CTA when the homeowner is a guest", () => {
    render(
      <PreviewMatchesPanel
        matches={[makeMatch({ id: "g1" })]}
        loading={false}
        err={null}
        isGuest={true}
      />,
    );
    expect(
      screen.getByRole("button", { name: /sign up to message/i }),
    ).toBeInTheDocument();
  });

  it("shows 'Post job to message' on the locked CTA when the homeowner is authed", () => {
    render(
      <PreviewMatchesPanel
        matches={[makeMatch({ id: "g2" })]}
        loading={false}
        err={null}
        isGuest={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: /post job to message/i }),
    ).toBeInTheDocument();
  });

  it("flags non-local matches with a 'Nearby' badge", () => {
    render(
      <PreviewMatchesPanel
        matches={[
          makeMatch({ id: "local-1", isLocal: true }),
          makeMatch({ id: "nearby-1", isLocal: false }),
        ]}
        loading={false}
        err={null}
        isGuest
      />,
    );
    const local = screen.getByTestId("preview-match-local-1");
    const nearby = screen.getByTestId("preview-match-nearby-1");
    expect(local).not.toHaveTextContent("Nearby");
    expect(nearby).toHaveTextContent("Nearby");
  });

  it("counts local + nearby separately in the eyebrow when supply is padded", () => {
    render(
      <PreviewMatchesPanel
        matches={[
          makeMatch({ id: "a", isLocal: true }),
          makeMatch({ id: "b", isLocal: false }),
          makeMatch({ id: "c", isLocal: false }),
        ]}
        loading={false}
        err={null}
        isGuest
      />,
    );
    expect(screen.getByText(/1 local · 2 nearby/i)).toBeInTheDocument();
  });

  it("shows initials when no photo is provided", () => {
    render(
      <PreviewMatchesPanel
        matches={[
          makeMatch({
            id: "no-photo",
            company: "Nice Tile Company",
            photoUrl: null,
          }),
        ]}
        loading={false}
        err={null}
        isGuest
      />,
    );
    const card = screen.getByTestId("preview-match-no-photo");
    expect(card).toHaveTextContent("NT");
  });
});
