// web/components/builder/BuilderPhotos.tsx

import SharedProfilePhotosSection from "@/components/tradesmen/SharedProfilePhotosSection";
import BlurUnlock from "@/components/ui/BlurUnlock";
import type { GalleryImage } from "@/components/LightboxGallery";
import type { Photo } from "@/types/builderTypes";

type Props = {
  user: any;
  galleryImages: GalleryImage[];
  photos: Photo[];
};

export default function BuilderPhotos({ user, galleryImages, photos }: Props) {
  if (user) {
    if (galleryImages.length > 0) {
      return <SharedProfilePhotosSection images={galleryImages} />;
    }

    return (
      <section
        className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:p-5"
        data-testid="builder-shared-photos-empty"
      >
        <h2 className="text-sm sm:text-base font-semibold text-emerald-900 mb-1">
          Shared photos
        </h2>
        <p className="text-sm text-emerald-800">
          No photos have been shared for this builder yet.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:p-5"
      data-testid="builder-shared-photos-locked"
    >
      <h2 className="text-sm sm:text-base font-semibold text-emerald-900 mb-1">
        Shared photos
      </h2>
      <p className="text-sm text-emerald-800 mb-3">
        Create a free account to see photos your neighbours shared with this
        recommendation.
      </p>

      <BlurUnlock
        previewCount={3}
        totalCount={photos.length || undefined}
        label="photos from neighbours"
      >
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"
          aria-hidden
        >
          {new Array(6).fill(null).map((_, i) => (
            <div
              key={i}
              className="relative aspect-square overflow-hidden rounded-lg border border-emerald-100 bg-emerald-100"
            >
              <div className="absolute inset-0 animate-pulse bg-emerald-200/70" />
            </div>
          ))}
        </div>
      </BlurUnlock>
    </section>
  );
}
