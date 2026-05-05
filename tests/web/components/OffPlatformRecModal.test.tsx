// tests/web/components/OffPlatformRecModal.test.tsx
//
// Modal that opens from the right-rail Recommendations card on a
// project page. Lazy-fetches /api/recommendations/:id and surfaces
// the recommender's contact channels at the top of the body.

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const recBase = {
  id: 1,
  company: "elegant building services",
  comment: "Used them for our loft last year — really tidy work.",
  rating: 5,
  ratings: { quality: 5, reliability: 5, communication: 5, trust: null, value: 4 },
  photos: [{ id: "p1", url: "/job-images/loft-conversion.jpg" }],
  recommender: { name: "Priya" },
  contact: { phone: "020 7946 0123", email: "hello@elegant.co.uk" },
};

const get = vi.fn(async () => ({ data: { recommendation: recBase } }));
const apiInstance = { get, post: vi.fn() };
vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

// PhotoLightbox is heavy and not under test - stub.
vi.mock("@/components/PhotoLightbox", () => ({ default: () => null }));

import OffPlatformRecModal from "@/components/project/OffPlatformRecModal";

describe("<OffPlatformRecModal />", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ data: { recommendation: recBase } });
  });

  it("renders nothing when open is false", () => {
    render(<OffPlatformRecModal open={false} recId={1} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog", { name: /recommendation details/i })).toBeNull();
  });

  it("opens, fetches rec detail, and surfaces recommender + comment", async () => {
    render(<OffPlatformRecModal open={true} recId={1} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/recommendations/1"),
    );
    await waitFor(() =>
      expect(screen.getByText(/elegant building services/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Priya/)).toBeInTheDocument();
    expect(
      screen.getByText(/Used them for our loft last year/),
    ).toBeInTheDocument();
  });

  it("renders WhatsApp, Call, SMS, Email links from contact details", async () => {
    render(<OffPlatformRecModal open={true} recId={1} onClose={vi.fn()} />);

    const whatsapp = await screen.findByRole("link", { name: /whatsapp/i });
    expect(whatsapp).toHaveAttribute(
      "href",
      expect.stringContaining("wa.me/"),
    );
    expect(screen.getByRole("link", { name: /^call$/i })).toHaveAttribute(
      "href",
      expect.stringContaining("tel:"),
    );
    expect(screen.getByRole("link", { name: /sms/i })).toHaveAttribute(
      "href",
      expect.stringContaining("sms:"),
    );
    expect(screen.getByRole("link", { name: /email/i })).toHaveAttribute(
      "href",
      "mailto:hello@elegant.co.uk",
    );
  });

  it("shows the empty-channels fallback when neither phone nor email supplied", async () => {
    get.mockResolvedValueOnce({
      data: {
        recommendation: { ...recBase, contact: { phone: null, email: null }, phone: null, email: null },
      },
    });
    render(<OffPlatformRecModal open={true} recId={1} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(
        screen.getByText(/share contact details for this tradesperson/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: /whatsapp/i }),
    ).not.toBeInTheDocument();
  });
});
