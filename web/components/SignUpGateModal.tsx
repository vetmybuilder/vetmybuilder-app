// web/components/SignUpGateModal.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/utils/auth";

/**
 * Global Sign-up/Login Modal
 * - Listens for `vmb:auth:required` and opens an iframe with /login or /register.
 * - Close automatically when auth state flips to signed-in.
 *
 * To open:
 *   openSignUpGate('register') // or 'login'
 */
type Mode = "login" | "register";

export default function SignUpGateModal() {
  const { user } = useAuth();

  const [isOpen, setIsOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("register");
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setPortalEl(document.getElementById("modal-root") || document.body);
  }, []);

  // Open when a gated action fires this event
  React.useEffect(() => {
    function onAuthRequired(e: Event) {
      const ce = e as CustomEvent<{ mode?: Mode }>;
      if (ce?.detail?.mode === "login" || ce?.detail?.mode === "register") {
        setMode(ce.detail.mode);
      }
      setIsOpen(true);
    }
    window.addEventListener(
      "vmb:auth:required",
      onAuthRequired as EventListener
    );
    return () =>
      window.removeEventListener(
        "vmb:auth:required",
        onAuthRequired as EventListener
      );
  }, []);

  // Close automatically once signed in
  React.useEffect(() => {
    if (user && isOpen) setIsOpen(false);
  }, [user, isOpen]);

  // Escape to close
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const switchMode = (m: Mode) => setMode(m);
  const onOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setIsOpen(false);
  };

  if (!isOpen || !portalEl) return null;

  const src = mode === "login" ? "/login" : "/register";

  const Modal = (
    <div
      className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center"
      onMouseDown={onOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-gate-title"
      data-qa="signup-gate-modal"
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-neutral-200/70 dark:border-neutral-800/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className={`h-9 px-3 rounded-lg text-sm font-medium ${
                mode === "login"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
              onClick={() => switchMode("login")}
              data-qa="auth-tab-login"
            >
              Log in
            </button>
            <button
              className={`h-9 px-3 rounded-lg text-sm font-medium ${
                mode === "register"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
              onClick={() => switchMode("register")}
              data-qa="auth-tab-register"
            >
              Create account
            </button>
          </div>

          <button
            type="button"
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => setIsOpen(false)}
            data-qa="signup-close"
          >
            ✕
          </button>
        </div>

        {/* Body: iframe */}
        <div className="h-[75vh] sm:h-[70vh]">
          <iframe
            src={src}
            title={mode === "login" ? "Log in" : "Create account"}
            className="w-full h-full"
          />
        </div>

        {/* Footer (fallback links) */}
        <div className="px-4 sm:px-6 py-3 border-t border-neutral-200/70 dark:border-neutral-800/70 text-right">
          <a
            href={src}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
            target="_blank"
            rel="noreferrer"
            data-qa="auth-open-newtab"
          >
            Open in new tab
          </a>
        </div>
      </div>
    </div>
  );

  return createPortal(Modal, portalEl);
}

/** Programmatically open the modal */
export function openSignUpGate(mode: "login" | "register" = "register") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("vmb:auth:required", { detail: { mode } })
  );
}
