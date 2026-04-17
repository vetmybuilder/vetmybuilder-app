// web/components/AddToHomeScreenToast.tsx
import { useEffect, useRef, useState } from "react";

const LS_KEY = "vmb:homeScreenPromptShown";

type Platform = "ios" | "android" | null;

function detectPlatform(): Platform {
  if (typeof window === "undefined") return null;
  const ua = navigator.userAgent;

  // Already installed as PWA
  if ((navigator as any).standalone === true) return null;
  if (window.matchMedia("(display-mode: standalone)").matches) return null;

  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  if (isIOS && isSafari) return "ios";

  const isAndroid = /Android/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edge|OPR/.test(ua);
  if (isAndroid && isChrome) return "android";

  return null;
}

export default function AddToHomeScreenToast() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [platform, setPlatform] = useState<Platform>(null);
  const deferredPromptRef = useRef<any>(null);

  useEffect(() => {
    const p = detectPlatform();
    if (!p) return;

    try {
      if (localStorage.getItem(LS_KEY)) return;
    } catch {}

    // Wait for cookie consent to be accepted first
    const hasCookieConsent = document.cookie.includes("vmb_cookie_consent");
    if (!hasCookieConsent) {
      // Check periodically until cookie is accepted
      const interval = setInterval(() => {
        if (document.cookie.includes("vmb_cookie_consent")) {
          clearInterval(interval);
          setPlatform(p);
          setTimeout(() => setVisible(true), 1000);
        }
      }, 1000);
      return () => clearInterval(interval);
    }

    setPlatform(p);

    // Android: capture the native install prompt
    if (p === "android") {
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPromptRef.current = e;
      };
      window.addEventListener("beforeinstallprompt", handler);

      const timer = setTimeout(() => setVisible(true), 2000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    // iOS: just show after delay
    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(LS_KEY, "1"); } catch {}
  }

  async function handleAndroidInstall() {
    const prompt = deferredPromptRef.current;
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice;
      deferredPromptRef.current = null;
    }
    dismiss();
  }

  if (!visible || !platform) return null;

  return (
    <div className="fixed bottom-4 left-3 right-3 z-[9997]">
      {expanded ? (
        <div className="bg-zinc-900 rounded-2xl p-5 shadow-2xl shadow-black/30">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xl">&#128241;</span>
            <span className="text-white text-sm font-bold flex-1">Add to home screen</span>
            <button
              onClick={dismiss}
              className="text-zinc-500 hover:text-white text-lg"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          {platform === "ios" ? (
            <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-md bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
                <p className="text-zinc-300 text-sm">
                  Tap the <strong className="text-white">Share</strong> button
                  <span className="inline-flex items-center justify-center mx-1 w-5 h-5 border border-blue-400 rounded text-blue-400 text-[10px] align-middle">&#8593;</span>
                  in Safari
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-md bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
                <p className="text-zinc-300 text-sm">
                  Tap <strong className="text-white">"Add to Home Screen"</strong>
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-800 rounded-xl p-4">
              <p className="text-zinc-300 text-sm">
                Tap the button below to install VetMyBuilder on your home screen for quick access.
              </p>
            </div>
          )}

          <button
            onClick={platform === "android" ? handleAndroidInstall : dismiss}
            className="w-full mt-4 py-3 rounded-full bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors"
          >
            {platform === "android" ? "Install now" : "Got it"}
          </button>
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-2xl px-4 py-3.5 shadow-2xl shadow-black/30 flex items-center gap-3">
          <span className="text-xl shrink-0">&#128241;</span>
          <p className="flex-1 text-white text-sm font-medium">
            <strong>Add to home screen</strong> for the best experience
          </p>
          {platform === "android" && deferredPromptRef.current ? (
            <button
              onClick={handleAndroidInstall}
              className="shrink-0 bg-white text-zinc-900 rounded-full px-3.5 py-1.5 text-xs font-bold hover:bg-zinc-100 transition-colors"
            >
              Install
            </button>
          ) : (
            <button
              onClick={() => setExpanded(true)}
              className="shrink-0 bg-white text-zinc-900 rounded-full px-3.5 py-1.5 text-xs font-bold hover:bg-zinc-100 transition-colors"
            >
              How?
            </button>
          )}
          <button
            onClick={dismiss}
            className="shrink-0 text-zinc-500 hover:text-white text-lg"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
