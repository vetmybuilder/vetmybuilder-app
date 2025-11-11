import * as React from "react";
import FileGridUploader from "@/components/fileUpload/FileGridUploader";

type ShareProfileModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (files: File[]) => Promise<void> | void;
  projectName?: string;

  /** Optional extras (fully backward compatible) */
  message?: string; // controlled value
  onChangeMessage?: (text: string) => void; // show textarea only if provided
  maxFiles?: number;
  maxSizeMB?: number;
};

export default function ShareProfileModal({
  open,
  onClose,
  onSubmit,
  projectName,
  // optional extras
  message,
  onChangeMessage,
  maxFiles = 8,
  maxSizeMB = 10,
}: ShareProfileModalProps) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const canSubmit = files.length > 0 && !busy;

  // reset state when closing
  React.useEffect(() => {
    if (!open) {
      setFiles([]);
      setBusy(false);
      setErr(null);
    }
  }, [open]);

  // close on ESC (not while busy)
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="share-profile-modal"
      onMouseDown={(e) => {
        // click on backdrop to close (not while busy)
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              Share your profile{projectName ? ` with “${projectName}”` : ""}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Tip:{" "}
              <span className="font-medium">
                Add photos and complete verifications
              </span>{" "}
              to improve your chances. Upload clear “before &amp; after” shots
              or similar projects.
            </p>
          </div>
          <button
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-5">
          {/* Optional short note (only if parent provides a handler) */}
          {typeof onChangeMessage === "function" && (
            <div className="mb-4">
              <label
                htmlFor="share-note"
                className="block text-sm text-slate-600 mb-1"
              >
                Include a short note (optional)
              </label>
              <textarea
                id="share-note"
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                rows={3}
                maxLength={300}
                value={message ?? ""}
                onChange={(e) => onChangeMessage?.(e.target.value)}
                placeholder="E.g., I've recently completed a similar job nearby — photos attached."
              />
              <div className="mt-1 text-xs text-slate-400">
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

          {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
          <p className="text-xs text-slate-500">
            We’ll attach these photos to your share and notify the homeowner.
          </p>
          <div className="flex gap-3">
            <button className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn"
              disabled={!canSubmit}
              onClick={async () => {
                if (!canSubmit) return;
                try {
                  setBusy(true);
                  await onSubmit(files); // message is optional; parent can read via controlled prop if needed
                } finally {
                  setBusy(false);
                }
              }}
              data-testid="btn-upload-and-share"
            >
              {busy ? "Uploading…" : "Upload & Share"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
