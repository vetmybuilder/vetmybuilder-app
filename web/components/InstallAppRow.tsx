// web/components/InstallAppRow.tsx
//
// Account-page row that surfaces an "Install our app" prompt to mobile
// users only. Self-contained mobile detection - the row simply doesn't
// render on desktop or in already-installed PWA contexts. Replaces the
// global AddToHomeScreenToast which had bugs surfacing on desktop.
//
// Detection rules (all must pass for the row to render):
//   - Client-side only (no SSR)
//   - Viewport width <  768px (Tailwind md breakpoint)
//   - Not running as a standalone PWA (already installed)
//   - User-agent looks like iOS Safari OR Android Chrome
//
// Rendering: same row shape as the other /account hub rows so it
// blends in. Tapping opens an inline drawer with the install
// instructions appropriate to the platform (iOS = Share -> Add to
// home screen; Android = native install prompt via beforeinstallprompt).

import { useEffect, useRef, useState } from "react";

type Platform = "ios" | "android" | null;

function detectPlatform(): Platform {
  if (typeof window === "undefined") return null;
  if ((navigator as any).standalone === true) return null;
  if (window.matchMedia("(display-mode: standalone)").matches) return null;
  if (window.matchMedia("(min-width: 768px)").matches) return null;

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  if (isIOS && isSafari) return "ios";

  const isAndroid = /Android/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edge|OPR/.test(ua);
  if (isAndroid && isChrome) return "android";

  return null;
}

export default function InstallAppRow() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [open, setOpen] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  useEffect(() => {
    const p = detectPlatform();
    if (!p) return;
    setPlatform(p);

    if (p === "android") {
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPromptRef.current = e;
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
  }, []);

  if (!platform) return null;

  async function handleAndroidInstall() {
    const prompt = deferredPromptRef.current;
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice;
      deferredPromptRef.current = null;
    }
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full bg-white md:rounded-2xl md:shadow-sm flex items-center gap-3 text-left"
        style={{ padding: 14 }}
        data-testid="install-app-row"
      >
        <div
          className="rounded-xl flex items-center justify-center shrink-0"
          style={{ width: 40, height: 40, borderRadius: 11, background: "#eef2ff", fontSize: 18 }}
        >
          📱
        </div>
        <span className="flex-1 text-[14.5px] font-extrabold text-gray-900">
          Install our app
        </span>
        <span className="text-[11px] font-extrabold rounded-full bg-indigo-50 text-indigo-700" style={{ padding: "5px 10px" }}>
          Free
        </span>
        <span className="text-gray-300 text-[18px] shrink-0 ml-1">›</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="install-title"
              className="text-[20px] font-black tracking-tight text-slate-900"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Install VetMyBuilder
            </h2>
            <p className="mt-2 text-[13.5px] text-slate-600 leading-relaxed">
              Get the app on your home screen for quicker access and push
              notifications.
            </p>

            {platform === "ios" ? (
              <ol className="mt-4 space-y-3 text-[13.5px] text-slate-700">
                <li className="flex gap-2">
                  <span className="font-extrabold text-indigo-700">1.</span>
                  Tap the{" "}
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-slate-700 mx-0.5">
                    ⬆
                  </span>{" "}
                  Share button at the bottom of Safari.
                </li>
                <li className="flex gap-2">
                  <span className="font-extrabold text-indigo-700">2.</span>
                  Scroll and tap <strong>Add to Home Screen</strong>.
                </li>
                <li className="flex gap-2">
                  <span className="font-extrabold text-indigo-700">3.</span>
                  Tap <strong>Add</strong> in the top-right.
                </li>
              </ol>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleAndroidInstall}
                  className="w-full inline-flex items-center justify-center py-3 rounded-2xl text-white font-extrabold text-[14px] shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                    boxShadow: "0 8px 22px rgba(99,102,241,0.3)",
                  }}
                >
                  Install now
                </button>
                <p className="mt-3 text-[12px] text-slate-500 text-center">
                  If the prompt doesn&apos;t appear, tap your browser&apos;s
                  menu and choose <strong>Install app</strong>.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full mt-4 inline-flex items-center justify-center py-2.5 rounded-2xl bg-white border border-slate-300 text-slate-700 font-extrabold text-[13px]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
