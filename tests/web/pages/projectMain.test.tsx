// tests/web/pages/projectMain.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const get = vi.fn(async (url: string) => {
  if (url.includes("/api/tradesmen/me")) {
    return { data: { role: "homeowner", profile: null } };
  }
  if (url.match(/\/api\/projects\/\d+\/matches$/)) {
    return {
      data: {
        recommended: [
          {
            uid: "b1",
            displayName: "James",
            companyName: "Harrow",
            photoUrl: null,
            starRating: 4.8,
            reviewCount: 27,
            yearsTrading: 12,
            chVerified: true,
            whyMatch: "Covers E4",
            tier: "recommended",
            recommenderName: "Alex",
          },
        ],
        subscribed: [],
      },
    };
  }
  return { data: {} };
});

vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post: vi.fn() }) }));

vi.mock("@/utils/auth", () => ({
  useAuth: () => ({
    user: { uid: "ho1" },
    loading: false,
    profileComplete: true,
    ensureSignedIn: vi.fn(),
  }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { id: "1" },
    isReady: true,
    pathname: "/projects/[id]",
    asPath: "/projects/1",
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

// Mock useProjectView to skip the @/shared/lib/plans import chain that
// vitest's alias config doesn't resolve. The page only reads a small slice
// of the VM in the homeowner branch we're exercising here.
vi.mock("@/components/project/views/useProjectView", () => ({
  useProjectView: () => ({
    project: {
      id: 1,
      name: "Test project",
      type: "kitchen",
      location: "E4",
      description: "",
      propertyType: "house",
      bedrooms: 3,
      createdAt: new Date().toISOString(),
      ownerUserId: "ho1",
      status: "live",
    },
    classification: null,
    loading: false,
    errorStatus: null,
    isOwner: true,
    isTrades: false,
    closeProjectModal: null,
    plansModal: null,
    loadingUi: null,
  }),
}));

// Stub Layout (which dynamic-imports AddToHomeScreenToast → window.matchMedia
// which jsdom doesn't provide) — desktop branch only mounts it for layout.
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Stub heavy desktop view — we only render the mobile branch in this test.
vi.mock("@/components/project/views/OwnerProjectView", () => ({
  default: () => null,
}));
vi.mock("@/components/project/views/TradesmanProjectView", () => ({
  default: () => null,
}));
vi.mock("@/components/project/views/NeighbourProjectView", () => ({
  default: () => null,
}));

import ProjectViewPage from "@/pages/projects/[id]";

describe("Project main page (homeowner)", () => {
  it("renders SwipeDeck for the project on mobile", async () => {
    render(<ProjectViewPage />);
    await waitFor(() =>
      expect(screen.getByText("Harrow")).toBeInTheDocument(),
    );
  });
});
