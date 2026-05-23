// web/components/TradeAcquisitionBanner.tsx
//
// Slim emerald banner that sits above the SiteHeader on guest-facing
// pages, surfacing the trade-side entry so prospective tradespeople
// can never miss it. Non-sticky - scrolls away with the page.
//
// Hidden when:
//   - the visitor is signed in (any role)
//   - the visitor is already on an auth surface (login, signup,
//     forgot-password, /tradesman/register-tradesmen)
//
// Mobile shows a short "I'm a tradesperson" lead; desktop shows the
// long "Are you a tradesperson..." copy.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";

const HIDDEN_PATHS = [
  "/login",
  "/signup",
  "/signup/complete",
  "/forgot-password",
  "/reset-password",
  "/tradesman/register-tradesmen",
  "/tradesman/signup/complete",
];

export default function TradeAcquisitionBanner() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // sessionStorage can only be read after hydration. Reading it during
  // the first render would cause a hydration mismatch when the server's
  // HTML (which always shows the banner) differs from the client's
  // first paint (which hides it for returning tradespeople). Defer that
  // hint to a post-mount effect.
  const [hydrated, setHydrated] = useState(false);
  const [sessionIsTrades, setSessionIsTrades] = useState(false);
  useEffect(() => {
    setHydrated(true);
    try {
      setSessionIsTrades(
        sessionStorage.getItem("vmb:isTradesman") === "1",
      );
    } catch {}
  }, []);

  // Render optimistically as if the viewer is a guest while auth is
  // still resolving. Most homepage visitors are guests, so this avoids
  // the "header jumps down" flicker when the banner pops in 100-300ms
  // after first paint. If auth eventually resolves to a signed-in user,
  // the banner disappears (a much rarer transition).
  if (user) return null;
  if (HIDDEN_PATHS.some((p) => router.pathname.startsWith(p))) return null;
  // After hydration, suppress the banner if we likely-know the user is
  // signed in as a tradesperson via the sessionStorage hint SiteHeader
  // also reads. Pre-hydration we always render so the server + client
  // first-paint match (avoids React hydration error).
  if (hydrated && loading && sessionIsTrades) return null;

  return (
    <Link
      href="/tradesman/register-tradesmen"
      data-testid="trade-acquisition-banner"
      aria-label="Tradespeople, list your business free"
      className="group relative block border-b border-emerald-700/40 px-3 py-2 text-center text-[13px] font-extrabold tracking-tight text-white shadow-sm transition-colors hover:brightness-110"
      style={{
        background:
          "linear-gradient(90deg,#047857 0%,#059669 50%,#10b981 100%)",
      }}
    >
      <span className="inline-flex items-center gap-2">
        {/* hard hat */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0"
        >
          <path d="M3 17h18" />
          <path d="M5 17v-2a7 7 0 0114 0v2" />
          <path d="M10 6V4h4v2" />
        </svg>
        <span className="hidden sm:inline">
          Tradesperson? List your business for{" "}
          <span className="bg-white/15 rounded px-1.5 py-0.5 ml-0.5">
            FREE
          </span>
        </span>
        <span className="sm:hidden">
          List your business{" "}
          <span className="bg-white/15 rounded px-1.5 py-0.5">FREE</span>
        </span>
        <span
          aria-hidden
          className="ml-1 inline-block transition-transform duration-300 ease-out group-hover:translate-x-1"
        >
          →
        </span>
      </span>
    </Link>
  );
}
