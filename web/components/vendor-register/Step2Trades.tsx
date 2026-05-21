// web/components/vendor-register/Step2Trades.tsx
import { useMemo, useState, useEffect } from "react";
import { Check, Wrench } from "lucide-react";
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
  onRemoveExistingPhoto?: (url: string) => void;
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
  onRemoveExistingPhoto,
}: Props) {
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<string>("");
  // Photo consent (Acceptable Use Policy) - blocks Continue when photos
  // are attached but consent has not been given.
  const [photoConsent, setPhotoConsent] = useState(false);

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
    <form className="space-y-0 pb-4" onSubmit={onNext} data-testid="step-2">

      {/* Step heading */}
      <div className="px-3.5 pt-4 pb-1">
        <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-600 mb-0.5">
          Trades &amp; photos
        </p>
        <h2 className="text-[18px] font-extrabold text-gray-900 leading-tight">What do you do?</h2>
      </div>

      {/* ── Trades section ── */}
      <div className="bg-white rounded-xl mx-3 my-2 px-3.5 py-3 space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Wrench className="h-4 w-4 text-zinc-400" />
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-gray-500">Your trades</span>
            {tradeTypes.length > 0 && (
              <span className="ml-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
                {tradeTypes.length}
              </span>
            )}
            {tradeTypes.length > 0 && (
              <button
                type="button"
                className="ml-auto text-xs text-zinc-400 hover:text-emerald-600 transition-colors"
                onClick={clearAll}
                data-testid="btn-clear-trades"
              >
                Clear all
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-400 ml-6">
            Pick everything you genuinely offer — helps us match you to the right projects.
          </p>
        </div>

        {/* Search */}
        <input
          type="search"
          className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors"
          placeholder="Search trades… e.g., electrician, tiler, loft (synonyms supported)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="input-trades-search"
        />

        {/* Bucket filters */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setBucket("")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              bucket === ""
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
            data-testid="bucket-all"
          >
            All
          </button>
          {buckets.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b === bucket ? "" : b)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                bucket === b
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
              data-testid={`bucket-${b}`}
            >
              {b}
            </button>
          ))}
        </div>

        {/* Trade pills grid */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50">
          <div className="max-h-72 overflow-y-auto p-4" data-testid="trades-list">
            {filtered.length === 0 ? (
              <p className="text-sm text-zinc-400">No matches{query ? ` for "${query}"` : ""}.</p>
            ) : (
              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                data-testid="selected-trades"
              >
                {filtered.map((t) => {
                  const label = t.label;
                  const checked = tradeTypes.includes(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setTradeTypes(toggle(tradeTypes, label))}
                      aria-pressed={checked}
                      aria-label={label}
                      className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium leading-tight text-center transition-all ${
                        checked
                          ? "border border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "bg-white text-zinc-600 border border-zinc-200 hover:border-emerald-300 hover:text-emerald-600"
                      }`}
                    >
                      {checked && <Check className="h-3.5 w-3.5 shrink-0" />}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Work photos ── */}
      <p className="px-3.5 pt-3 pb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-zinc-500">
        Pictures of your work
      </p>
      <div data-testid="work-photos" className="mx-3 my-2 space-y-2">

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
                        ? "ring-emerald-500 ring-offset-1"
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
                    <span className="pointer-events-none absolute top-1 left-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow">
                      Profile
                    </span>
                  )}
                  {onRemoveExistingPhoto && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelected) onProfilePictureKeyChange(null);
                        onRemoveExistingPhoto(url);
                      }}
                      className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                      aria-label="Remove photo"
                    >
                      <svg viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5">
                        <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
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
          onConsentChange={setPhotoConsent}
          // The final "By signing up, I agree to the Terms of Use and
          // Acceptable Use Policy" checkbox on Step 3 already covers
          // the same legal consent, so suppress the per-uploader
          // checkbox to avoid asking twice.
          requireConsent={false}
          tone="emerald"
          emeraldLabel="Add photos of your work"
        />
      </div>

      {err && (
        <p className="mx-3 text-sm text-red-600 font-medium" role="alert">{err}</p>
      )}

      {/* Hidden submit — triggered by WizardNavBar onNext via step handler */}
      <button type="submit" className="sr-only" data-testid="btn-continue" aria-hidden="true">Continue</button>
    </form>
  );
}
