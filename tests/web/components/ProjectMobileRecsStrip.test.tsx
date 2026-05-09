// tests/web/components/ProjectMobileRecsStrip.test.tsx
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import ProjectMobileRecsStrip, {
  type ProjectMobileRec,
} from "@/components/project/ProjectMobileRecsStrip";

const push = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockReset();
});

function makeRecs(n: number): ProjectMobileRec[] {
  return Array.from({ length: n }, (_, i) => ({
    recommendationId: i + 1,
    company: `Company ${i + 1}`,
    recommenderName: `Recommender ${i + 1}`,
    coverPhotoUrl: null,
  }));
}

describe("<ProjectMobileRecsStrip />", () => {
  it("renders nothing when there are no recs", () => {
    const { container } = render(
      <ProjectMobileRecsStrip projectId={1} recs={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows all rows and no toggle when there are 3 or fewer recs", () => {
    render(<ProjectMobileRecsStrip projectId={1} recs={makeRecs(3)} />);
    const section = screen.getByTestId("project-mobile-recommendations");
    expect(within(section).getByText("Company 1")).toBeInTheDocument();
    expect(within(section).getByText("Company 2")).toBeInTheDocument();
    expect(within(section).getByText("Company 3")).toBeInTheDocument();
    expect(
      screen.queryByTestId("project-mobile-recs-toggle"),
    ).not.toBeInTheDocument();
  });

  it("caps at 3 rows and surfaces a 'Show N more' toggle for 4+ recs", () => {
    render(<ProjectMobileRecsStrip projectId={1} recs={makeRecs(7)} />);
    expect(screen.getByText("Company 1")).toBeInTheDocument();
    expect(screen.getByText("Company 3")).toBeInTheDocument();
    expect(screen.queryByText("Company 4")).not.toBeInTheDocument();
    const toggle = screen.getByTestId("project-mobile-recs-toggle");
    expect(toggle).toHaveTextContent("Show 4 more");
  });

  it("expands to show every rec and flips the toggle to 'Show less'", () => {
    render(<ProjectMobileRecsStrip projectId={1} recs={makeRecs(7)} />);
    const toggle = screen.getByTestId("project-mobile-recs-toggle");
    fireEvent.click(toggle);
    expect(screen.getByText("Company 4")).toBeInTheDocument();
    expect(screen.getByText("Company 7")).toBeInTheDocument();
    expect(toggle).toHaveTextContent("Show less");

    fireEvent.click(toggle);
    expect(screen.queryByText("Company 4")).not.toBeInTheDocument();
    expect(toggle).toHaveTextContent("Show 4 more");
  });

  it("routes to the builder profile when a row is tapped", () => {
    render(<ProjectMobileRecsStrip projectId={42} recs={makeRecs(2)} />);
    fireEvent.click(screen.getByTestId("project-mobile-rec-2"));
    expect(push).toHaveBeenCalledWith("/builders/2?projectId=42");
  });
});
