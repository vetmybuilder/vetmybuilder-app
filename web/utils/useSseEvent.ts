// web/utils/useSseEvent.ts
//
// Reusable hook that opens a single SSE connection to /api/notifications/stream
// and calls `onEvent` whenever an event matching `eventName` arrives.
//
// Auth-token-in-URL pattern mirrors NotificationsBell.tsx.
// Reconnects once after a 2-second delay on error, then gives up (to avoid
// hammering the server if the user is offline or not authenticated).
//
// Usage:
//   useSseEvent("chat_message", (data) => { ... });

import { useEffect, useRef } from "react";
import { useAuth } from "./auth";

/** Compute the base URL for SSE — bypasses Next.js proxy buffering in dev. */
function getSseBase(): string {
  if (typeof window === "undefined") return "";
  const loc = window.location;
  if (loc.hostname === "localhost" && loc.port === "3000") {
    return `${loc.protocol}//localhost:3100`;
  }
  return loc.origin;
}

/**
 * @param eventName  SSE event type to listen for (e.g. "chat_message")
 * @param onEvent    Callback receiving the parsed JSON payload
 * @param enabled    When false the connection is not opened (default: true)
 */
export function useSseEvent<T = unknown>(
  eventName: string,
  onEvent: (data: T) => void,
  enabled = true,
): void {
  const { user, token: authToken } = useAuth();
  // Keep a stable ref to the callback so changes don't trigger reconnects
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !user) return;

    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (cancelled) return;

      try {
        // Prefer a freshly-minted token over the potentially-stale context one
        const fbAuth = (window as any).firebaseAuth;
        const freshToken = fbAuth?.currentUser
          ? await fbAuth.currentUser.getIdToken()
          : null;
        const token = freshToken || authToken;
        if (!token || cancelled) return;

        const sseBase = getSseBase();
        const url = `${sseBase}/api/notifications/stream?token=${encodeURIComponent(token)}`;
        es = new EventSource(url);

        es.addEventListener(eventName, (ev: MessageEvent) => {
          if (cancelled) return;
          try {
            const parsed = JSON.parse(ev.data) as T;
            callbackRef.current(parsed);
          } catch {
            /* malformed JSON — ignore */
          }
        });

        es.onerror = () => {
          if (es) {
            es.close();
            es = null;
          }
          // One reconnect attempt after 2 s
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
      if (es) {
        es.close();
        es = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
  }, [user, authToken, eventName, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
