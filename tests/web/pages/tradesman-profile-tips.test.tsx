// tests/web/pages/tradesman-profile-tips.test.tsx
//
// Regression coverage for "Boost your profile only showed on the edit
// page". Traders had to enter edit mode to find out what gaps to fix.
// The fix renders the same getCoachingTips callout on the read-only
// profile view as well.
//
// These tests pin the contract:
//   - A profile with known gaps renders the "Boost your profile -
//     N quick win(s)" header and the gap messages.
//   - A fully-complete profile renders no callout at all.

import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/tradesman/profile",
    query: {},
    asPath: "/tradesman/profile",
    push: vi.fn(),
    replace: mocks.routerReplaceMock,
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

vi.mock("@/utils/api", () => ({
  useApi: () => ({
    get: mocks.apiGetMock,
    post: vi.fn().mockResolvedValue({ data: { ok: true } }),
    put: vi.fn().mockResolvedValue({ data: { ok: true } }),
    delete: vi.fn().mockResolvedValue({ data: { ok: true } }),
  }),
  API_ORIGIN: "",
}));

vi.mock("@/utils/auth", () => ({
  useAuth: () => mocks.useAuthMock(),
}));

vi.mock("@/components/PhotoLightbox", () => ({
  default: () => null,
}));

vi.mock("@/components/BrandWatermarkScatter", () => ({
  default: () => null,
}));

vi.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  );
  return { default: Link };
});

import TradesmanProfilePage from "../../../web/pages/tradesman/profile";

const completeProfile = {
  user_id: "uid-1",
  company_name: "Acme Trades",
  contact_name: "Alex",
  profile_picture_url: null,
  photo_urls: ["a.jpg", "b.jpg", "c.jpg", "d.jpg"],
  service_areas: "E4,E17,N17",
  trade_types: "Plumber,Gas Engineer,Bathroom Fitter",
  phone: "0123",
  email: "a@example.com",
  web_url: "https://acmetrades.co.uk",
  web_verified: 1,
  ch_status: "verified",
  warranty_months: 24,
  social_links_json: JSON.stringify(["https://facebook.com/acme"]),
  supporting_docs_json: JSON.stringify([{ name: "ins.pdf" }, { name: "cert.pdf" }]),
  offers_discount: 1,
  location_outward: "E4",
  vmb_score: 80,
};

describe("/tradesman/profile - coaching tips callout", () => {
  beforeEach(() => {
    mocks.apiGetMock.mockReset();
    mocks.routerReplaceMock.mockReset();
    mocks.useAuthMock.mockReturnValue({
      user: { uid: "uid-1" },
      loading: false,
    });
  });

  it("renders 'Boost your profile' with the right gap messages for an incomplete profile", async () => {
    // A profile missing warranty, with too few service areas, and
    // unverified Companies House - the top 3 highest-impact tips.
    mocks.apiGetMock.mockResolvedValue({
      data: {
        role: "tradesman",
        profile: {
          ...completeProfile,
          warranty_months: 0,
          ch_status: "no_match",
          service_areas: "E4",
        },
      },
    });

    const { findAllByText } = render(<TradesmanProfilePage />);

    // The page renders both the mobile and desktop layout trees in
    // the DOM at the same time (visibility is purely CSS), so each
    // tip will appear twice. We assert presence via findAllByText.
    const header = await findAllByText(/Boost your profile/i);
    expect(header.length).toBeGreaterThanOrEqual(1);

    const ch = await findAllByText(/Verify your company with Companies House/i);
    expect(ch.length).toBeGreaterThanOrEqual(1);

    const warranty = await findAllByText(/Add your warranty terms/i);
    expect(warranty.length).toBeGreaterThanOrEqual(1);

    const areas = await findAllByText(/Add more service areas/i);
    expect(areas.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT render the callout when the profile is fully complete", async () => {
    mocks.apiGetMock.mockResolvedValue({
      data: {
        role: "tradesman",
        profile: completeProfile,
      },
    });

    const { queryByText, findAllByText } = render(<TradesmanProfilePage />);

    // Wait for SOME profile content to confirm the page loaded.
    await findAllByText(/Acme Trades/i);

    expect(queryByText(/Boost your profile/i)).toBeNull();
  });
});
