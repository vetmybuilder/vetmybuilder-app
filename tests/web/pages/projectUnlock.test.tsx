import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ProjectUnlock from "@/pages/projects/[id]/unlock";

const get = vi.fn(async () => ({
  data: {
    project: {
      id: "p1", title: "Kitchen extension", budget: "£15k–£25k",
      outward: "E4", startWindow: "1 month",
      description: "4m rear extension",
      trades: ["Building"], homeownerFirstName: "Sarah",
    },
    unlockPrice: 999, // pence
  },
}));
const post = vi.fn(async () => ({ data: { url: "https://stripe.test/co" } }));
vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post }) }));
vi.mock("@/utils/auth", () => ({ useAuth: () => ({ user: { uid: "b1" } }) }));
vi.mock("next/router", () => ({
  useRouter: () => ({ query: { id: "p1" }, isReady: true, push: vi.fn(),
    pathname: "/projects/[id]/unlock", asPath: "/projects/p1/unlock" }),
}));

describe("ProjectUnlock", () => {
  it("shows unlock primary CTA and subscription upsell", async () => {
    render(<ProjectUnlock />);
    await waitFor(() => expect(screen.getByText(/Kitchen extension/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Unlock this job — £9\.99/ })).toBeInTheDocument();
    expect(screen.getByText(/Subscribe for unlimited matches/)).toBeInTheDocument();
  });
});
