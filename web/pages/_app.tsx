// web/pages/_app.tsx
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { AuthProvider } from "@/utils/auth";
import Layout from "@/components/Layout";
import * as React from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/AdminLayout";
import TradesmanLayout from "@/components/TradesmanLayout";
import CrossTabLogoutWatcher from "@/components/CrossTabLogoutWatcher";
import PostHogProvider from "@/components/PostHogProvider";
import { MobileMenuProvider } from "@/utils/mobileMenu";
import GlobalMobileMenu from "@/components/GlobalMobileMenu";
import MatchCelebrationToast from "@/components/MatchCelebrationToast";
import GlobalSseDispatcher from "@/components/GlobalSseDispatcher";
import MessagingDock from "@/components/messaging/MessagingDock";

// ✅ IMPORTANT: adjust this import path to where your initFirebase() file actually is.
// Example candidates:
// - "@/utils/firebase"
// - "@/lib/firebase"
// - "@/firebase/initFirebase"
import { initFirebase } from "@/utils/firebase";

// NEW: minimal auth-path helper (local to _app only)
const AUTH_PATHS = new Set([
  "/login",
  "/signup",
  "/auth/complete",
  "/tradesman/login",
]);

// Transient confirmation / success pages we never want to land a user
// back on after a session restart. Treated like auth paths for the
// returnTo capture: they don't get stashed as the last-visited route.
const NO_RETURN_TO_PATHS = new Set([
  "/tradesman/unlock/sent",
  "/payments/success",
  "/payments/mock/success",
  "/payments/mock/cancel",
  "/match",
]);

function isAuthPath(pathname: string) {
  // strip any query/hash
  const p = pathname.split("?")[0].split("#")[0];
  if (AUTH_PATHS.has(p)) return true;
  if (NO_RETURN_TO_PATHS.has(p)) return true;
  // /match/<id> dynamic route
  if (p.startsWith("/match/")) return true;
  return false;
}

/**
 * Ensure Firebase is initialised ONCE on the client,
 * before AuthProvider/components try to use auth.
 */
let __firebaseInitialised = false;
function ensureFirebaseClientInit(): void {
  if (__firebaseInitialised) return;
  if (typeof window === "undefined") return;

  __firebaseInitialised = true;

  try {
    initFirebase();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[_app] initFirebase failed:", e);
  }
}

/**
 * Generate a stable guest session id (GSID) and expose it:
 *  - localStorage: "vmb.gsid" (value)
 *  - window.__GSID (string)
 *  - <html data-gsid="..."> (for quick inspection)
 */
function AppBootstrap() {
  const router = useRouter();

  React.useEffect(() => {
    // Ensure GSID
    const key = "vmb.gsid";
    let gsid = "";
    try {
      gsid = localStorage.getItem(key) || "";
      if (!gsid) {
        // g_<timestamp>_<random4>
        const rand = Math.random().toString(36).slice(-4);
        gsid = `g_${Date.now()}_${rand}`;
        localStorage.setItem(key, gsid);
      }
    } catch {
      // localStorage might be blocked; fall back to in-memory
      const rand = Math.random().toString(36).slice(-4);
      gsid = `g_${Date.now()}_${rand}`;
    }

    // Expose globally for quick access
    (window as any).__GSID = gsid;

    // Mark on <html> for sanity checks / QA screenshots
    try {
      document.documentElement.setAttribute("data-gsid", gsid);
    } catch {
      /* noop */
    }

    // --- remember last non-auth route for cleaner post-login redirect.
    // Store the PATH ONLY (no query string). Tabs/filters/sort are
    // transient UI state that's stale by the time the user is back;
    // resource paths (/projects/123, /match/45) are what we actually
    // want to restore.
    try {
      const here = router.asPath || "/";
      const pathname = new URL(here, window.location.origin).pathname;
      if (!isAuthPath(pathname)) {
        sessionStorage.setItem("vmb:lastNonAuth", pathname);
        if (!sessionStorage.getItem("vmb:returnTo")) {
          sessionStorage.setItem("vmb:returnTo", pathname);
        }
      }
    } catch {
      /* noop */
    }

    // Initial page view
    dispatchPageView(router.asPath, gsid);

    // Track subsequent route changes. Path-only capture — see comment above.
    const onRoute = (url: string) => {
      // url is usually a path like "/projects?tab=mine"
      try {
        const pathname = new URL(url, window.location.origin).pathname;
        if (!isAuthPath(pathname)) {
          sessionStorage.setItem("vmb:lastNonAuth", pathname);
          if (!sessionStorage.getItem("vmb:returnTo")) {
            sessionStorage.setItem("vmb:returnTo", pathname);
          }
        }
      } catch {
        /* noop */
      }
      dispatchPageView(url, gsid);
    };

    router.events.on("routeChangeComplete", onRoute);
    return () => {
      router.events.off("routeChangeComplete", onRoute);
    };
  }, [router]);

  return null;
}

