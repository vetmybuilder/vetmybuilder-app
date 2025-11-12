import * as React from "react";
import { useApi } from "@/utils/api";

type SpotlightItem = {
  builderId: string;
  companyName: string | null;
  displayName: string | null;
  tierActiveUntil?: string | null;
  gallery?: string[];
};

type Props = {
  projectId: string;
  className?: string;
  onClickCard?: (builderId: string) => void;
};

export default function SpotlightStrip({
  projectId,
  className = "",
  onClickCard,
}: Props) {
  const api = useApi();
  const [items, setItems] = React.useState<SpotlightItem[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const url = `/api/tradesmen/spotlight?projectId=${encodeURIComponent(
          projectId
        )}&limit=999`;
        const res = await api.get?.(url);
        const data =
          res && typeof (res as any).json === "function"
            ? await (res as any).json()
            : (res as any)?.data ?? res;

        if (!cancelled) {
          const list: SpotlightItem[] = Array.isArray(data?.items)
            ? data.items
            : [];
          setItems(list);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load spotlight");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, api]);

  if (loading) {
    return (
      <section className={className} aria-label="Spotlight tradesmen">
        <p className="text-sm text-slate-500">Loading spotlight…</p>
      </section>
    );
  }

  if (err) {
    return (
      <section className={className} aria-label="Spotlight tradesmen">
        <p className="text-sm text-rose-600">{err}</p>
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <section className={className} aria-label="Spotlight tradesmen">
      {/* Right column is narrow, so render one “ad” per row */}
      <div className="grid grid-cols-1 gap-4">
        {items.map((t) => (
          <SpotlightTile
            key={t.builderId}
            name={t.companyName || t.displayName || "Tradesman"}
            img={t.gallery?.[0] || null}
            onClick={() =>
              onClickCard
                ? onClickCard(t.builderId)
                : (window.location.href = `/tradesmen/${t.builderId}`)
            }
          />
        ))}
      </div>
    </section>
  );
}

/* ----------------- tile ----------------- */
/** “Ad-size” tile to match Featured card footprint */
function SpotlightTile({
  name,
  img,
  onClick,
}: {
  name: string;
  img: string | null;
  onClick: () => void;
}) {
  const [src, setSrc] = React.useState<string | null>(img);
  const initials = getInitials(name);
  const bg = pickBgFromName(name);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left focus:outline-none"
      aria-label={`View ${name}`}
    >
      <div
        className={`relative w-full h-56 sm:h-60 md:h-[260px] overflow-hidden rounded-2xl shadow-sm hover:shadow-md transition-shadow ${
          !src ? bg : ""
        } grid place-items-center`}
      >
        {/* image if available, otherwise initials */}
        {src ? (
          <img
            src={src}
            alt={name}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            loading="lazy"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={() => setSrc(null)}
          />
        ) : (
          <span
            aria-hidden="true"
            className="select-none text-6xl sm:text-7xl font-bold tracking-tight text-white/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
          >
            {initials}
          </span>
        )}

        {/* name pill (bigger for ad feel) */}
        <div className="absolute inset-x-0 top-0 p-3">
          <span
            title={name}
            className="inline-block max-w-[92%] truncate rounded-lg bg-black/60 px-3 py-1.5 text-sm sm:text-base font-semibold text-white shadow-sm backdrop-blur-sm"
          >
            {name}
          </span>
        </div>
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
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}
