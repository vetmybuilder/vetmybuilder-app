import * as React from "react";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  // Profile picture selection (optional)
  profilePictureKey?: string | null;
  onProfilePictureKeyChange?: (key: string | null) => void;
  // Photo upload consent (Acceptable Use Policy requirement).
  // When at least one file is present the checkbox renders beneath the
  // grid; parent forms receive the boolean via `onConsentChange` and
  // should disable their submit button until it's true. Set
  // `requireConsent={false}` to suppress the checkbox for internal
  // flows that don't need it.
  requireConsent?: boolean;
  onConsentChange?: (consented: boolean) => void;
  // Visual tone for the empty-state dropzone. "slate" (default) keeps the
  // dashed neutral look used on homeowner pages. "emerald" matches the
  // tradesman signup docs uploader: clean white card, centered uppercase
  // eyebrow, big emerald "+ Upload" CTA.
  tone?: "slate" | "emerald";
  // When `tone="emerald"`, this is the small uppercase eyebrow shown
  // inside the white card above the "+ Upload" CTA.
  emeraldLabel?: string;
};

/**
 * Browsers can't render HEIC / HEIF in an <img> tag, so we show a
 * placeholder tile instead of a broken image. The server transcodes
 * these to JPEG on upload (server/lib/imageSanitiser.js).
 */
function isHeicFile(file: { name?: string; type?: string }): boolean {
  const t = String(file.type || "").toLowerCase();
  const n = String(file.name || "").toLowerCase();
  return (
    t === "image/heic" ||
    t === "image/heif" ||
    n.endsWith(".heic") ||
    n.endsWith(".heif")
  );
}

