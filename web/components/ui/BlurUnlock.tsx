// web/components/ui/BlurUnlock.tsx
import * as React from "react";
import { useAuth } from "@/utils/auth";

type Props = {
  children: React.ReactNode;
  previewCount?: number;
  totalCount?: number;
  label?: string;
  onUnlocked?: () => void;
  className?: string;
};

function buildNextParam() {
  if (typeof window === "undefined") return "/";
  // keep path + query + hash; prevent external origins
  const { pathname, search, hash } = window.location;
  return pathname + search + hash;
}

export default function BlurUnlock({
  children,
  previewCount = 3,
  totalCount,
  label = "photos",
  onUnlocked,
  className = "",
}: Props) {
  const { user } = useAuth();
  const isAuthed = !!user;

  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (isAuthed && !firedRef.current) {
      firedRef.current = true;
      onUnlocked?.();
    }
  }, [isAuthed, onUnlocked]);

  if (isAuthed) {
    return (
      <div className={className} data-qa="blurunlock-open">
        {children}
      </div>
    );
  }

  const totalText =
    typeof totalCount === "number" && totalCount > 0
      ? `view all ${totalCount} ${label}`
      : `view all ${label}`;

  const goRegister = () => {
    const next = encodeURIComponent(buildNextParam());
    window.location.href = `/register?next=${next}`;
  };
  const goLogin = () => {
    const next = encodeURIComponent(buildNextParam());
    window.location.href = `/login?next=${next}`;
  };

  return (
    <div className={`relative ${className}`} data-qa="blurunlock-locked">
      {/* Locked badge */}
      <div className="absolute right-3 top-3 z-10 rounded-full px-2 py-0.5 text-[11px] font-medium bg-black/60 text-white backdrop-blur-md">
        Locked preview
      </div>

      {/* Blurred content */}
      <div className="pointer-events-none select-none overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div className="relative">
          <div className="filter blur-[2px]">{children}</div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white/95 via-white/40 to-transparent dark:from-neutral-950/95 dark:via-neutral-950/40" />
        </div>
      </div>

      {/* Overlay CTA */}
      <div className="absolute inset-x-3 bottom-3 z-10 flex justify-center">
        <div className="w-full max-w-xl rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md shadow-lg px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-neutral-800 dark:text-neutral-200 leading-snug">
              You’re seeing {previewCount} {label}. Create a free account to{" "}
              {totalText}.
              <div className="text-[11px] text-neutral-500 mt-0.5">
                Free for homeowners. Pros fund the platform—no payment needed.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goRegister}
                className="inline-flex h-10 px-4 items-center justify-center rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:opacity-90 dark:bg-white dark:text-neutral-900"
                data-qa="blurunlock-register"
              >
                Create account
              </button>
              <button
                type="button"
                onClick={goLogin}
                className="inline-flex h-10 px-3 items-center justify-center rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                data-qa="blurunlock-login"
              >
                Log in
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
