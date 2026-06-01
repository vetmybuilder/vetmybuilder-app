// web/components/BrandWordmark.tsx
//
// PREVIEW (2026-05) — currently rendering variant #22 from
// /mocks/logo-redesign: Tesla-style E (3 horizontal bars, no vertical
// stem) inside an Audiowide wordmark, colour-tuned for the dark navbar.
// Tone-aware: indigo-300 for homeowner context, emerald-300 for
// tradesperson context.
//
// Revert: `git checkout HEAD~1 -- web/components/BrandWordmark.tsx` if
// you decide to roll back to the Caveat-cursive version.

import { useRouter } from "next/router";

type Tone = "indigo" | "emerald" | "slate" | "auto";

function TeslaE({ color, size }: { color: string; size: number }) {
  const w = size * 0.55;
  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 55 100"
      style={{ display: "inline-block", verticalAlign: "middle", margin: "0 2px" }}
      aria-hidden="true"
    >
      <rect x="0" y="6" width="55" height="13" fill={color} />
      <rect x="0" y="44" width="42" height="13" fill={color} />
      <rect x="0" y="81" width="55" height="13" fill={color} />
    </svg>
  );
}

export default function BrandWordmark({
  tone = "auto",
  bg = "dark",
  fontSize = 24,
  className,
}: {
  tone?: Tone;
  /**
   * `dark` (default) renders light glyphs for the slate-950 navbar.
   * `light` renders saturated glyphs for the mobile menu drawer / any
   *  light-background context.
   */
  bg?: "dark" | "light";
  /** Pixel size for the glyphs. Default 24 matches the navbar. The
   *  custom-bar E (TeslaE) scales proportionally off this value, so
   *  bumping this is the right way to make the whole mark bigger
   *  (transform:scale leaves layout dimensions at the unscaled width
   *  and the glyphs overflow their container). */
  fontSize?: number;
  /** Optional override for the outer span. */
  className?: string;
}) {
  const router = useRouter();
  // Auto-detect admin context (path /admin/* OR /login?next=/admin/...).
  const nextQuery =
    typeof router.query.next === "string" ? router.query.next : "";
  const isAdminContext =
    router.pathname.startsWith("/admin") ||
    nextQuery.startsWith("/admin");
  const resolved =
    tone === "auto"
      ? isAdminContext
        ? "slate"
        : router.pathname.startsWith("/tradesman")
          ? "emerald"
          : "indigo"
      : tone;

  // Dark-bg palette (light glyphs) vs light-bg palette (dark glyphs).
  const color =
    bg === "light"
      ? resolved === "emerald"
        ? "#059669" // emerald-600
        : resolved === "slate"
          ? "#0f172a" // slate-900 (black-ish on light bg)
          : "#4f46e5" // indigo-600
      : resolved === "emerald"
        ? "#6ee7b7" // emerald-300
        : resolved === "slate"
          ? "#e2e8f0" // slate-200 (near-white on dark navbar)
          : "#a5b4fc"; // indigo-300
  const text = {
    fontFamily: "Audiowide, sans-serif",
    fontSize,
    letterSpacing: "0.05em",
    color,
    lineHeight: 1,
  } as const;

  return (
    <span
      className={className}
      aria-label="VetMyBuilder"
      style={{ display: "inline-flex", alignItems: "center" }}
    >
      {/* Audiowide font loaded in _document.tsx (preconnect + stylesheet). */}
      <span style={text}>V</span>
      <TeslaE color={color} size={fontSize} />
      <span style={text}>TMYBUILD</span>
      <TeslaE color={color} size={fontSize} />
      <span style={text}>R</span>
    </span>
  );
}
