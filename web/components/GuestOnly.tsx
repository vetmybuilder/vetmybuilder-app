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

    // Users on the tradesman area (register, login) are in the middle of
    // a vendor signup flow — they legitimately have no homeowner profile
    // AND their role check may still say "user" (the tradesman profile
    // hasn't been created yet). The tradesman page owns its own
    // navigation — GuestOnly must not race it.
    const onTradesmanArea =
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/tradesman/");
    if (onTradesmanArea) return;

    // Mid-signup users (Firebase-authed but no homeowner profile yet) go
    // straight to the post-OAuth completion page.
    if (profileComplete === false) {
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
