import * as React from "react";

type Props = {
  name: string;
  onClick?: () => void;
  className?: string;
};

export default function FeaturedSimpleCard({
  name,
  onClick,
  className = "",
}: Props) {
  const initials = getInitials(name);
  const bg = pickBgFromName(name); // deterministic color by name

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full text-left focus:outline-none ${className}`}
      aria-label={`View ${name}`}
    >
      <div
        className={`relative aspect-[4/3] w-full overflow-hidden rounded-2xl ${bg} 
                    grid place-items-center text-neutral-900`}
      >
        {/* Name overlay (legible pill) */}
        <div className="absolute inset-x-0 top-0 p-2">
          <span
            title={name}
            className="inline-block max-w-[92%] truncate rounded-lg bg-black/60 px-2.5 py-1 
                       text-[13px] font-semibold text-white shadow-sm backdrop-blur-sm"
          >
            {name}
          </span>
        </div>

        {/* Initials */}
        <span
          aria-hidden="true"
          className="select-none text-5xl sm:text-6xl font-bold tracking-tight 
                     text-white/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
        >
          {initials}
        </span>
      </div>
    </button>
  );
}

/* ---------------- helpers ---------------- */

function getInitials(name: string) {
  if (!name) return "T";
  const parts = name.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Pick a deterministic Tailwind gradient based on the name
function pickBgFromName(seed: string) {
  const palettes = [
    // gradients
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
