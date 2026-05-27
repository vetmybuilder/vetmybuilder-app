// web/components/GlobalNotificationToast.tsx
//
// Toast that appears top-centre when a `vmb:notification` event fires,
// for in-app pages where push notifications wouldn't reach the user
// (push only fires when the tab is backgrounded or the device is asleep,
// so without this an active foregrounded user gets no signal that a chat
// message just arrived). Tapping the toast navigates to its linkPath.
//
// Suppresses when the user is already on the destination page (e.g. an
// open chat thread for the same matchId) — re-toasting on a page they're
// already looking at is just noise.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MessageCircle, Sparkles, Bell } from "lucide-react";
import { useAuth } from "@/utils/auth";

type NotifPayload = {
  type?: string;
  message?: string;
  projectId?: number | string | null;
  linkPath?: string | null;
};

type ToastItem = {
  id: number;
  payload: NotifPayload;
};

const AUTO_DISMISS_MS = 5000;

export default function GlobalNotificationToast() {
  const router = useRouter();
  const { user } = useAuth();
  const isTradesman = !!user?.isTradesman;
  const [toast, setToast] = useState<ToastItem | null>(null);

  // Hold router.asPath in a ref so the listener can read the latest
  // path WITHOUT re-binding every navigation (re-binding kills the
  // active dismiss timer and orphans the visible toast on click-through).
  const asPathRef = useRef(router.asPath);
  useEffect(() => {
    asPathRef.current = router.asPath;
  }, [router.asPath]);

  useEffect(() => {
    if (typeof window === "undefined" || !user) return;

    let nextId = 1;

    function onNotif(ev: Event) {
      const detail = (ev as CustomEvent).detail as NotifPayload | undefined;
      if (!detail) return;

      // Suppress if the user is already viewing the destination. asPath
      // includes query string, so prefix-match against linkPath.
      if (detail.linkPath && asPathRef.current.split("?")[0] === detail.linkPath) {
        return;
      }

      // Only toast for types the user can act on. Bell-only types (e.g.
      // local_activity) stay in the bell without interrupting.
      const TOAST_TYPES = new Set([
        "chat_message_new",
        "match_formed",
        "hire_completed",
        "hire_status_change",
        "recommendation_new",
        "tradesman_paid_unlock",
        "homeowner_swiped",
        // Grant funnel: homeowner gets a one-off prompt after posting
        // an insulation job; the assigned specialist (Elegant) gets
        // each new lead routed to them. Both are actionable in-app.
        "grant_opportunity",
        "grant_lead_assigned",
      ]);
      if (!detail.type || !TOAST_TYPES.has(detail.type)) return;

      const id = nextId++;
      setToast({ id, payload: detail });
    }

    window.addEventListener("vmb:notification", onNotif);
    return () => {
      window.removeEventListener("vmb:notification", onNotif);
    };
  }, [user]);

  // Auto-dismiss tied to the active toast id. Re-runs only when the
  // toast itself changes (new toast OR manual dismiss), so navigation
  // can't cancel the timer mid-flight.
  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const t = setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast?.id]);

  if (!toast) return null;

  const { type, message, linkPath } = toast.payload;
  const Icon =
    type === "chat_message_new"
      ? MessageCircle
      : type === "match_formed"
        ? Sparkles
        : Bell;
  // Brand palette: emerald for tradespeople, indigo for homeowners.
  // Every notification (incl. match_formed) follows the viewer's role
  // so the toast reads as "from this app" instead of a generic alert.
  const tone = isTradesman
    ? "from-emerald-500 to-emerald-600"
    : "from-indigo-500 to-indigo-600";

  return (
    <button
      type="button"
      onClick={() => {
        if (linkPath) {
          // Grant funnel notifications open in a new tab so the user
          // keeps their VMB session in place.
          if (type === "grant_opportunity") {
            window.open(linkPath, "_blank", "noopener,noreferrer");
          } else {
            router.push(linkPath);
          }
        }
        setToast(null);
      }}
      className={`fixed left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2.5 rounded-full px-4 py-2.5 text-white text-[13px] font-bold shadow-lg max-w-[calc(100vw-32px)] bg-gradient-to-r ${tone}`}
      style={{
        top: "calc(env(safe-area-inset-top) + 12px)",
        boxShadow: "0 10px 28px rgba(15,23,42,0.18)",
      }}
      role="status"
      aria-live="polite"
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate text-left">{message || "New notification"}</span>
    </button>
  );
}
