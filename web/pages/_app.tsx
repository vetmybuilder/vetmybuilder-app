// web/pages/_app.tsx
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { AuthProvider } from "@/utils/auth";
import Layout from "@/components/Layout";
import * as React from "react";
import { useRouter } from "next/router";
// import SignUpGateModal from "@/components/SignUpGateModal";
// NEW: incoming chat notifier (toast + modal)
// import IncomingChatNotifier from "@/components/chat/IncomingChatNotifier";

// NEW: minimal auth-path helper (local to _app only)
const AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/auth/complete",
  "/tradesman/login",
  "/tradesman/register",
]);

function isAuthPath(pathname: string) {
  // strip any query/hash
  const p = pathname.split("?")[0].split("#")[0];
  return AUTH_PATHS.has(p);
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

    // --- NEW: remember last non-auth route for cleaner post-login redirect
    try {
      const here = router.asPath || "/";
      const pathname = new URL(here, window.location.origin).pathname;
      if (!isAuthPath(pathname)) {
        sessionStorage.setItem("vmb:lastNonAuth", here);
        // If no explicit returnTo set yet, default it to the current non-auth page
        if (!sessionStorage.getItem("vmb:returnTo")) {
          sessionStorage.setItem("vmb:returnTo", here);
        }
      }
    } catch {
      /* noop */
    }

    // Initial page view
    dispatchPageView(router.asPath, gsid);

    // Track subsequent route changes
    const onRoute = (url: string) => {
      // url is usually a path like "/projects?tab=mine"
      try {
        const pathname = new URL(url, window.location.origin).pathname;
        if (!isAuthPath(pathname)) {
          sessionStorage.setItem("vmb:lastNonAuth", url);
          if (!sessionStorage.getItem("vmb:returnTo")) {
            sessionStorage.setItem("vmb:returnTo", url);
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
      })
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
  return (
    <AuthProvider>
      {/* Bootstrap GSID + pageview tracking */}
      <AppBootstrap />

      <Layout>
        <Component {...pageProps} />
        {/* Mount the global Sign-up Gate modal once */}
        {/* <SignUpGateModal /> */}
      </Layout>

      {/* NEW: global incoming chat listener + toast/modal */}
      {/* <IncomingChatNotifier /> */}

      {/* Global modal portal target (for SignUpGate, etc.) */}
      <div id="modal-root" />
    </AuthProvider>
  );
}
