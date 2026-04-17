// web/components/PushPrompt.tsx
import { useState } from "react";
import { useApi } from "@/utils/api";

const LS_KEY = "vmb:pushSetupShown";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushPrompt({ onComplete }: { onComplete: () => void }) {
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
    } catch {
      // If anything fails, still dismiss so we don't nag
    }

    dismiss();
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 text-center">
        {/* Bell icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <svg className="h-7 w-7 text-red-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M14 19a2 2 0 1 1-4 0m-5-1h14c-.9-1.2-1.6-2.3-1.6-5.1 0-3.5-2.2-6.4-5.4-6.9-3.4-.6-6 2.1-6 5.7 0 2.8-.7 3.9-2 6.3Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-zinc-900">Stay in the loop</h2>

        <p className="mt-2 text-sm text-zinc-500 leading-relaxed">
          Get notified when builders respond, neighbours recommend, or new
          projects match your area. You can change this anytime in settings.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="w-full rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Setting up..." : "Enable notifications"}
          </button>

          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="w-full rounded-full px-6 py-3 text-sm font-semibold text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
