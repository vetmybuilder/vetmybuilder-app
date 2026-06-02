// tests/web/components/socialShareButtons.test.tsx
//
// The Nextdoor and Facebook share tiles are gated by INDEPENDENT feature
// flags ("share_nextdoor", "share_facebook"). Each tile shows only when its
// own flag is on. Desktop = web links; mobile (Web Share API) = native sheet.

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

const flagState: Record<string, boolean> = {};
vi.mock("@/utils/useFeatureFlags", () => ({
  useFeatureFlag: (key: string) => !!flagState[key],
}));

import SocialShareButtons from "../../../web/components/project/SocialShareButtons";
import {
  buildFacebookShareUrl,
  buildNextdoorShareUrl,
} from "../../../web/utils/shareInvite";

const SHARE_URL = "https://staging.vetmybuilder.com/projects/1/recommend";
const MESSAGE = `Hey - recommend a tradesperson: ${SHARE_URL}`;

const realUserAgent = navigator.userAgent;
function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

beforeEach(() => {
  flagState.share_nextdoor = false;
  flagState.share_facebook = false;
});

afterEach(() => {
  Object.defineProperty(navigator, "userAgent", {
    value: realUserAgent,
    configurable: true,
  });
  delete (navigator as any).share;
});

describe("SocialShareButtons", () => {
  it("renders nothing when both flags are off", () => {
    render(<SocialShareButtons shareUrl={SHARE_URL} message={MESSAGE} />);
    expect(screen.queryByTestId("share-nextdoor")).toBeNull();
    expect(screen.queryByTestId("share-facebook")).toBeNull();
  });

  it("shows only Nextdoor when only its flag is on", () => {
    flagState.share_nextdoor = true;
    render(<SocialShareButtons shareUrl={SHARE_URL} message={MESSAGE} />);
    expect(screen.getByTestId("share-nextdoor")).toHaveAttribute(
      "href",
      buildNextdoorShareUrl({ message: MESSAGE }),
    );
    expect(screen.queryByTestId("share-facebook")).toBeNull();
  });

  it("shows only Facebook when only its flag is on", () => {
    flagState.share_facebook = true;
    render(<SocialShareButtons shareUrl={SHARE_URL} message={MESSAGE} />);
    expect(screen.getByTestId("share-facebook")).toHaveAttribute(
      "href",
      buildFacebookShareUrl({ url: SHARE_URL }),
    );
    expect(screen.queryByTestId("share-nextdoor")).toBeNull();
  });

  it("shows both as web links on desktop when both flags are on", () => {
    flagState.share_nextdoor = true;
    flagState.share_facebook = true;
    render(<SocialShareButtons shareUrl={SHARE_URL} message={MESSAGE} />);
    expect(screen.getByTestId("share-nextdoor")).toHaveAttribute(
      "href",
      buildNextdoorShareUrl({ message: MESSAGE }),
    );
    expect(screen.getByTestId("share-facebook")).toHaveAttribute(
      "href",
      buildFacebookShareUrl({ url: SHARE_URL }),
    );
  });

  it("on mobile each enabled tile invokes navigator.share (opens the native sheet/app)", async () => {
    flagState.share_nextdoor = true;
    flagState.share_facebook = true;
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    );
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    (navigator as any).share = shareSpy;

    render(<SocialShareButtons shareUrl={SHARE_URL} message={MESSAGE} />);

    await waitFor(() =>
      expect(screen.getByTestId("share-nextdoor")).not.toHaveAttribute("href"),
    );

    fireEvent.click(screen.getByTestId("share-nextdoor"));
    fireEvent.click(screen.getByTestId("share-facebook"));

    expect(shareSpy).toHaveBeenCalledTimes(2);
    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: SHARE_URL }),
    );
  });
});
