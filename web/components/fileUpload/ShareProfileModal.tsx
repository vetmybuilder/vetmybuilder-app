// web/components/fileUpload/ShareProfileModal.tsx
import * as React from "react";
import { X, ImagePlus, Send } from "lucide-react";
import FileGridUploader from "@/components/fileUpload/FileGridUploader";

type ShareProfileModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (files: File[]) => Promise<void> | void;
  homeownerName?: string;
  message?: string;
  onChangeMessage?: (text: string) => void;
  maxFiles?: number;
  maxSizeMB?: number;
};

export default function ShareProfileModal({
  open,
  onClose,
  onSubmit,
  homeownerName,
  message,
  onChangeMessage,
  maxFiles = 8,
  maxSizeMB = 10,
}: ShareProfileModalProps) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const canSubmit = files.length > 0 && !busy;

  React.useEffect(() => {
    if (!open) {
      setFiles([]);
      setBusy(false);
      setErr(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const trimmedName = homeownerName?.trim();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      data-testid="share-profile-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="relative bg-gradient-to-r from-red-500 to-red-600 px-6 py-5">
          <button
            className="absolute right-4 top-4 rounded-full bg-white/20 p-1.5 text-white hover:bg-white/30 transition-colors"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
              <Send className="h-5 w-5 text-white" />
            </span>
            <div>
              <h2 className="text-base font-black text-white">
                {trimmedName ? `Share with "${trimmedName}"` : "Express interest"}
              </h2>
              <p className="mt-0.5 text-xs text-red-100">
                Attach photos to boost your chances of being chosen
              </p>
            </div>
          </div>
        </div>

        {/* Tip banner */}
        <div className="flex items-start gap-2 bg-amber-50 border-b border-amber-100 px-5 py-3">
          <ImagePlus className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Tip:</span> Upload "before &amp; after" shots or similar past projects to stand out.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {typeof onChangeMessage === "function" && (
            <div className="mb-4">
              <label htmlFor="share-note" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Short note (optional)
              </label>
              <textarea
                id="share-note"
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 transition-colors"
                rows={3}
                maxLength={300}
                value={message ?? ""}
                onChange={(e) => onChangeMessage?.(e.target.value)}
                placeholder="E.g., I've recently completed a similar job nearby — photos attached."
              />
              <div className="mt-1 text-right text-xs text-zinc-400">
                {message?.length ?? 0}/300
              </div>
            </div>
          )}

          <FileGridUploader
            files={files}
            onChange={(next) => {
              setErr(null);
              setFiles(next);
            }}
            maxFiles={maxFiles}
            maxSizeMB={maxSizeMB}
          />

          {err && (
            <p className="mt-2 text-sm font-medium text-red-500" role="alert">{err}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50 px-5 py-4">
          <p className="text-xs text-zinc-400">
            Photos will be shared with the homeowner.
          </p>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-white shadow-sm shadow-red-500/30 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={!canSubmit}
              onClick={async () => {
                if (!canSubmit) return;
                try {
                  setBusy(true);
                  await onSubmit(files);
                } finally {
                  setBusy(false);
                }
              }}
              data-testid="btn-upload-and-share"
            >
              <Send className="h-3.5 w-3.5" />
              {busy ? "Sharing…" : "Share profile"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
