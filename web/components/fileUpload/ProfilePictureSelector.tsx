import * as React from "react";

type Photo = {
  key: string;
  previewUrl: string;
};

type Props = {
  photos: Photo[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
};

export default function ProfilePictureSelector({
  photos,
  selectedKey,
  onSelect,
}: Props) {
  if (!photos.length) return null;

  return (
    <div data-testid="profile-picture-selector">
      <p className="text-sm font-medium mb-1">Profile picture</p>
      <p className="text-xs text-slate-500 mb-3">
        Choose which photo appears as your profile picture. Defaults to the
        first photo if none is chosen.
      </p>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {photos.map((photo) => {
          const isSelected = photo.key === selectedKey;
          return (
            <li key={photo.key} className="relative">
              <button
                type="button"
                onClick={() => onSelect(isSelected ? null : photo.key)}
                className={`w-full rounded-xl overflow-hidden ring-2 transition-all ${
                  isSelected
                    ? "ring-indigo-500 ring-offset-2"
                    : "ring-transparent hover:ring-slate-300"
                }`}
                aria-label={
                  isSelected
                    ? "Deselect as profile picture"
                    : "Set as profile picture"
                }
                aria-pressed={isSelected}
                data-testid={`profile-picture-option-${photo.key}`}
              >
                <img
                  src={photo.previewUrl}
                  alt=""
                  className="h-24 w-full object-cover"
                />
              </button>
              {isSelected && (
                <span className="pointer-events-none absolute top-1 left-1 rounded-full bg-indigo-500 px-2 py-0.5 text-xs font-medium text-white shadow">
                  Profile
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
