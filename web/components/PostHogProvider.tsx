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
      capture_pageview: false, // we handle this manually on route change
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

  return <>{children}</>;
}
