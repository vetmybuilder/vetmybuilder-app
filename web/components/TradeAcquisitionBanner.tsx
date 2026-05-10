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

  if (loading || user) return null;
  if (HIDDEN_PATHS.some((p) => router.pathname.startsWith(p))) return null;

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
