// web/components/AuthedOnly.tsx
import { useAuth, isSignOutInProgress } from "@/utils/auth";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

// Pages where we additionally require a complete homeowner profile (i.e.
// the user has a postcode). Admin and tradesman pages are also wrapped in
// AuthedOnly but those users legitimately have no homeowner postcode, so
// the profileComplete gate must NOT fire for them.
function isHomeownerAreaPath(path: string): boolean {
  return path === "/projects" || path.startsWith("/projects/");
}

export default function AuthedOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, profileComplete, ensureSignedIn } = useAuth();
  const router = useRouter();
  const requested = useRef(false);

  // Compute on every render — router.pathname changes will re-run the effect
  // and re-evaluate the gates.
  const onHomeownerArea = isHomeownerAreaPath(
    typeof window !== "undefined" ? window.location.pathname : router.pathname,
  );

  useEffect(() => {
    if (loading) return;

    // Not signed in -> deterministically navigate to /login with a
    // returnTo so the user comes back here after auth.
    //
    // Previously this called `ensureSignedIn()` which returns a Promise
    // that only resolves once the user signs in (the original
    // SignUpGate-modal pattern). The .catch fallback never fires, so an
    // unauthenticated visitor sat on a blank `null` render forever.
    if (!user) {
      // Explicit user-initiated sign-out: skip the protected-route
      // capture. The caller (GlobalMobileMenu.onLogout) is about to do
      // a hard nav to "/", and we don't want to write the current
      // protected path into vmb:returnTo / ?next=... — that would land
      // the user back on this page after they sign in again instead of
      // on /projects.
      if (isSignOutInProgress()) return;

      // Capture path only — drop query string. Tabs/filters/sort are
      // transient UI state and stale by the time the user is back, but
      // the resource path itself (e.g. /projects/123, /match/45) is
      // genuinely where they were trying to be.
      const here =
        (typeof window !== "undefined"
          ? window.location.pathname
          : (router.asPath || "/").split("?")[0]) || "/";

      try {
        sessionStorage.setItem("vmb:returnTo", here);
      } catch {
        /* noop */
      }
      if (!requested.current) {
        requested.current = true;
        const next = encodeURIComponent(here);
        router.replace(`/login?next=${next}`);
        // Best-effort: still register a waiter so an in-page
        // ensureSignedIn() call doesn't hang. If we navigate away
        // first, this never resolves and gets garbage-collected.
        ensureSignedIn().catch(() => {});
      }
      return;
    }

    // Signed in but mid-signup on a homeowner-area page → bounce to the
    // post-OAuth completion page. profileComplete === null means /api/me
    // is still in flight; we wait for it to resolve before making a routing
    // decision so we don't flash the protected page.
    if (onHomeownerArea && profileComplete === false) {
      router.replace("/signup/complete");
    }
  }, [
    loading,
    user,
    profileComplete,
    onHomeownerArea,
    router,
    ensureSignedIn,
  ]);

  // Render nothing while the auth state is still hydrating OR while the
  // useEffect above is navigating to /login. Showing visible chrome
  // (a "Loading..." string or a "Please sign in" fallback card) caused
  // a brief flash of an old-design page during route transitions -
  // returning null keeps the viewport empty for that single tick before
  // the next route paints.
  if (loading || !user) return null;

  // On homeowner-area pages, hold off rendering protected content until
  // we've confirmed the user has a complete profile. profileComplete being
  // null means /api/me is still in flight; false means the redirect to
  // /signup/complete is in flight. Either way we render the loading state
  // to avoid flashing the protected page.
  if (onHomeownerArea && profileComplete !== true) {
    return <p data-testid="auth-loading">Loading...</p>;
  }

  return <>{children}</>;
}
