// tests/web/utils/shareInvite.test.ts
//
// Pins the share-URL builders for the social channels. Facebook only carries
// the URL (it builds its own preview from OG tags); Nextdoor's ShareKit
// carries the full pre-filled message (which already contains the link).

import { describe, it, expect } from "vitest";
import {
  buildFacebookShareUrl,
  buildNextdoorShareUrl,
} from "../../../web/utils/shareInvite";

const RECOMMEND_URL =
  "https://staging.vetmybuilder.com/projects/1/recommend";
const MSG = `Hey - I'm looking for a tradesperson for my "External Wall Insulation in E4 (Semi-Detached)" project. ${RECOMMEND_URL}`;

describe("buildFacebookShareUrl", () => {
  it("wraps the recommend URL in the FB sharer u= param", () => {
    const out = buildFacebookShareUrl({ url: RECOMMEND_URL });
    expect(out).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(RECOMMEND_URL)}`,
    );
  });
});

describe("buildNextdoorShareUrl", () => {
  it("posts the full message (which contains the link) via sharekit body", () => {
    const out = buildNextdoorShareUrl({ message: MSG });
    expect(out.startsWith("https://nextdoor.com/sharekit/?")).toBe(true);
    const params = new URL(out).searchParams;
    expect(params.get("body")).toBe(MSG);
    expect(params.get("source")).toBe("VetMyBuilder");
  });
});
