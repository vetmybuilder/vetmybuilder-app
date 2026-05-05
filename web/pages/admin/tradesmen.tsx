// web/pages/admin/tradesmen.tsx
//
// DEPRECATED 2026-04-29 — superseded by /admin/tradesmen-leaderboard,
// which has the same status / flag / subscription / spotlight controls
// in a richer Actions modal alongside the leaderboard ranking signals.
// This route now redirects there instead of re-rendering its own list.
//
// Kept as a stub (rather than deleted) for two reasons:
//   1. There may still be inbound links from older admin docs / bookmarks
//      / E2E tests pointing at /admin/tradesmen. Redirecting keeps them
//      working.
//   2. If anything turns out to depend on the old behaviour (a workflow
//      we missed during this consolidation), restoring the previous
//      implementation only needs `git revert` rather than a recreate.
//
// TODO(post-soak): once we're confident nothing else needs this path,
// delete this file and the route. Soak window: at least one full QA
// cycle through the new admin journey.

import { useEffect } from "react";
import { useRouter } from "next/router";

export default function AdminTradesmenRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/tradesmen-leaderboard");
  }, [router]);
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-slate-500">
      Tradesmen admin moved — taking you to{" "}
      <a
        href="/admin/tradesmen-leaderboard"
        className="font-bold text-indigo-600 underline"
      >
        /admin/tradesmen-leaderboard
      </a>
      …
    </div>
  );
}
