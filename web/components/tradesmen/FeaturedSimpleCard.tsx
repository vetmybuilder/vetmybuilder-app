  // web/components/tradesmen/FeaturedSimpleCard.tsx
  import * as React from "react";

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

  /* ---------------- Strip with arrows + paging ---------------- */

  type StripProps = {
    items: FeaturedSimpleItem[];
    pageSize?: number; // default 4
  };

  export function FeaturedSimpleStrip({ items, pageSize = 4 }: StripProps) {
    const [page, setPage] = React.useState(0);

    if (!items || items.length === 0) return null;

    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const clampedPage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = clampedPage * pageSize;
    const visible = items.slice(start, start + pageSize);

    const go = (delta: number) => {
      setPage((prev) => {
        const next = prev + delta;
        if (next < 0) return 0;
        if (next >= totalPages) return totalPages - 1;
        return next;
      });
    };

    return (
      <section aria-label="Featured Gold Tradesmen">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-slate-900">
            Featured Gold Tradesmen
          </h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={clampedPage === 0}
              aria-label="Previous featured tradesmen"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm disabled:opacity-40 disabled:cursor-default hover:bg-slate-50"
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={clampedPage >= totalPages - 1}
              aria-label="Next featured tradesmen"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm disabled:opacity-40 disabled:cursor-default hover:bg-slate-50"
            >
              <span aria-hidden>›</span>
            </button>
          </div>
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

        <p className="mt-3 text-center text-xs text-slate-500">
          Page {clampedPage + 1} of {totalPages}
        </p>
      </section>
    );
  }

  /* ---------------- helpers ---------------- */

  function getInitials(name: string) {
    if (!name) return "T";
    const parts = name
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .filter(Boolean);
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