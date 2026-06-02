// web/components/project/SocialShareButtons.tsx
//
// The Nextdoor + Facebook tiles in the DESKTOP owner "Invite your community"
// card. Each tile is gated by its own feature flag (share_nextdoor /
// share_facebook). Logic (gating + native-vs-web) lives in useSocialShare;
// the mobile "Share your project" sheet (ShareProjectModal) reuses that hook
// with its own tile styling.

import { useSocialShare } from "@/utils/useSocialShare";

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
  const {
    nextdoorEnabled,
    facebookEnabled,
    useNativeShare,
    nativeShare,
    nextdoorHref,
    facebookHref,
  } = useSocialShare({ shareUrl, message });

  if (!nextdoorEnabled && !facebookEnabled) return null;

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
            href={nextdoorHref}
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
            href={facebookHref}
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
