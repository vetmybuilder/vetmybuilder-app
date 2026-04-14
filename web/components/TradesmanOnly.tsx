// web/components/TradesmanOnly.tsx
// Only logged-in tradesmen may see the wrapped page.
// Guests are redirected to /tradesman/login.
// Logged-in homeowners are redirected to /projects.
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useRole } from "@/utils/useRole";

export default function TradesmanOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || roleLoading) return;

    if (!user) {
      router.replace("/tradesman/login");
      return;
    }

    if (role !== "tradesman") {
      // Mid-signup SSO tradesman: they're authed but their PUT
      // /api/tradesmen/me hasn't landed yet, so useRole still reports
      // "user". Sending them to /projects here would cascade through
      // AuthedOnly to the homeowner /signup/complete — not what the
      // user intended. Route them back to finish the tradesman flow.
      let midTradesmanSignup = false;
      try {
        midTradesmanSignup =
          sessionStorage.getItem("vmb:tradesmanSignupInProgress") === "1";
      } catch {}
      if (midTradesmanSignup) {
        router.replace("/tradesman/signup/complete");
      } else {
        router.replace("/projects");
      }
    }
  }, [authLoading, roleLoading, user, role, router]);

  if (authLoading || roleLoading) return null;
  if (!user || role !== "tradesman") return null;

  return <>{children}</>;
}
