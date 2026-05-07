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
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    let nextId = 1;
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;

    function onNotif(ev: Event) {
      const detail = (ev as CustomEvent).detail as NotifPayload | undefined;
      if (!detail) return;

      // Suppress if the user is already viewing the destination. asPath
      // includes query string, so prefix-match against linkPath.
      if (detail.linkPath && router.asPath.split("?")[0] === detail.linkPath) {
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
      ]);
      if (!detail.type || !TOAST_TYPES.has(detail.type)) return;

      if (dismissTimer) clearTimeout(dismissTimer);
      const id = nextId++;
      setToast({ id, payload: detail });
      dismissTimer = setTimeout(() => {
        setToast((cur) => (cur?.id === id ? null : cur));
      }, AUTO_DISMISS_MS);
    }

    window.addEventListener("vmb:notification", onNotif);
    return () => {
      window.removeEventListener("vmb:notification", onNotif);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, [router.asPath]);

  if (!toast) return null;

  const { type, message, linkPath } = toast.payload;
  const Icon =
    type === "chat_message_new"
      ? MessageCircle
      : type === "match_formed"
        ? Sparkles
        : Bell;
  // Brand palette: emerald for tradespeople, indigo for homeowners.
  // match_formed uses emerald in both flows because it's a celebratory
  // event and emerald is the shared "yes" colour across the app.
  const brandTone = isTradesman
    ? "from-emerald-500 to-emerald-600"
    : "from-indigo-500 to-indigo-600";
  const tone =
    type === "match_formed" ? "from-emerald-500 to-emerald-600" : brandTone;

  return (
    <button
      type="button"
      onClick={() => {
        if (linkPath) router.push(linkPath);
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
