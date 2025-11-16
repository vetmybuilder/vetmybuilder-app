// web/components/tradesmen/FeaturedSimpleCard.tsx
import * as React from "react";
import { useRouter } from "next/router";

export type FeaturedSimpleItem = {
  id: string;
  name: string;
  img?: string | null; // main work photo
  onClick?: () => void;
};

type CardProps = {
  name: string;
  img?: string | null;
  onClick?: () => void;
  className?: string;
};

/**
 * Single featured tradesman tile.
 *
 * Image fallback order:
 *  1) tradesman image (img prop)
 *  2) /uploads/tradesman-placeholder.jpg
 *  3) initials with gradient background
 */
export default function FeaturedSimpleCard({
  name,
  img,
  onClick,
  className = "",
}: CardProps) {
  const cleanImg = img && img.trim().length > 0 ? img : null;
  const initials = getInitials(name);
  const bg = pickBgFromName(name); // deterministic color by name

  // "primary"  -> use img prop
  // "placeholder" -> use /uploads/tradesman-placeholder.jpg
  // "none" -> show initials only
  const [mode, setMode] = React.useState<"primary" | "placeholder" | "none">(
    () => (cleanImg ? "primary" : "placeholder")
  );

  React.useEffect(() => {
    setMode(cleanImg ? "primary" : "placeholder");
  }, [cleanImg]);

  const currentSrc = React.useMemo(() => {
    if (mode === "primary" && cleanImg) return cleanImg;
    if (mode === "placeholder") return "/uploads/tradesman-placeholder.jpg";
    return null;
  }, [mode, cleanImg]);

  const handleImgError = React.useCallback(() => {
    setMode((prev) => {
      if (prev === "primary") return "placeholder";
      if (prev === "placeholder") return "none";
      return "none";
    });
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full text-left focus:outline-none ${className}`}
      aria-label={`View ${name}`}
    >
      <div
        className={`relative aspect-[4/3] w-full overflow-hidden rounded-2xl ${
          currentSrc ? "" : bg
        } grid place-items-center text-neutral-900`}
      >
        {/* Image if available, otherwise initials */}
        {currentSrc ? (
          <img
            src={currentSrc}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={handleImgError}
          />
        ) : (
          <span
            aria-hidden="true"
            className="select-none text-5xl sm:text-6xl font-bold tracking-tight 
                        text-white/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
          >
            {initials}
          </span>
        )}

        {/* Name overlay pill */}
        <div className="absolute inset-x-0 top-0 p-2">
          <span
            title={name}
            className="inline-block max-w-[92%] truncate rounded-lg bg-black/60 px-2.5 py-1 
                        text-[13px] font-semibold text-white shadow-sm backdrop-blur-sm"
          >
            {name}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ---------------- Strip (no auto-scroll) + view-all ---------------- */

type StripProps = {
  items: FeaturedSimpleItem[];
  pageSize?: number; // default 4
};

export function FeaturedSimpleStrip({ items, pageSize = 4 }: StripProps) {
  const router = useRouter();

  if (!items || items.length === 0) return null;

  // Just show the first N items in the order provided by the server
  const visible = items.slice(0, pageSize);

  return (
    <section
      aria-label="Featured tradesmen"
      className="relative rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 px-4 py-5 sm:px-5 sm:py-6"
      data-testid="featured-strip"
    >
      {/* Label sitting on the border line */}
      <div className="pointer-events-none absolute -top-3 left-4 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-3 py-0.5 text-sm sm:text-base font-semibold text-amber-900 shadow-sm">
        Featured
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 justify-items-stretch">
        {visible.map((item) => (
          <FeaturedSimpleCard
            key={item.id}
            name={item.name}
            img={item.img ?? null}
            onClick={item.onClick}
          />
        ))}
      </div>

      {/* View all link bottom-right */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => router.push("/tradesman/featured")}
          className="text-xs font-medium text-amber-800 hover:text-amber-900 hover:underline"
          data-testid="featured-view-all"
        >
          View all
        </button>
      </div>
    </section>
  );
}

/* ---------------- helpers ---------------- */

function getInitials(name: string) {
  if (!name) return "T";
  const parts = name.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}

// Pick a deterministic Tailwind gradient based on the name
function pickBgFromName(seed: string) {
  const palettes = [
    "bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400",
    "bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500",
    "bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-400",
    "bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500",
    "bg-gradient-to-br from-pink-400 via-rose-400 to-red-400",
    "bg-gradient-to-br from-lime-400 via-emerald-400 to-teal-400",
    "bg-gradient-to-br from-slate-400 via-slate-500 to-slate-700",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const idx = h % palettes.length;
  return palettes[idx];
}
