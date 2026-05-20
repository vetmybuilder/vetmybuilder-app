// web/components/PostHogProvider.tsx
// Initialises PostHog on page load. Cookie banner informs users about analytics.
// Wraps the app in _app.tsx. Tracks page views automatically.

import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import posthog from "posthog-js";
import { useAuth } from "@/utils/auth";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  const initialised = useRef(false);

  // Initialise PostHog on page load
  useEffect(() => {
    if (!POSTHOG_KEY || initialised.current) return;
    initialised.current = true;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      capture_pageview: true, // captures initial page load; routeChangeComplete handles SPA navigations
      capture_pageleave: true,
      autocapture: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "[data-ph-mask]",
      },
      persistence: "localStorage+cookie",
    });
  }, []);

  // Identify user when they log in
  useEffect(() => {
    if (!initialised.current || !posthog.__loaded) return;
    if (user) {
      posthog.identify(user.uid, {
        email: user.email || undefined,
        name: user.firstName
          ? `${user.firstName} ${user.lastName || ""}`.trim()
          : undefined,
      });
    } else {
      posthog.reset();
    }
  }, [user]);

  // Track page views on route change
  useEffect(() => {
    const handleRouteChange = () => {
      if (initialised.current && posthog.__loaded) {
        posthog.capture("$pageview");
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  // Capture uncaught JS errors + unhandled promise rejections as
  // `client_error` events. Admin pages are excluded so internal-only
  // debugging noise doesn't pollute the product event stream.
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onAdminPath() {
      return window.location.pathname.startsWith("/admin/");
    }

    function handleError(ev: ErrorEvent) {
      if (onAdminPath()) return;
      posthog.capture("client_error", {
        message: ev.message || "unknown",
        filename: ev.filename || null,
        lineno: ev.lineno || null,
        colno: ev.colno || null,
        stack: ev.error?.stack || null,
        path: window.location.pathname,
      });
    }

    function handleRejection(ev: PromiseRejectionEvent) {
      if (onAdminPath()) return;
      const reason: any = ev.reason;
      posthog.capture("client_error", {
        kind: "unhandled_rejection",
        message: reason?.message || String(reason || "unknown"),
        stack: reason?.stack || null,
        path: window.location.pathname,
      });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return <>{children}</>;
}
