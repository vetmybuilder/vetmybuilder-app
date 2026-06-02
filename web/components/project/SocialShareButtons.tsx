// web/components/project/SocialShareButtons.tsx
//
// The Nextdoor + Facebook tiles in the owner "Invite your community" share
// card. Each tile is gated by its OWN feature flag ("share_nextdoor" /
// "share_facebook") so they can be toggled independently from the admin
// feature-flags page without a deploy.
//
// Desktop: plain web links to the platform share dialogs (open in a new tab).
// Mobile (with the Web Share API): the tiles trigger the native OS share sheet
// so the user can post via the installed Facebook / Nextdoor app - consistent
// with how WhatsApp/SMS/Email already open their native apps. (Facebook and
// Nextdoor publish no share deep-link of their own, so the OS sheet is the only
// way to reach their apps from mobile web.)

import { useEffect, useState } from "react";
import { useFeatureFlag } from "@/utils/useFeatureFlags";
import { buildFacebookShareUrl, buildNextdoorShareUrl } from "@/utils/shareInvite";

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

const TILE_CLASS =
  "aspect-square rounded-2xl border border-amber-100 bg-white flex flex-col items-center justify-center gap-1 transition-colors";

function NextdoorGlyph() {
  return (
    <span
      className="w-9 h-9 rounded-full text-white flex items-center justify-center"
      style={{ background: "linear-gradient(135deg,#19975d,#0b7a44)" }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    </span>
  );
}

function FacebookGlyph() {
  return (
    <span
      className="w-9 h-9 rounded-full text-white flex items-center justify-center"
      style={{ background: "linear-gradient(135deg,#3b82f6,#1877f2)" }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" />
      </svg>
    </span>
  );
}

export default function SocialShareButtons({
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

  if (!nextdoorEnabled && !facebookEnabled) return null;

  // Mobile: open the OS share sheet (carries the same message the other
  // channels send, which already contains the recommend link).
  async function nativeShare() {
    try {
      await navigator.share({ text: message });
    } catch {
      /* user dismissed the sheet, or share unsupported - no-op */
    }
  }

  return (
    <>
      {nextdoorEnabled &&
        (useNativeShare ? (
          <button
            type="button"
            onClick={nativeShare}
            data-testid="share-nextdoor"
            aria-label="Share on Nextdoor"
            className={`${TILE_CLASS} hover:border-emerald-300 hover:bg-emerald-50`}
          >
            <NextdoorGlyph />
            <span className="text-[10.5px] font-bold text-slate-700">Nextdoor</span>
          </button>
        ) : (
          <a
            href={buildNextdoorShareUrl({ message })}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="share-nextdoor"
            aria-label="Share on Nextdoor"
            className={`${TILE_CLASS} hover:border-emerald-300 hover:bg-emerald-50`}
          >
            <NextdoorGlyph />
            <span className="text-[10.5px] font-bold text-slate-700">Nextdoor</span>
          </a>
        ))}

      {facebookEnabled &&
        (useNativeShare ? (
          <button
            type="button"
            onClick={nativeShare}
            data-testid="share-facebook"
            aria-label="Share on Facebook"
            className={`${TILE_CLASS} hover:border-blue-300 hover:bg-blue-50`}
          >
            <FacebookGlyph />
            <span className="text-[10.5px] font-bold text-slate-700">Facebook</span>
          </button>
        ) : (
          <a
            href={buildFacebookShareUrl({ url: shareUrl })}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="share-facebook"
            aria-label="Share on Facebook"
            className={`${TILE_CLASS} hover:border-blue-300 hover:bg-blue-50`}
          >
            <FacebookGlyph />
            <span className="text-[10.5px] font-bold text-slate-700">Facebook</span>
          </a>
        ))}
    </>
  );
}
