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
  const { user, loading: authLoading, profileComplete } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) return; // guest — nothing to do

    // Wait until /api/me has resolved (profileComplete flips from null to a
    // boolean) so we know whether the user has finished homeowner signup.
    // Without this gate, an authed-but-mid-signup user would briefly land
    // on /projects before auth.tsx's hard-nav to /signup/complete kicked
    // in — a visible flash.
    if (profileComplete === null) return;

    // Tradesman SSO: check before the homeowner profileComplete gate,
    // otherwise a new Google user (no homeowner row) would be sent to
    // /signup/complete instead of /tradesman/signup/complete.
    let oauthRole: string | null = null;
    try {
      oauthRole = sessionStorage.getItem("vmb:oauthRole");
    } catch {}

    if (oauthRole === "tradesman") {
      if (role !== "tradesman") {
        router.replace("/tradesman/signup/complete");
        return;
      }
      try { sessionStorage.removeItem("vmb:oauthRole"); } catch {}
    }

    // Mid-signup homeowners (Firebase-authed but no homeowner profile yet)
    // go straight to the post-OAuth completion page.
    // Tradesmen don't need a homeowner postcode — skip this gate for them.
    if (profileComplete === false && role !== "tradesman") {
      router.replace("/signup/complete");
      return;
    }

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

    // Honour a sessionStorage `vmb:oauthReturnTo` set by the OAuth sign-in
    // button. We deliberately use a dedicated key (NOT vmb:returnTo) because
    // _app.tsx auto-stashes the current path under vmb:returnTo on every
    // non-auth route change — that auto-stash can hold values like
    // "/?signedOut=1" which would poison the post-signup redirect.
    let stashedReturnTo: string | null = null;
    try {
      stashedReturnTo = sessionStorage.getItem("vmb:oauthReturnTo");
      if (stashedReturnTo) sessionStorage.removeItem("vmb:oauthReturnTo");
    } catch {}
    if (stashedReturnTo && stashedReturnTo.startsWith("/")) {
      router.replace(stashedReturnTo);
      return;
    }

    if (role === "tradesman") {
      router.replace("/tradesman/projects");
    } else {
      router.replace("/projects");
    }
  }, [authLoading, roleLoading, user, role, router, profileComplete]);

  // Still determining if logged in
  if (authLoading) return null;

  // Confirmed guest — no role check needed, render immediately
  if (!user) return <>{children}</>;

  // Logged in — still determining role for redirect target
  if (roleLoading) return null;

  // Logged in with role known — redirect fires via useEffect, render nothing
  return null;
}
