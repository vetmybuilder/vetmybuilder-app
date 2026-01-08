import * as React from "react";
import LightboxGallery, {
  type GalleryImage,
} from "@/components/LightboxGallery";

type Props = {
  images: GalleryImage[];
  className?: string;
};

export default function SharedProfilePhotosSection({
  images,
  className = "",
}: Props) {
  if (!images || images.length === 0) return null;

  return (
    <section
      className={`rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5 ${className}`}
      data-testid="tradesman-shared-photos-card"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-emerald-900">
            Shared photos
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-emerald-800/80">
            These are the photos the tradesperson included when expressing
            interest in your project.
          </p>
        </div>
        <span className="text-xs text-emerald-700">
          {images.length} photo{images.length === 1 ? "" : "s"}
        </span>
      </div>

      <LightboxGallery
        images={images}
        cols={3}
        rounded="rounded-xl"
        // reuse same layout style as main gallery
      />
    </section>
  );
}
