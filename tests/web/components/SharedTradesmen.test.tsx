// tests/web/components/SharedTradesmen.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// ---- Mocks ----

const api = { get: vi.fn() };
vi.mock("@/utils/api", () => ({
  useApi: () => api,
}));

const pushMock = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/SwipeCarousel", () => ({
  default: ({ items }: { items: React.ReactNode[] }) => (
    <div data-testid="swipe-carousel">{items}</div>
  ),
}));

import SharedTradesmen from "../../../web/components/project/SharedTradesmen";

function makeShare(overrides: Partial<{
  id: number;
  tradesmanUid: string;
  companyName: string;
  primaryPhotoUrl: string | null;
  photos: { url?: string; absoluteUrl?: string }[];
}> = {}) {
  return {
    id: overrides.id ?? 1,
    projectId: 10,
    projectName: "Kitchen Reno",
    tradesmanUid: overrides.tradesmanUid ?? "uid-001",
    companyName: overrides.companyName ?? "Budget Build Co",
    primaryPhotoUrl: overrides.primaryPhotoUrl ?? null,
    photos: overrides.photos ?? [],
    message: "",
    createdAt: new Date().toISOString(),
  };
}

function renderStrip(shares: ReturnType<typeof makeShare>[] = []) {
  api.get.mockResolvedValue({ data: { shares, total: shares.length } });
  return render(<SharedTradesmen projectId={10} />);
}

describe("<SharedTradesmen />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when there are no shares", async () => {
    const { container } = renderStrip([]);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });

  it("shows initials badge when tradesman has no profile photo", async () => {
    renderStrip([makeShare({ companyName: "Budget Build Co", primaryPhotoUrl: null })]);

    const initials = await screen.findByTestId("shared-tradesman-avatar-initials");
    expect(initials).toBeInTheDocument();
    expect(initials.textContent).toBe("BB");
    expect(screen.queryByTestId("shared-tradesman-avatar-photo")).not.toBeInTheDocument();
  });

  it("shows profile photo img when primaryPhotoUrl is set", async () => {
    const photoUrl = "https://cdn.example.com/avatar.jpg";
    renderStrip([makeShare({ primaryPhotoUrl: photoUrl })]);

    const photo = await screen.findByTestId("shared-tradesman-avatar-photo");
    expect(photo).toBeInTheDocument();
    expect(photo).toHaveAttribute("src", photoUrl);
    expect(screen.queryByTestId("shared-tradesman-avatar-initials")).not.toBeInTheDocument();
  });

  it("shows photo from photos array when primaryPhotoUrl is null but photos exist", async () => {
    const photoUrl = "/uploads/work-photo.jpg";
    renderStrip([
      makeShare({
        primaryPhotoUrl: null,
        photos: [{ url: photoUrl, absoluteUrl: `https://cdn.example.com${photoUrl}` }],
      }),
    ]);

    const photo = await screen.findByTestId("shared-tradesman-avatar-photo");
    expect(photo).toBeInTheDocument();
  });

  it("shows company name in the card", async () => {
    renderStrip([makeShare({ companyName: "Apex Builders Ltd" })]);

    await screen.findByTestId("shared-tradesman-card");
    expect(screen.getByText("Apex Builders Ltd")).toBeInTheDocument();
  });

  it("clicking a card navigates to the tradesman profile", async () => {
    renderStrip([makeShare({ tradesmanUid: "tm-abc-123" })]);

    const card = await screen.findByTestId("shared-tradesman-card");
    fireEvent.click(card);

    expect(pushMock).toHaveBeenCalledWith("/tradesman/tm-abc-123");
  });
});
