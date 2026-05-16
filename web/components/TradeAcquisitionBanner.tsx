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
      className="block bg-emerald-50 hover:bg-emerald-100 transition-colors border-b border-emerald-200 text-center text-[12px] font-bold text-emerald-800 py-1.5 px-3"
    >
      Tradespeople, <span className="underline">list your business free →</span>
    </Link>
  );
}
