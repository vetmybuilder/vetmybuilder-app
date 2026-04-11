// web/components/vendor-register/Step2Trades.tsx
import { useEffect } from "react";
import { ArrowLeft, ArrowRight, Images } from "lucide-react";
import FileGridUploader from "@/components/fileUpload/FileGridUploader";
import TradePicker from "@/components/TradePicker";

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

  return (
    <form className="bg-white rounded-2xl shadow-lg shadow-zinc-200/60 p-7 sm:p-9 space-y-7" onSubmit={onNext} data-testid="step-2">

      <TradePicker selected={tradeTypes} onChange={setTradeTypes} />

      {/* ── Work photos ── */}
      <div data-testid="work-photos" className="space-y-2">
        <div className="flex items-center gap-2">
          <Images className="h-4 w-4 text-zinc-400" />
          <label className="text-sm font-bold text-zinc-800">Pictures of your work</label>
        </div>
        <p className="text-xs text-zinc-400 ml-6">
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
        />
      </div>

      {err && (
        <p className="text-sm text-red-600 font-medium" role="alert">{err}</p>
      )}

      <div className="flex items-center justify-between border-t border-zinc-100 pt-6">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border-2 border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          onClick={onBack}
          data-testid="btn-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-full bg-red-500 px-6 py-2.5 text-sm font-bold text-white shadow-sm shadow-red-500/25 hover:bg-red-600 transition-colors"
          data-testid="btn-continue"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
