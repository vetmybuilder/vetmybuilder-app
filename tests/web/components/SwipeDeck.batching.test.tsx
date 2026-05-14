// tests/web/components/SwipeDeck.batching.test.tsx
//
// Covers the paged-deck behaviour: SwipeDeck reveals tradesman cards
// 10 at a time, plays the "Finding more tradespeople..." loader
// (driven by MatchShuffleAnimation) between batches, and falls
// through to the All Caught Up empty state once every card has been
// swiped. Drag-gesture and fling animation are owned by Playwright
// e2e tests - here we drive the deck through the Like action-bar
// button so the assertions stay fast + deterministic.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn(async () => ({ data: { matched: false } }));
vi.mock("@/utils/api", () => ({
  useApi: () => ({ post }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    isReady: true,
    pathname: "/projects/[id]",
    query: {},
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Stub the shuffle component so the test can fire its onSettled
// callback synchronously. The real component runs a ~9s decelerating
// animation which would either time out tests or force fake-timer
// gymnastics for every batch boundary.
vi.mock("@/components/project/MatchShuffleAnimation", () => ({
  default: ({
    active,
    onSettled,
  }: {
    active: boolean;
    onSettled?: () => void;
  }) =>
    active ? (
      <div data-testid="match-shuffle-stub">
        <button
          type="button"
          data-testid="match-shuffle-settle"
          onClick={() => onSettled?.()}
        >
          __settle
        </button>
      </div>
    ) : null,
}));

// The empty-state share modal is dead weight for batching assertions
// and pulls in extra deps - stub it to nothing.
vi.mock("@/components/project/ShareProjectModal", () => ({
  default: () => null,
}));

// BuilderCardBack runs an api.get on mount to load the trade's
// boosted-closure photos. Stub it to an opaque div - we never assert
// on back-of-card content in this file, and including companyName as
// visible text would clash with the front-face heading and break
// getByRole("heading") look-ups.
vi.mock("@/components/project/BuilderCardBack", () => ({
  default: ({ builder }: { builder: { uid: string } }) => (
    <div data-testid={`builder-card-back-${builder.uid}`} />
  ),
}));

import SwipeDeck, {
  type SwipeDeckBuilder,
} from "@/components/project/SwipeDeck";

function makeBuilders(n: number): SwipeDeckBuilder[] {
  return Array.from({ length: n }, (_, i) => ({
    uid: `tm-${i}`,
    displayName: `Trader ${i}`,
    companyName: `Trader ${i} Ltd`,
    photoUrl: `https://cdn/photo-${i}.jpg`,
    starRating: 4.5,
    reviewCount: 10,
    yearsTrading: 5,
    chVerified: true,
    whyMatch: null,
    tier: "subscribed",
    source: "subscribed",
  }));
}

async function clickLike() {
  // SwipeDeck mounts two SwipeActionBars (desktop + mobile, hidden
  // responsively). Both render their own "Like" button; we just need
  // the first one to fire `commit("right")`.
  const likes = await screen.findAllByRole("button", { name: "Like" });
  fireEvent.click(likes[0]);
}

async function swipeNCards(n: number, companyOfNextCard: string) {
  for (let i = 0; i < n; i++) {
    await clickLike();
  }
  // Wait for the deck to settle on the next expected top card. The
  // last swipe in a batch makes the top card disappear entirely (the
  // fetching loader replaces it), so the caller passes either the
  // next company name or the loader testid via assertions after.
  await waitFor(() =>
    expect(
      screen.queryByText(companyOfNextCard) ||
        screen.queryByTestId("match-shuffle-stub"),
    ).not.toBeNull(),
  );
}

describe("<SwipeDeck /> batching", () => {
  beforeEach(() => {
    post.mockClear();
  });

  it("reveals at most 10 cards in the first batch", async () => {
    render(
      <SwipeDeck projectId="1" builders={makeBuilders(25)} onMatch={vi.fn()} />,
    );
    // First card is the visible top of the stack.
    await waitFor(() =>
      expect(screen.getByText("Trader 0 Ltd")).toBeInTheDocument(),
    );
    // The 11th card is part of the next batch and should NOT be in
    // the DOM yet (the peek window is clamped to the current page).
    expect(screen.queryByText("Trader 10 Ltd")).not.toBeInTheDocument();
  });

  it("plays the Finding-more-tradespeople loader after swiping a full batch", async () => {
    render(
      <SwipeDeck projectId="1" builders={makeBuilders(25)} onMatch={vi.fn()} />,
    );
    await screen.findByText("Trader 0 Ltd");

    // Swipe through all 10 cards in batch one.
    for (let i = 0; i < 10; i++) {
      await clickLike();
    }

    // Loader appears in place of the deck stack.
    await waitFor(() =>
      expect(screen.getByTestId("match-shuffle-stub")).toBeInTheDocument(),
    );
    expect(screen.getByText(/finding more tradespeople/i)).toBeInTheDocument();
    expect(
      screen.getByText(/your next shortlist is on the way/i),
    ).toBeInTheDocument();

    // No deck card is currently rendered.
    expect(screen.queryByText("Trader 0 Ltd")).not.toBeInTheDocument();
    expect(screen.queryByText("Trader 10 Ltd")).not.toBeInTheDocument();
  });

  it("reveals the next batch when the loader settles", async () => {
    render(
      <SwipeDeck projectId="1" builders={makeBuilders(25)} onMatch={vi.fn()} />,
    );
    await screen.findByText("Trader 0 Ltd");

    for (let i = 0; i < 10; i++) {
      await clickLike();
    }
    await screen.findByTestId("match-shuffle-stub");

    // Fire the loader's onSettled and expect batch two's top card.
    fireEvent.click(screen.getByTestId("match-shuffle-settle"));
    await waitFor(() =>
      expect(screen.getByText("Trader 10 Ltd")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("match-shuffle-stub")).not.toBeInTheDocument();
  });

  it("falls through to All Caught Up after the final loader settles", async () => {
    // 5 cards: under a single page, so the user hits the loader once
    // and then lands on the exhausted empty state.
    render(
      <SwipeDeck projectId="1" builders={makeBuilders(5)} onMatch={vi.fn()} />,
    );
    await screen.findByText("Trader 0 Ltd");

    for (let i = 0; i < 5; i++) {
      await clickLike();
    }
    await screen.findByTestId("match-shuffle-stub");

    fireEvent.click(screen.getByTestId("match-shuffle-settle"));
    await waitFor(() =>
      expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("match-shuffle-stub")).not.toBeInTheDocument();
  });

  it("renders Searching-for-tradespeople immediately when the queue is empty", () => {
    render(<SwipeDeck projectId="1" builders={[]} onMatch={vi.fn()} />);
    // No loader, no batching - jumps straight to the no-supply copy.
    expect(screen.getByText(/searching for tradespeople/i)).toBeInTheDocument();
    expect(screen.queryByTestId("match-shuffle-stub")).not.toBeInTheDocument();
  });
});
