// web/components/GuestOnly.tsx
// Only unauthenticated (guest) users may see the wrapped page.
// Logged-in tradesmen are redirected to /tradesman/projects.
// Logged-in homeowners are redirected to /projects.
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useRole } from "@/utils/useRole";

export default function GuestOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) return; // guest — nothing to do

    // Honour an explicit ?next= param (e.g. admin login flows) so a redirect
    // set by the login form is not overridden by GuestOnly's default target.
    const nextParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
    if (nextParam && nextParam.startsWith("/")) {
      router.replace(nextParam);
      return;
    }

    if (role === "tradesman") {
      router.replace("/tradesman/projects");
    } else {
      router.replace("/projects");
    }
  }, [authLoading, roleLoading, user, role, router]);

  // Still determining if logged in
  if (authLoading) return null;

  // Confirmed guest — no role check needed, render immediately
  if (!user) return <>{children}</>;

  // Logged in — still determining role for redirect target
  if (roleLoading) return null;

  // Logged in with role known — redirect fires via useEffect, render nothing
  return null;
}