/** Minimal client-side event dispatcher you can wire to your analytics later */
function dispatchPageView(path: string, gsid: string) {
  // Fire a DOM event apps can listen to (e.g., tracking.ts)
  try {
    window.dispatchEvent(
      new CustomEvent("vmb:page:view", {
        detail: { path, gsid, ts: Date.now() },
      }),
    );
  } catch {
    /* noop */
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[vmb] page_view", { path, gsid });
  }
}

export default function MyApp({ Component, pageProps }: AppProps) {
  // ✅ ensure Firebase is ready on the client before anything uses auth
  ensureFirebaseClientInit();

  const router = useRouter();

  // Only actual /admin/* routes use the AdminLayout. Previously we also
  // re-skinned /login when ?next=/admin/... was present, but that decision
  // depends on the query string which isn't reliably present in the SSR
  // render of /login — causing a hydration mismatch (and a dev-mode error
  // overlay) on direct visits. The login page is the same form regardless
  // of where the user is going next; AdminLayout takes over naturally
  // after they land on /admin/... post-login.
  const isAdminRoute = router.pathname.startsWith("/admin");

  // Tradesman authenticated pages only — excludes public profile (/tradesman/[id])
  // and login/register which have their own backgrounds
  const TRADESMAN_AUTH_PATHS = new Set([
    "/tradesman/projects",
    "/tradesman/profile/edit",
    "/tradesman/featured",
  ]);
  const isTradesmanRoute = TRADESMAN_AUTH_PATHS.has(router.pathname);

  // Routes that render full-bleed, app-like views without any site chrome
  // (no SiteHeader, no background strip). The page itself is responsible
  // for its own min-h-screen / background.
  const NO_LAYOUT_PATHS = new Set<string>([
    "/projects/[id]/shortlist",
    "/matches",
    "/match/[matchId]",
    "/projects/[id]",
    "/projects",
    "/projects/new",
    "/projects/[id]/edit",
    "/projects/[id]/close",
    "/projects/[id]/recommend",
    "/projects/[id]/recommendations/[recId]",
    "/tradesman/[id]",
    "/builders/[id]",
    "/account",
    "/feedback",
    "/tradesman/register-tradesmen",
    "/tradesman/signup/complete",
    "/tradesman/jobs",
    "/tradesman/jobs/list",
    "/tradesman/matches",
    "/tradesman/leads",
    "/tradesman/account",
    "/tradesman/profile",
    "/tradesman/profile/edit",
    "/tradesman/unlock/sent",
    "/chat/[matchId]",
  ]);
  const isBareRoute = NO_LAYOUT_PATHS.has(router.pathname);

  return (
    <AuthProvider>
      <PostHogProvider>
      <MobileMenuProvider>
      {/* Bootstrap GSID + pageview tracking */}
      <AppBootstrap />

      {/* Cross-tab logout: redirect to homepage when the user logs out
          in another tab and the current path is privately-scoped. */}
      <CrossTabLogoutWatcher />

      {/* Single app-wide SSE connection. Re-broadcasts every server
          notification as a `vmb:notification` DOM CustomEvent so any
          component anywhere can react without each one opening its own
          EventSource. Required for live updates on bare-route pages
          where SiteHeader (and therefore NotificationsBell) is not
          rendered. */}
      <GlobalSseDispatcher />

      {isBareRoute ? (
        <Component {...pageProps} />
      ) : isAdminRoute ? (
        <AdminLayout>
          <Component {...pageProps} />
        </AdminLayout>
      ) : isTradesmanRoute ? (
        <TradesmanLayout>
          <Component {...pageProps} />
        </TradesmanLayout>
      ) : (
        <Layout>
          <Component {...pageProps} />
        </Layout>
      )}

      {/* Global mobile menu — single instance for every route, opened
          via useMobileMenu().openMenu() from any burger button. */}
      <GlobalMobileMenu />

      {/* Global match-formed celebration toast: SSE-driven, shows the
          moment a match_formed notification arrives, regardless of which
          page the user is on. Closes the gap where the first-mover
          doesn't get the celebration screen automatically. */}
      <MatchCelebrationToast />

      {/* LinkedIn-style messaging dock: bottom-right pill that expands
          into a conversation list and floats individual chat windows.
          Desktop only - mobile uses /matches + /chat/:id full pages. */}
      <MessagingDock />

      {/* Global modal portal target (for SignUpGate, etc.) */}
      <div id="modal-root" />
      </MobileMenuProvider>
      </PostHogProvider>
    </AuthProvider>
  );
}
