// web/components/vendor-register/Step2Trades.tsx
import { useMemo, useState, useEffect } from "react";
import { TRADE_TYPES, type TradeType } from "@/types/tradeTypes";
import FileGridUploader from "@/components/fileUpload/FileGridUploader";

type Props = {
  tradeTypes: string[];
  setTradeTypes: (v: string[]) => void;

  // Photos are now the actual File objects (controlled)
  workPhotos: File[];
  setWorkPhotos: (files: File[]) => void;

  onBack: () => void;
  onNext: (e: React.FormEvent) => void;
  err?: string | null;

  // Profile picture selection (optional)
  existingPhotoUrls?: string[];
  profilePictureKey?: string | null;
  onProfilePictureKeyChange?: (key: string | null) => void;
};

const toggle = (arr: string[], item: string) => {
  const s = new Set(arr);
  s.has(item) ? s.delete(item) : s.add(item);
  return Array.from(s).sort((a, b) => a.localeCompare(b));
};
const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

export default function Step2Trades({
  tradeTypes,
  setTradeTypes,
  workPhotos,
  setWorkPhotos,
  onBack,
  onNext,
  err,
  existingPhotoUrls = [],
  profilePictureKey,
  onProfilePictureKeyChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<string>("");

  // Auto-select the first available photo when no profile picture is chosen yet
  useEffect(() => {
    if (!onProfilePictureKeyChange) return;
    if (profilePictureKey != null) return;
    if (existingPhotoUrls.length > 0) {
      onProfilePictureKeyChange(existingPhotoUrls[0]);
    } else if (workPhotos.length > 0) {
      onProfilePictureKeyChange("new-0");
    }
  }, [existingPhotoUrls, workPhotos, profilePictureKey, onProfilePictureKeyChange]);

  // Wrap setWorkPhotos to keep profilePictureKey consistent when files are removed/reordered
  const handleWorkPhotosChange = (newFiles: File[]) => {
    if (profilePictureKey?.startsWith("new-") && onProfilePictureKeyChange) {
      const prevIdx = parseInt(profilePictureKey.slice(4), 10);
      const selectedFile = workPhotos[prevIdx];
      if (selectedFile) {
        const newIdx = newFiles.indexOf(selectedFile);
        if (newIdx === -1) {
          // Selected file was removed — fall back to first existing photo or next new file
          const fallback =
            existingPhotoUrls[0] != null
              ? existingPhotoUrls[0]
              : newFiles.length > 0
              ? "new-0"
              : null;
          onProfilePictureKeyChange(fallback);
        } else if (newIdx !== prevIdx) {
          onProfilePictureKeyChange(`new-${newIdx}`);
        }
      }
    }
    setWorkPhotos(newFiles);
  };

  const activeTypes = useMemo(
    () => TRADE_TYPES.filter((t) => t.active !== false),
    []
  );

  // Buckets: promote "Insulation" first if present
  const buckets = useMemo(() => {
    const list = uniq(activeTypes.map((t) => t.buckets || "").filter(Boolean));
    const idx = list.indexOf("Insulation");
    if (idx > -1) {
      const [ins] = list.splice(idx, 1);
      list.unshift(ins);
    }
    return list;
  }, [activeTypes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (t: TradeType) => {
      if (bucket && (t.buckets || "") !== bucket) return false;
      if (!q) return true;
      if (t.label.toLowerCase().includes(q)) return true;
      return (t.synonyms || []).some((s) => s.toLowerCase().includes(q));
    };
    return activeTypes
      .filter(matches)
      .sort(
        (a, b) =>
          (b.popularity ?? 0) - (a.popularity ?? 0) ||
          a.label.localeCompare(b.label)
      );
  }, [activeTypes, bucket, query]);

  const clearOne = (label: string) =>
    setTradeTypes(tradeTypes.filter((t) => t !== label));
  const clearAll = () => setTradeTypes([]);

  return (
    <form className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 grid gap-6" onSubmit={onNext} data-testid="step-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-zinc-900 mb-1">Choose your trades</h2>
          <p className="text-sm text-zinc-500">
            Pick everything you genuinely offer—this helps us match you to the
            right projects.
          </p>
        </div>
        {tradeTypes.length > 0 && (
          <button
            type="button"
            className="text-sm text-zinc-500 hover:text-zinc-900"
            onClick={clearAll}
            data-testid="btn-clear-trades"
            aria-label="Clear all selected trades"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <div className="grid gap-3">
        <input
          type="search"
          className="h-11 w-full rounded-2xl border-2 border-zinc-200 bg-white px-4 text-[15px] leading-6 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
          placeholder="Search trades… e.g., electrician, tiler, loft (synonyms supported)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="input-trades-search"
          aria-label="Search trades"
        />

        {/* Buckets (wrap, neutral) */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBucket("")}
            className={`px-3 py-1.5 rounded-2xl text-sm ring-1 ${
              bucket === ""
                ? "bg-zinc-900 text-white ring-zinc-900"
                : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50"
            }`}
            data-testid="bucket-all"
          >
            All
          </button>
          {buckets.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={`px-3 py-1.5 rounded-2xl text-sm ring-1 ${
                bucket === b
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
              }`}
              data-testid={`bucket-${b}`}
            >
              {b}
            </button>
          ))}
        </div>

        {/* Selected — minimal chips */}
        {tradeTypes.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="selected-trades"
          >
            {tradeTypes.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700"
              >
                {t}
                <button
                  type="button"
                  onClick={() => clearOne(t)}
                  className="rounded-full p-0.5 text-zinc-400 hover:text-zinc-700 focus:outline-none"
                  aria-label={`Remove ${t}`}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Results list */}
      <div className="rounded-2xl border-2 border-zinc-200">
        <div className="max-h-80 overflow-auto p-3" data-testid="trades-list">
          {filtered.length === 0 ? (
            <p className="px-1 py-2 text-sm text-zinc-400">
              No matches{query ? ` for "${query}"` : ""}.
            </p>
          ) : (
            <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
              {filtered.map((t) => {
                const label = t.label;
                const checked = tradeTypes.includes(label);
                return (
                  <li key={label}>
                    <label className="inline-flex select-none items-center gap-3 text-[15px] leading-6 text-zinc-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-300 accent-red-500"
                        checked={checked}
                        onChange={() =>
                          setTradeTypes(toggle(tradeTypes, label))
                        }
                        aria-checked={checked}
                        aria-label={label}
                      />
                      <span>{label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Work photos */}
      <div data-testid="work-photos">
        <label className="text-sm font-medium block mb-1">
          Pictures of your work
        </label>
        <p className="text-xs text-zinc-400 mb-2">
          Upload photos of your completed projects, then choose one as your
          profile picture. Homeowners are far more likely to reach out when they
          can see who they&rsquo;d be hiring.
        </p>

        {/* Existing photos (edit flow) — selectable as profile picture */}
        {onProfilePictureKeyChange && existingPhotoUrls.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {existingPhotoUrls.map((url) => {
              const isSelected = profilePictureKey === url;
              return (
                <li key={url} className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      onProfilePictureKeyChange(isSelected ? null : url)
                    }
                    className={`w-full rounded-xl overflow-hidden ring-2 transition-all ${
                      isSelected
                        ? "ring-red-500 ring-offset-1"
                        : "ring-transparent hover:ring-zinc-300"
                    }`}
                    aria-label={
                      isSelected
                        ? "Deselect as profile picture"
                        : "Set as profile picture"
                    }
                    aria-pressed={isSelected}
                  >
                    <img src={url} alt="" className="h-28 w-full object-cover" />
                  </button>
                  {isSelected && (
                    <span className="pointer-events-none absolute top-1 left-1 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white shadow">
                      Profile
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <FileGridUploader
          files={workPhotos}
          onChange={handleWorkPhotosChange}
          maxFiles={12}
          profilePictureKey={
            onProfilePictureKeyChange
              ? profilePictureKey?.startsWith("new-")
                ? profilePictureKey
                : null
              : undefined
          }
          onProfilePictureKeyChange={onProfilePictureKeyChange}
        />
      </div>

      {err && (
        <p className="text-sm text-red-600" role="alert">
          {err}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border-2 border-zinc-200 bg-white px-6 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition-all"
          onClick={onBack}
          data-testid="btn-back"
        >
          Back
        </button>
        <button
          className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-all"
          data-testid="btn-continue"
        >
          Next
        </button>
      </div>
    </form>
  );
}