export default function FileGridUploader({
  files,
  onChange,
  maxFiles = 8,
  maxSizeMB = 10,
  profilePictureKey,
  onProfilePictureKeyChange,
  requireConsent = true,
  onConsentChange,
  tone = "slate",
  emeraldLabel = "Project photos",
}: Props) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [consented, setConsented] = React.useState(false);

  // Reset consent whenever the file list empties out (e.g. user
  // removed every file). If the user then adds new files they must
  // re-confirm.
  React.useEffect(() => {
    if (files.length === 0 && consented) {
      setConsented(false);
      onConsentChange?.(false);
    }
    // Notify parent on mount / when files go from 0 to >0 so the
    // parent's submit-gate reflects the current unchecked state.
    if (files.length > 0 && requireConsent) {
      onConsentChange?.(consented);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, consented, requireConsent]);

  const handlePick = () => inputRef.current?.click();

  const handleAddFiles = (list: FileList | null) => {
    if (!list) return;
    setError(null);

    const arr = Array.from(list);
    const maxBytes = maxSizeMB * 1024 * 1024;

    const filtered = arr.filter((f) => {
      if (f.size > maxBytes) {
        setError(`"${f.name}" is larger than ${maxSizeMB}MB`);
        return false;
      }
      return true;
    });

    const next = [...files, ...filtered].slice(0, maxFiles);
    if (files.length + filtered.length > maxFiles) {
      setError(`You can upload up to ${maxFiles} files.`);
    }

    onChange(next);
    // reset input so the same file can be selected again if removed
    if (inputRef.current) inputRef.current.value = "";
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    handleAddFiles(e.target.files);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleAddFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const removeAt = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    onChange(next);
  };

  // Create object URLs for previews in a memo (no hooks inside loops)
  const previews = React.useMemo(() => {
    return files.map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type,
      size: f.size,
    }));
  }, [files]);

  // Revoke previous object URLs on change/unmount
  React.useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  return (
    <div>
      <div
        className={
          tone === "emerald"
            ? "rounded-xl bg-white px-4 py-5 text-center cursor-pointer"
            : "rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-slate-400 transition-colors"
        }
        onDrop={onDrop}
        onDragOver={onDragOver}
        role="button"
        tabIndex={0}
        onClick={handlePick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handlePick();
        }}
        aria-label="Upload photos"
      >
        {tone === "emerald" ? (
          <>
            <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-zinc-500">
              {emeraldLabel}
            </div>
            <div className="mt-2 text-sm font-bold text-emerald-600">
              + Upload
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              Up to {maxFiles} files · Max {maxSizeMB}MB each
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Drag & drop photos here, or <span className="underline">browse</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Up to {maxFiles} files · Max {maxSizeMB}MB each
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onInputChange}
          data-testid="file-input"
        />
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      {previews.length > 0 && (
        <>
          <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {previews.map((p, i) => {
              const key = `new-${i}`;
              const isSelected = onProfilePictureKeyChange
                ? profilePictureKey === key
                : false;
              const heic = isHeicFile(p);

              // Browsers can't render HEIC in <img>; show a placeholder
              // with the filename. The server-side sanitiser will
              // transcode this to JPEG on upload.
              const tileInner = heic ? (
                <div className="flex h-28 w-full flex-col items-center justify-center gap-1 bg-slate-50 px-2 text-center">
                  <svg
                    className="h-6 w-6 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden="true"
                  >
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l7 7v9a2 2 0 0 1-2 2z" />
                    <path d="M14 3v7h7" />
                  </svg>
                  <span className="text-[11px] font-semibold text-slate-600">
                    HEIC
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Converted on upload
                  </span>
                </div>
              ) : (
                <img
                  src={p.url}
                  alt={p.name}
                  className="h-28 w-full object-cover"
                />
              );

              return (
                <li key={`${p.url}-${i}`} className="relative group">
                  <div className="relative">
                    {onProfilePictureKeyChange ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onProfilePictureKeyChange(isSelected ? null : key);
                        }}
                        className={`w-full rounded-xl overflow-hidden ring-2 transition-all ${
                          isSelected
                            ? "ring-indigo-500 ring-offset-1"
                            : "ring-transparent hover:ring-slate-300"
                        }`}
                        aria-label={
                          isSelected
                            ? "Deselect as profile picture"
                            : "Set as profile picture"
                        }
                        aria-pressed={isSelected}
                      >
                        {tileInner}
                      </button>
                    ) : (
                      <div className="w-full rounded-xl overflow-hidden ring-1 ring-slate-200">
                        {tileInner}
                      </div>
                    )}
                    {isSelected && (
                      <span className="pointer-events-none absolute top-1 left-1 rounded-full bg-indigo-500 px-2 py-0.5 text-xs font-medium text-white shadow">
                        Profile
                      </span>
                    )}
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-1 text-xs shadow hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAt(i);
                      }}
                      aria-label={`Remove ${p.name}`}
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    className="mt-1 truncate text-xs text-slate-600"
                    title={p.name}
                  >
                    {p.name}
                  </div>
                </li>
              );
            })}
          </ul>

          {previews.some((p) => isHeicFile(p)) && (
            <p className="mt-3 text-xs text-slate-500">
              HEIC files will be converted to JPEG when you upload. Preview is
              not shown because browsers can&apos;t display HEIC directly.
            </p>
          )}

          {requireConsent && (
            <label
              className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
              data-testid="photo-consent-checkbox-wrapper"
            >
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => {
                  const next = e.target.checked;
                  setConsented(next);
                  onConsentChange?.(next);
                }}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-red-500 focus:ring-red-400"
                aria-describedby="photo-consent-copy"
                data-testid="photo-consent-checkbox"
              />
              <span id="photo-consent-copy" className="leading-snug">
                I confirm I have the right to share these photos. Anyone
                clearly visible has agreed, and the photos do not contain
                children or reveal someone else&apos;s home address. (
                <a
                  href="/acceptable-use"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-red-600"
                >
                  Acceptable Use Policy
                </a>
                )
              </span>
            </label>
          )}
        </>
      )}
    </div>
  );
}
