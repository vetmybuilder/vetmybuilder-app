// web/components/GlobalSseDispatcher.tsx
//
// Single, app-wide SSE listener mounted in _app.tsx. Opens one connection
// to /api/notifications/stream when a user is signed in, and re-emits
// every "notification" event as a `vmb:notification` DOM CustomEvent so
// any component anywhere in the tree can react to it without each one
// opening its own EventSource.
//
// This existed inside NotificationsBell before, but the bell only
// renders inside SiteHeader — and the mobile bare routes (/projects,
// /projects/[id], /matches, /match/[matchId], etc.) don't render
// SiteHeader at all, so on mobile no SSE connection was ever opened
// and no `vmb:notification` event ever fired. Lifting it to the global
// shell fixes live updates everywhere.
//
// NotificationsBell still owns its own bootstrap fetch and unread-count
// UI; it just listens to the same DOM event everyone else does, instead
// of running its own duplicate stream.
import { useEffect } from "react";
import { useAuth } from "@/utils/auth";

function getSseBase(): string {
  if (typeof window === "undefined") return "";
  const loc = window.location;
  if (loc.hostname === "localhost" && loc.port === "3000") {
    return `${loc.protocol}//localhost:3100`;
  }
  return loc.origin;
}

export default function GlobalSseDispatcher() {
  const { user, token: authToken } = useAuth();

  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (cancelled) return;

      try {
        const fbAuth = (window as any).firebaseAuth;
        const fbToken = fbAuth?.currentUser
          ? await fbAuth.currentUser.getIdToken()
          : null;
        const token = fbToken || authToken;
        if (!token || cancelled) return;

        const sseBase = getSseBase();
        if (!sseBase) return;

        const url = `${sseBase}/api/notifications/stream?token=${encodeURIComponent(token)}`;
        es = new EventSource(url);

        es.addEventListener("bootstrap", () => {
          if (cancelled) return;
          window.dispatchEvent(new CustomEvent("vmb:bootstrap"));
        });

        es.addEventListener("notification", (ev: MessageEvent) => {
          if (cancelled) return;
          try {
            const detail = JSON.parse(ev.data);
            window.dispatchEvent(
              new CustomEvent("vmb:notification", { detail }),
            );
          } catch {
            /* malformed JSON — ignore */
          }
        });

        es.onerror = () => {
          if (es) {
            es.close();
            es = null;
          }
          if (!cancelled) {
            reconnectTimer = setTimeout(() => {
              if (!cancelled) connect();
            }, 2000);
          }
        };
      } catch {
        /* token errors — give up */
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
  }, [user, authToken]);

  return null;
}
