// tests/web/components/GetRecommendationsModal.test.tsx
//
// Owner-side "ask my community" modal. Pure presentational - no API.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import GetRecommendationsModal from "@/components/project/GetRecommendationsModal";

describe("<GetRecommendationsModal />", () => {
  it("renders nothing when closed", () => {
    render(<GetRecommendationsModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId("get-recs-modal")).toBeNull();
  });

  it("open: shows the three channel buttons with Share initially disabled", () => {
    render(<GetRecommendationsModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId("get-recs-modal")).toBeInTheDocument();
    expect(screen.getByTestId("channel-whatsapp")).toBeInTheDocument();
    expect(screen.getByTestId("channel-sms")).toBeInTheDocument();
    expect(screen.getByTestId("channel-email")).toBeInTheDocument();
    expect(screen.getByTestId("btn-confirm-get-recs")).toBeDisabled();
  });

  it("selecting a channel enables Share, clicking Share fires onConfirm with the channel", () => {
    const onConfirm = vi.fn();
    render(
      <GetRecommendationsModal
        open={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("channel-whatsapp"));
    const share = screen.getByTestId("btn-confirm-get-recs");
    expect(share).toBeEnabled();
    fireEvent.click(share);
    expect(onConfirm).toHaveBeenCalledWith({ channel: "whatsapp" });
  });

  it("Cancel and the close (X) icon both fire onClose", () => {
    const onClose = vi.fn();
    render(<GetRecommendationsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("btn-cancel-get-recs"));
    fireEvent.click(screen.getByTestId("get-recs-close"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
