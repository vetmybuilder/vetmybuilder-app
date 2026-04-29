// web/components/GlobalMobileMenu.tsx
//
// Single global instance of <MobileMenu />, mounted at the app root in
// `web/pages/_app.tsx`. Any page can open it via:
//
//   const { openMenu } = useMobileMenu();
//
// This component owns the auth-derived props (isTrades / firstName /
// tradeCta / onLogout / onGoHome / onGoProjectsTab / onGoAccount). The
// logic mirrors what SiteHeader used to compute when it owned the menu
// inline; lifting it here means bare routes (/projects, /matches,
// /match/[matchId], /projects/[id], /projects/[id]/shortlist,
// /chat/[matchId]) can now open the menu without their own duplicate
// prop computation.
import * as React from "react";
import { useRouter } from "next/router";
import { useAuth, signOutUser } from "@/utils/auth";
import { useApi } from "@/utils/api";
import { useMobileMenu } from "@/utils/mobileMenu";
import MobileMenu from "@/components/MobileMenu";

export default function GlobalMobileMenu() {
  const { open, closeMenu } = useMobileMenu();
  const { user, profileComplete } = useAuth();
  const api = useApi();
  const router = useRouter();

  // Mirror SiteHeader's logic for suppressing the avatar/account chrome
  // on the role-error and login pages (and for users mid-signup who are
  // authed at Firebase but haven't completed homeowner profile yet).
  const [isRoleErrorPage, setIsRoleErrorPage] = React.useState<boolean>(
    () => {
      if (typeof window !== "undefined") {
        return window.location.search.includes("role_error=");
      }
      return false;
    },
  );
  React.useEffect(() => {
    const next =
      typeof window !== "undefined"
        ? window.location.search.includes("role_error=")
        : router.asPath.includes("role_error=");
    setIsRoleErrorPage(next);
  }, [router.asPath]);
  const isLoginPage = router.pathname === "/login";
  const isMidSignup = !!user && profileComplete === false;
  const displayUser =
    isRoleErrorPage || isLoginPage || isMidSignup ? null : user;

  // Trades / company state (cached to sessionStorage, same keys SiteHeader
  // uses, so we share the same cache and don't double-fetch).
  const [isTrades, setIsTrades] = React.useState(false);
  const [company, setCompany] = React.useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const justRegistered =
        sessionStorage.getItem("vmb:justRegisteredTradesman") === "1";
      if (justRegistered) {
        setIsTrades(true);
        setCompany(sessionStorage.getItem("vmb:tradesCo") || null);
        return;
      }
      const cached = sessionStorage.getItem("vmb:isTradesman");
      if (cached !== null) {
        setIsTrades(cached === "1");
        setCompany(sessionStorage.getItem("vmb:tradesCo") || null);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    let alive = true;

    if (!displayUser) {
      setIsTrades(false);
      setCompany(null);
      setAvatarUrl(null);
      try {
        sessionStorage.setItem("vmb:isTradesman", "0");
        sessionStorage.removeItem("vmb:tradesCo");
      } catch {}
      return;
    }

    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const role = String(data?.role || "user").toLowerCase();
        const prof = data?.profile || null;
        const isT = role === "tradesman" || !!prof;
        const co = prof?.company_name || prof?.company || prof?.name || null;
        const avatar = prof?.avatar_url || prof?.profile_picture_url || null;
        if (!alive) return;
        setIsTrades(!!isT);
        setCompany(co || null);
        setAvatarUrl(avatar || null);
        try {
          sessionStorage.setItem("vmb:isTradesman", isT ? "1" : "0");
          if (co) sessionStorage.setItem("vmb:tradesCo", co);
        } catch {}
      } catch {
        if (!alive) return;
        setIsTrades(false);
        setCompany(null);
        setAvatarUrl(null);
        try {
          sessionStorage.setItem("vmb:isTradesman", "0");
        } catch {}
      }
    })();

    return () => {
      alive = false;
    };
  }, [displayUser, api]);

  const tradeCta = React.useMemo(() => {
    if (!isTrades) return null;
    return {
      href: "/tradesman/jobs",
      label: company || "Trades",
      testid: "btn-trades-projects",
    };
  }, [isTrades, company]);

  async function onLogout() {
    try {
      await signOutUser();
    } catch {
      // ignore
    }
    window.location.href = "/";
  }

  return (
    <MobileMenu
      open={open}
      onClose={closeMenu}
      isTrades={isTrades}
      isAuthed={!!displayUser}
      firstName={displayUser?.firstName ?? null}
      avatarUrl={avatarUrl}
      tradeCta={tradeCta}
      onLogout={onLogout}
      onGoHome={() => router.push("/")}
      onGoProjectsTab={(key) =>
        router.push(
          { pathname: "/projects", query: { tab: key } },
          undefined,
          { shallow: true },
        )
      }
      onGoAccount={() => router.push("/account")}
    />
  );
}
