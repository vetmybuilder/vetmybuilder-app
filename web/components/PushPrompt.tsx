// web/components/PushPrompt.tsx
import { useState } from "react";
import { Bell } from "lucide-react";
import { useApi } from "@/utils/api";
import { trackPushEnabled, trackPushSkipped } from "@/utils/analytics";

const LS_KEY = "vmb:pushSetupShown";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushPrompt({ onComplete, isTradesman = false }: { onComplete: () => void; isTradesman?: boolean }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);

  function dismiss() {
    try { localStorage.setItem(LS_KEY, "1"); } catch {}
    onComplete();
  }

  async function enable() {
    if (busy) return;
    setBusy(true);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        dismiss();
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        dismiss();
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      await api.post("/api/push/subscribe", subscription.toJSON());

      // Write default preferences so the settings page shows them as "on"
      await api.put("/api/notifications/preferences", {
        hire_updates: true,
        recommendations: true,
        builder_interest: true,
        local_activity: false,
        project_matches: true,
      });
      trackPushEnabled();
    } catch {
      // If anything fails, still dismiss so we don't nag
    }

    dismiss();
  }

  // Tradespeople use the emerald palette; homeowners the indigo one
  // (matches the rest of the app's role-based brand colours).
  const accent = isTradesman
    ? {
        iconBg: "linear-gradient(135deg, #6ee7b7, #10b981)",
        iconShadow: "0 12px 28px rgba(16,185,129,0.30)",
        ctaBg: "linear-gradient(135deg, #10b981, #059669)",
        ctaShadow: "0 8px 22px rgba(16,185,129,0.30)",
        accentText: "text-emerald-600",
      }
    : {
        iconBg: "linear-gradient(135deg, #a5b4fc, #6366f1)",
        iconShadow: "0 12px 28px rgba(99,102,241,0.30)",
        ctaBg: "linear-gradient(135deg, #6366f1, #4f46e5)",
        ctaShadow: "0 8px 22px rgba(99,102,241,0.30)",
        accentText: "text-indigo-600",
      };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ background: "rgba(15,23,42,0.55)" }}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white border border-amber-100 shadow-2xl shadow-indigo-200/30 px-6 py-7 text-center"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
      >
        {/* Bell icon */}
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-white"
          style={{ background: accent.iconBg, boxShadow: accent.iconShadow }}
        >
          <Bell className="h-7 w-7" />
        </div>

        <h2
          className="text-[22px] font-extrabold tracking-tight text-slate-900 leading-tight"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Stay in the{" "}
          <span
            className={accent.accentText}
            style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
          >
            loop
          </span>
        </h2>

        <p className="mt-2 text-[13.5px] text-slate-500 leading-relaxed">
          {isTradesman
            ? "Get notified when homeowners post jobs in your area, when you're recommended, or when you receive a hire request. You can change this anytime in settings."
            : "Get notified when tradespeople respond, your community recommends, or new jobs match your area. You can change this anytime in settings."}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-extrabold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: busy
                ? "linear-gradient(135deg, #94a3b8, #64748b)"
                : accent.ctaBg,
              boxShadow: busy ? undefined : accent.ctaShadow,
            }}
          >
            {busy && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
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
            {busy ? "Setting up…" : "Enable notifications"}
          </button>

          <button
            type="button"
            onClick={() => {
              trackPushSkipped();
              dismiss();
            }}
            disabled={busy}
            className="w-full rounded-full px-6 py-2.5 text-[12.5px] font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
