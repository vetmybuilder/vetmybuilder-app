// web/components/AuthedOnly.tsx
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

export default function AuthedOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, ensureSignedIn } = useAuth();
  const router = useRouter();
  const requested = useRef(false);

  useEffect(() => {
    if (loading || user) return;

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
  }, [loading, user, router, ensureSignedIn]);

  if (loading) return <p data-testid="auth-loading">Loading...</p>;
  if (!user) return null;

  return <>{children}</>;
}
