// web/utils/useSocialShare.ts
//
// Shared logic for the Nextdoor + Facebook share tiles, used by both the
// desktop "Invite your community" card (SocialShareButtons) and the mobile
// "Share your project" sheet (ShareProjectModal). Keeps gating + native-share
// behaviour in one place; each surface renders its own tile styling.
//
// - Each platform is gated by its own flag (share_nextdoor / share_facebook).
// - On mobile (with the Web Share API) the tiles open the native OS share
//   sheet so the user can post via the installed app - consistent with how
//   WhatsApp/SMS/Email already open their native apps. On desktop they are
//   plain web links to the platform share dialogs.

import { useEffect, useState } from "react";
import { useFeatureFlag } from "@/utils/useFeatureFlags";
import { buildFacebookShareUrl, buildNextdoorShareUrl } from "@/utils/shareInvite";

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function useSocialShare({
  shareUrl,
  message,
}: {
  shareUrl: string;
  message: string;
}) {
  const nextdoorEnabled = useFeatureFlag("share_nextdoor");
  const facebookEnabled = useFeatureFlag("share_facebook");

  // Decide native-vs-web after mount to avoid SSR/hydration mismatch
  // (navigator is unavailable on the server).
  const [useNativeShare, setUseNativeShare] = useState(false);
  useEffect(() => {
    setUseNativeShare(
      isMobileDevice() && typeof navigator !== "undefined" && !!navigator.share,
    );
  }, []);

  // Carries the same message the other channels send (it already contains the
  // recommend link). Swallow AbortError when the user dismisses the sheet.
  async function nativeShare() {
    try {
      await navigator.share({ text: message });
    } catch {
      /* dismissed or unsupported - no-op */
    }
  }

  return {
    nextdoorEnabled,
    facebookEnabled,
    useNativeShare,
    nativeShare,
    nextdoorHref: buildNextdoorShareUrl({ message }),
    facebookHref: buildFacebookShareUrl({ url: shareUrl }),
  };
}
