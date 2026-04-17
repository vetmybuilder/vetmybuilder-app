import React, { useEffect, useMemo, useRef, useState } from "react";
import ReportModal from "@/components/ReportModal";

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
  const [reportPhotoId, setReportPhotoId] = useState<string | number | null>(null);
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
          className="fixed inset-0 z-[100] flex flex-col bg-black/90"
          role="dialog"
          aria-modal="true"
          aria-label="Image lightbox"
        >
          {/* Top bar — always above image */}
          <div className="flex shrink-0 items-center justify-between px-4 py-3">
            <span className="text-sm text-zinc-400">
              {index + 1} / {images.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setReportPhotoId(images[index].id)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors focus:outline-none"
                aria-label="Report this photo"
              >
                <svg className="h-3.5 w-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
                </svg>
                Report
              </button>
              <button
                ref={closeBtnRef}
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors focus:outline-none"
                aria-label="Close"
              >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
              Close
            </button>
            </div>
          </div>

          {/* Image area — click backdrop to close */}
          <div
            className="relative flex flex-1 items-center justify-center px-16"
            onClick={() => setOpen(false)}
          >
            <img
              src={images[index].fullUrl}
              alt={images[index].alt || ""}
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Prev */}
            {images.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setIndex((i) => (i - 1 + images.length) % images.length); }}
                className="absolute left-3 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors focus:outline-none"
                aria-label="Previous image"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
              </button>
            )}

            {/* Next */}
            {images.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setIndex((i) => (i + 1) % images.length); }}
                className="absolute right-3 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors focus:outline-none"
                aria-label="Next image"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {reportPhotoId !== null && (
        <ReportModal
          targetType="photo"
          targetId={reportPhotoId}
          onClose={() => setReportPhotoId(null)}
        />
      )}
    </>
  );
}
