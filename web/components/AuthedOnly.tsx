// web/components/AuthedOnly.tsx
import { useAuth } from "@/utils/auth";
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

    // Not signed in → kick off the sign-in flow.
    if (!user) {
      // Remember where to send the user back after auth
      try {
        const here =
          (typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : router.asPath) || "/";
        sessionStorage.setItem("vmb:returnTo", here);
      } catch {
        /* noop */
      }

      // Prefer opening the global SignUpGate (non-navigating)
      if (!requested.current) {
        requested.current = true;
        ensureSignedIn().catch(() => {
          // Fallback: navigate to /login if the modal flow isn’t available
          router.replace("/login");
        });
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

  if (loading) return <p data-testid="auth-loading">Loading...</p>;
  if (!user) return null;

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
