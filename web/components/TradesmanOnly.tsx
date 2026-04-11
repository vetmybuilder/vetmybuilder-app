// web/components/TradesmanOnly.tsx
// Only logged-in tradesmen may see the wrapped page.
// Guests are redirected to /tradesman/login.
// Logged-in homeowners are redirected to /projects.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";

export default function TradesmanOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const api = useApi();
  const router = useRouter();
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace("/tradesman/login");
      return;
    }

    // Always verify with the API — sessionStorage cache is unreliable
    // during signup flows where SiteHeader can overwrite it.
    let alive = true;
    api
      .get("/api/tradesmen/me")
      .then(({ data }) => {
        if (!alive) return;
        const isTradesman =
          String(data?.role || "").toLowerCase() === "tradesman" ||
          !!data?.profile;
        if (isTradesman) {
          try { sessionStorage.setItem("vmb:isTradesman", "1"); } catch {}
          setVerified(true);
        } else {
          router.replace("/projects");
        }
      })
      .catch(() => {
        if (alive) router.replace("/projects");
      });

    return () => { alive = false; };
  }, [authLoading, user, api, router]);

  if (authLoading) return null;
  if (!user || !verified) return null;

  return <>{children}</>;
}
