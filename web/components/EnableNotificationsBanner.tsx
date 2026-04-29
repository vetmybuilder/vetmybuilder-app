// web/components/EnableNotificationsBanner.tsx
//
// Slim inline "Notifications are off - turn on" banner. Drop this near
// the top of any page where the user might wonder why pushes aren't
// firing (Messages, /account, etc).
//
// Behaviour:
//   - Hides itself if the browser already has Notification.permission
//     === 'granted' (we're already subscribed, or the user can subscribe
//     silently later)
//   - Hides if the browser doesn't support push at all (SSR, very old
//     browsers, iOS Safari in regular tab mode)
//   - Hides if the user has dismissed it this session
//   - Tap "Turn on" -> requests permission, subscribes via service worker,
//     POSTs to /api/push/subscribe (same flow as PushPrompt)
//
// iOS gotcha: web push only works once the site is added to the home
// screen and opened from there (PWA mode). In a regular Safari tab the
// API is not available - the banner detects that and shows an "iOS:
// Add to home screen first" hint instead of the Turn on button.

import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";

const SESSION_DISMISS_KEY = "vmb:notifBannerDismissed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Status =
  | "loading"
  | "hidden"            // permission granted, or user dismissed
  | "needs-permission"  // browser supports push, just not granted yet
  | "ios-add-to-home"   // iOS Safari in regular tab - PWA mode required
  | "blocked"           // user previously denied permission
  | "unsupported";      // no push API at all

function detectStatus(): Status {
  if (typeof window === "undefined") return "loading";
  if (typeof Notification === "undefined") {
    // iOS standalone-only quirk: Notification API is missing in regular
    // Safari tabs but exists once the page is added to the home screen.
    const ua = window.navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isStandalone =
      (window.navigator as any).standalone === true ||
      window.matchMedia?.("(display-mode: standalone)").matches;
    if (isIOS && !isStandalone) return "ios-add-to-home";
    return "unsupported";
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "hidden";
  if (Notification.permission === "denied") return "blocked";
  return "needs-permission";
}

export default function EnableNotificationsBanner() {
  const api = useApi();
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Defer to client render so SSR doesn't try to read Notification.
    let dismissedThisSession = false;
    try {
      dismissedThisSession =
        sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
    } catch {
      /* sessionStorage might be blocked - assume not dismissed */
    }
    if (dismissedThisSession) {
      setStatus("hidden");
      return;
    }
    setStatus(detectStatus());
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
    setStatus("hidden");
  }

  async function enable() {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        // User declined the OS prompt - hide for the session.
        dismiss();
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        // Server config missing - hide silently rather than nagging.
        dismiss();
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      await api.post("/api/push/subscribe", subscription.toJSON());
      setStatus("hidden");
    } catch {
      // Anything fails -> hide for the session.
      dismiss();
    } finally {
      setBusy(false);
    }
  }

  if (status === "hidden" || status === "loading" || status === "unsupported") {
    return null;
  }

  // iOS Safari in a regular tab - direct user to add to home screen.
  if (status === "ios-add-to-home") {
    return (
      <div
        className="mx-5 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3"
        data-testid="enable-notifications-banner-ios"
      >
        <div className="flex items-start gap-3">
          <span
            className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-base shrink-0"
            aria-hidden
          >
            🔔
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold text-amber-900 leading-tight">
              Get notifications on iPhone
            </div>
            <div className="text-[11.5px] text-amber-800 leading-snug mt-0.5">
              Tap the share icon in Safari, then "Add to Home Screen". Open VetMyBuilder from there to get push alerts.
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-amber-700 text-[16px] font-bold w-7 h-7 -mr-1 -mt-1 shrink-0"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // User previously denied - we can't re-prompt, so direct them to
  // toggle it in their browser settings.
  if (status === "blocked") {
    return (
      <div
        className="mx-5 mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3"
        data-testid="enable-notifications-banner-blocked"
      >
        <div className="flex items-start gap-3">
          <span
            className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-base shrink-0"
            aria-hidden
          >
            🔕
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold text-slate-900 leading-tight">
              Notifications blocked
            </div>
            <div className="text-[11.5px] text-slate-600 leading-snug mt-0.5">
              You'll miss new messages from builders. Open your browser's site settings to allow notifications.
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-slate-500 text-[16px] font-bold w-7 h-7 -mr-1 -mt-1 shrink-0"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // needs-permission - the happy CTA path.
  return (
    <div
      className="mx-5 mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 px-3.5 py-3"
      data-testid="enable-notifications-banner"
    >
      <div className="flex items-start gap-3">
        <span
          className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-base shrink-0"
          aria-hidden
        >
          🔔
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-extrabold text-slate-900 leading-tight">
            Turn on notifications
          </div>
          <div className="text-[11.5px] text-slate-600 leading-snug mt-0.5">
            Get a push when a builder replies. You can switch off any time.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 text-white px-3 py-1.5 text-[12px] font-extrabold shadow-sm disabled:opacity-60"
            >
              {busy && (
                <svg
                  className="h-3.5 w-3.5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-25"
                  />
                  <path
                    d="M4 12a8 8 0 018-8"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="opacity-75"
                  />
                </svg>
              )}
              {busy ? "Turning on…" : "Turn on"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              className="text-[12px] font-bold text-slate-500 px-2 py-1.5"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
