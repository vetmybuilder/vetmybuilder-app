import * as React from "react";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  // Profile picture selection (optional)
  profilePictureKey?: string | null;
  onProfilePictureKeyChange?: (key: string | null) => void;
};

export default function FileGridUploader({
  files,
  onChange,
  maxFiles = 8,
  maxSizeMB = 10,
  profilePictureKey,
  onProfilePictureKeyChange,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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
        className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-slate-400 transition-colors"
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
        <p className="text-sm text-slate-600">
          Drag & drop photos here, or <span className="underline">browse</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Up to {maxFiles} files · Max {maxSizeMB}MB each
        </p>
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
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {previews.map((p, i) => {
            const key = `new-${i}`;
            const isSelected = onProfilePictureKeyChange
              ? profilePictureKey === key
              : false;
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
                      <img
                        src={p.url}
                        alt={p.name}
                        className="h-28 w-full object-cover"
                      />
                    </button>
                  ) : (
                    <img
                      src={p.url}
                      alt={p.name}
                      className="h-28 w-full rounded-xl object-cover ring-1 ring-slate-200"
                    />
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
      )}
    </div>
  );
}
