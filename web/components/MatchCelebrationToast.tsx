// web/components/MatchCelebrationToast.tsx
//
// Globally-mounted SSE listener that pops a celebration toast the moment
// a `match_formed` notification arrives. Bridges the gap where the
// FIRST-mover (homeowner who swiped earlier OR builder who swiped earlier)
// doesn't see /match/<matchId> directly because their swipe POST didn't
// flip the row to matched - the SECOND-mover got the redirect.
//
// Behaviour:
// - Slides in from the top with confetti, other-party copy, and a CTA
// - Tap routes to /match/<matchId> (the celebration page) regardless of
//   whether the SSE payload's linkPath was /match/... or /chat/...
// - Auto-dismisses after 8 seconds, or stays until tapped/dismissed
// - Multiple matches in quick succession queue (only one shown at a time)

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { Sparkles, X } from "lucide-react";

interface MatchEvent {
  matchId: number;
  message: string;
  receivedAt: number;
}

function getSseBase(): string {
  if (typeof window === "undefined") return "";
  const loc = window.location;
  if (loc.hostname === "localhost" && loc.port === "3000") {
    return `${loc.protocol}//localhost:3100`;
  }
  return loc.origin;
}

/** Pull the match id out of "/match/123" or "/chat/123" links. */
function extractMatchId(linkPath: string | null | undefined): number | null {
  if (!linkPath) return null;
  const m = String(linkPath).match(/\/(?:match|chat)\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export default function MatchCelebrationToast() {
  const router = useRouter();
  const { user, token: authToken } = useAuth();
  const [queue, setQueue] = useState<MatchEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── SSE connection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (cancelled) return;
      try {
        const fbAuth = (window as any).firebaseAuth;
        const freshToken = fbAuth?.currentUser
          ? await fbAuth.currentUser.getIdToken()
          : null;
        const token = freshToken || authToken;
        if (!token || cancelled) return;

        const sseBase = getSseBase();
        const url = `${sseBase}/api/notifications/stream?token=${encodeURIComponent(token)}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.addEventListener("notification", (ev: MessageEvent) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse(ev.data);
            if (payload?.type !== "match_formed") return;
            const matchId = extractMatchId(payload.linkPath);
            if (!matchId) return;
            // Don't double-queue the same match if multiple notifications
            // arrive (homeowner + tradesman copies both fire).
            setQueue((prev) =>
              prev.some((e) => e.matchId === matchId)
                ? prev
                : [
                    ...prev,
                    {
                      matchId,
                      message: String(payload.message || "It's a match!"),
                      receivedAt: Date.now(),
                    },
                  ],
            );
          } catch {
            /* ignore malformed events */
          }
        });

        es.onerror = () => {
          if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
          }
          if (!cancelled) {
            reconnectTimer = setTimeout(() => {
              if (!cancelled) connect();
            }, 2000);
          }
        };
      } catch {
        /* ignore token errors */
      }
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [user, authToken]);

  // ── Auto-dismiss after 8s ─────────────────────────────────────────────────
  const current = queue[0] ?? null;
  useEffect(() => {
    if (!current) return;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setQueue((prev) => prev.slice(1));
    }, 8000);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [current?.matchId]);

  // Hide the toast on the celebration page itself - we're already there.
  const onCelebrationPage =
    router.pathname === "/match/[matchId]" &&
    current &&
    String(router.query.matchId) === String(current.matchId);

  if (!current || onCelebrationPage) return null;

  function dismiss() {
    setQueue((prev) => prev.slice(1));
  }

  function open() {
    if (!current) return;
    router.push(`/match/${current.matchId}`);
    dismiss();
  }

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 top-3 z-[10000] w-[calc(100%-1.5rem)] max-w-[420px]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      role="alert"
      aria-live="polite"
      data-testid="match-celebration-toast"
    >
      <button
        type="button"
        onClick={open}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left shadow-[0_12px_32px_rgba(99,102,241,0.35)] animate-in slide-in-from-top duration-300"
        style={{
          background: "linear-gradient(135deg, #6366f1, #4338ca)",
        }}
      >
        <span className="shrink-0 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-extrabold text-white truncate">
            {current.message}
          </span>
          <span className="block text-[11.5px] font-bold text-white/80 mt-0.5">
            Tap to see it
          </span>
        </span>
        <span
          role="button"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="shrink-0 w-7 h-7 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center"
        >
          <X className="w-4 h-4 text-white" />
        </span>
      </button>
    </div>
  );
}
