// web/components/CrossTabLogoutWatcher.tsx
//
// Watches for the user transitioning from authenticated -> unauthenticated
// (typically: another tab clicked Sign out, Firebase propagates the state
// change via IndexedDB to all tabs of the same origin). When that happens
// AND the current path is privately-scoped (homeowner dashboard, account
// settings, owner-only project edit, etc.), redirect to the homepage.
//
// We deliberately do NOT redirect on:
//   - the initial render with no user (covered by the route's own gate)
//   - guest-friendly pages (project view by neighbour, public tradesperson
//     profile, magic-link recommend, all the legal/marketing pages)
//   - explicit /logout / /login / /signup flows (those are already
//     navigating somewhere of their own choice)
//
// The default is "redirect" for any path not matching a known guest-friendly
// pattern - safer than the inverse, because missing a private page from an
// allow-list would leak post-logout content.

import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";

// Paths (or path prefixes) where it's intentionally OK to remain after a
// cross-tab logout. Order doesn't matter; first match wins.
const GUEST_FRIENDLY_PATTERNS: RegExp[] = [
  /^\/$/,                              // home
  /^\/how-it-works(\/|$)/,
  /^\/login(\/|$|\?)/,
  /^\/signup(\/|$|\?)/,                // includes /signup/complete
  /^\/forgot-password/,
  /^\/reset-password/,
  /^\/auth\//,
  /^\/logout/,
  /^\/r\//,                            // magic-link recommend
  /^\/projects\/\d+\/?$/,              // project view (NOT /edit / /recommend / /shortlist)
  /^\/tradesman\/[^/]+\/?$/,           // public tradesperson profile (single segment)
  /^\/tradesman\/login/,
  /^\/tradesman\/register-tradesmen/,
  /^\/tradesman\/featured/,
  /^\/builders/,
  /^\/featured/,
  /^\/contact/,
  /^\/(privacy|terms|cookies|acceptable-use|verified|complaints|moderation|ranking|sub-processors|legal)(\/|$)/,
  /^\/admin\/login/,
  /^\/404/,
];

function isGuestFriendly(path: string): boolean {
  const clean = path.split("?")[0].split("#")[0];
  return GUEST_FRIENDLY_PATTERNS.some((re) => re.test(clean));
}

export default function CrossTabLogoutWatcher() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const previousUserPresentRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (loading) return;

    const isLoggedIn = !!user;
    const wasLoggedIn = previousUserPresentRef.current;
    previousUserPresentRef.current = isLoggedIn;

    // Only act on a true transition from logged-in to logged-out. The
    // initial render is `wasLoggedIn === null` and we ignore it.
    if (wasLoggedIn !== true || isLoggedIn !== false) return;

    const currentPath =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : router.asPath || "/";

    if (isGuestFriendly(currentPath)) {
      // Page is happy to be viewed signed-out; let the page handle its
      // own state swap (e.g. project-view-page swaps owner -> neighbour
      // view based on user prop).
      return;
    }

    // Private page; bounce home.
    router.replace("/");
  }, [user, loading, router]);

  return null;
}
