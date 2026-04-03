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

    if (role === "tradesman") {
      router.replace("/tradesman/projects");
    } else {
      router.replace("/projects");
    }
  }, [authLoading, roleLoading, user, role, router]);

  // Still determining auth/role state
  if (authLoading || roleLoading) return null;

  // Logged-in — redirect in progress, render nothing
  if (user) return null;

  return <>{children}</>;
}
