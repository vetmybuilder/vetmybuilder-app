import React, { useEffect, useMemo, useRef, useState } from "react";

export type GalleryImage = {
  id: string | number;
  thumbUrl: string; // small/medium image for the grid
  fullUrl: string; // large image for the lightbox
  alt?: string;
};

type Props = {
  images: GalleryImage[];
  // Optional: how many columns on desktop
  cols?: 3 | 4 | 5;
  // Optional: rounded thumbnails
  rounded?: string; // e.g. "rounded-xl"
};

export default function LightboxGallery({
  images,
  cols = 3,
  rounded = "rounded-lg",
}: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const gridCols = useMemo(() => {
    switch (cols) {
      case 5:
        return "sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
      case 4:
        return "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
      default:
        return "sm:grid-cols-2 md:grid-cols-3"; // 3
    }
  }, [cols]);

  // Disable background scroll when lightbox is open
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Keyboard navigation when lightbox is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft")
        setIndex((i) => (i - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);

  // Focus trap basics
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  if (!images?.length) {
    return <p className="text-sm text-zinc-400">No photos yet.</p>;
  }

  return (
    <>
      {/* Grid */}
      <div className={`grid grid-cols-2 ${gridCols} gap-2`}>
        {images.map((img, i) => (
          <button
            key={img.id ?? i}
            className={`relative aspect-square overflow-hidden ${rounded} bg-zinc-900 ring-1 ring-zinc-800 hover:opacity-90`}
            onClick={() => {
              setIndex(i);
              setOpen(true);
            }}
            aria-label={`Open image ${i + 1} of ${images.length}`}
          >
            {/* Use next/image if you prefer; raw <img> keeps this file standalone */}
            <img
              src={img.thumbUrl}
              alt={img.alt || ""}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {/* Lightbox Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-3"
          role="dialog"
          aria-modal="true"
          aria-label="Image lightbox"
        >
          {/* Close */}
          <button
            ref={closeBtnRef}
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Close"
          >
            ✕
          </button>

          {/* Prev */}
          {images.length > 1 && (
            <button
              onClick={() =>
                setIndex((i) => (i - 1 + images.length) % images.length)
              }
              className="absolute left-3 md:left-6 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Previous image"
            >
              ‹
            </button>
          )}

          {/* Image */}
          <div className="max-w-6xl w-full">
            <img
              src={images[index].fullUrl}
              alt={images[index].alt || ""}
              className="mx-auto max-h-[80vh] w-auto object-contain"
            />
            <div className="mt-2 text-center text-xs text-zinc-300">
              {index + 1} / {images.length}
            </div>
          </div>

          {/* Next */}
          {images.length > 1 && (
            <button
              onClick={() => setIndex((i) => (i + 1) % images.length)}
              className="absolute right-3 md:right-6 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Next image"
            >
              ›
            </button>
          )}
        </div>
      )}
    </>
  );
}
