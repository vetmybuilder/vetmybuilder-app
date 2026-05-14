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
import PushPromptMount from "@/components/PushPromptMount";
import PostHogProvider from "@/components/PostHogProvider";
import { MobileMenuProvider } from "@/utils/mobileMenu";
import GlobalMobileMenu from "@/components/GlobalMobileMenu";
import GlobalSseDispatcher from "@/components/GlobalSseDispatcher";
import GlobalNotificationToast from "@/components/GlobalNotificationToast";
import MessagingDock from "@/components/messaging/MessagingDock";
import TradesmanMessagingDock from "@/components/messaging/TradesmanMessagingDock";
import CookieConsent from "react-cookie-consent";
import Link from "next/link";

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
    "/tradesman/jobs",
    "/tradesman/profile/edit",
  ]);
  const isTradesmanRoute = TRADESMAN_AUTH_PATHS.has(router.pathname);

  // Routes that render full-bleed, app-like views without any site chrome
  // (no SiteHeader, no background strip). The page itself is responsible
  // for its own min-h-screen / background.
  const NO_LAYOUT_PATHS = new Set<string>([
    "/matches",
    "/match/[matchId]",
    "/projects/[id]",
    "/projects",
    "/projects/new",
    "/projects/[id]/edit",
    "/projects/[id]/close",
    "/projects/[id]/completed",
    "/projects/[id]/recommend",
    "/tradesman/[id]",
    "/builders/[id]",
    "/account",
    "/favourites",
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

      {/* Post-signup notifications opt-in modal. Mounts at the _app level
          (not inside Layout) so it survives page-level re-renders and
          works on bare routes like /projects/[id] that don't use Layout. */}
      <PushPromptMount />

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

      {/* Global cookie banner — needs to mount on every route, including
          bare pages (/projects, /matches, /tradesman/*, etc) that bypass
          Layout. Lives outside the route branches so it's truly global. */}
      <CookieConsent
        location="bottom"
        cookieName="vmb_cookie_consent"
        expires={365}
        buttonText="Got it"
        style={{
          background: "#1e293b",
          padding: "12px 20px",
          alignItems: "center",
          fontSize: "13px",
          zIndex: 9999,
        }}
        buttonStyle={{
          background: "linear-gradient(135deg, #6366f1, #4f46e5)",
          color: "#fff",
          borderRadius: "9999px",
          padding: "8px 24px",
          fontWeight: "800",
          fontSize: "13px",
          boxShadow: "0 8px 22px rgba(99,102,241,0.30)",
        }}
      >
        We use cookies to keep you signed in and improve the site. By
        continuing, you accept analytics cookies.{" "}
        <Link
          href="/cookies"
          className="underline text-indigo-300 hover:text-indigo-200"
        >
          Cookie policy
        </Link>
      </CookieConsent>

      {/* Global mobile menu — single instance for every route, opened
          via useMobileMenu().openMenu() from any burger button. */}
      <GlobalMobileMenu />

      {/* Lightweight inline toast for chat / hire / rec notifications,
          triggered from the same SSE stream. Push notifications only fire
          when the tab is backgrounded, so an active foregrounded user
          gets nothing without this. Tap the toast to navigate. */}
      <GlobalNotificationToast />

      {/* LinkedIn-style messaging dock: bottom-right pill that expands
          into a conversation list and floats individual chat windows.
          Desktop only - mobile chat lives at /chat/:id, the dock is
          `hidden md:block`. Scoped to the project detail page only:
          inbox notification clicks route to /projects/:id?openChat=:matchId
          and that page reads the query + pops the dock. /matches has
          its own two-pane inbox, every other surface stays clean. */}
      {router.pathname === "/projects/[id]" && <MessagingDock />}

      {/* Trade-side messaging dock: same LinkedIn-style chrome as the
          homeowner dock but global across every tradesman authenticated
          route. The dock self-hides on full-screen pages (login, signup,
          /chat, /match) via its own HIDE_ON_PATHS allowlist. */}
      {router.pathname.startsWith("/tradesman/") && <TradesmanMessagingDock />}

      {/* Global modal portal target (for SignUpGate, etc.) */}
      <div id="modal-root" />
      </MobileMenuProvider>
      </PostHogProvider>
    </AuthProvider>
  );
}
