import * as React from "react";

type ActionButtonProps = {
  onClick: () => Promise<void> | void;
  disabled?: boolean;
  busy?: boolean;
  busyText?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "danger" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  "data-testid"?: string;
};

const VARIANTS = {
  primary:
    "bg-red-500 text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] active:scale-95",
  danger:
    "bg-rose-600 text-white shadow-lg shadow-rose-500/25 hover:shadow-xl hover:scale-[1.02] active:scale-95",
  outline:
    "bg-white text-zinc-900 border-2 border-zinc-300 hover:border-zinc-400 active:scale-95",
  ghost:
    "bg-transparent text-zinc-700 hover:bg-zinc-100 active:scale-95",
};

const SIZES = {
  sm: "px-4 py-2 text-xs",
  md: "px-6 py-2.5 text-sm",
  lg: "px-8 py-3 text-sm",
};

const BUSY_STYLE = "bg-zinc-400 text-white cursor-not-allowed shadow-none hover:scale-100";

export default function ActionButton({
  onClick,
  disabled = false,
  busy: externalBusy,
  busyText = "Processing...",
  children,
  className = "",
  variant = "primary",
  size = "md",
  "data-testid": testId,
}: ActionButtonProps) {
  const [internalBusy, setInternalBusy] = React.useState(false);
  const guardRef = React.useRef(false);

  const busy = externalBusy ?? internalBusy;

  async function handleClick() {
    if (busy || disabled || guardRef.current) return;
    guardRef.current = true;
    setInternalBusy(true);
    try {
      await onClick();
    } catch {
      // Caller handles errors; button just resets
    } finally {
      guardRef.current = false;
      setInternalBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      data-testid={testId}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all ${
        busy ? BUSY_STYLE : VARIANTS[variant]
      } ${SIZES[size]} disabled:opacity-40 disabled:scale-100 disabled:shadow-none ${className}`}
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
      {busy ? busyText : children}
    </button>
  );
}
