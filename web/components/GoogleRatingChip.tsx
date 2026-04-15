import * as React from "react";

type GoogleRatingChipProps = {
  rating?: number | null;
  count?: number | null;
  placeId?: string | null;
  className?: string;
};

export function GoogleRatingChip({
  rating,
  count,
  placeId,
  className = "",
}: GoogleRatingChipProps) {
  if (rating == null || Number.isNaN(Number(rating))) return null;

  const r = Number(rating);
  const label = r.toFixed(1); // always show one decimal like "5.0"
  const hasCount = typeof count === "number" && count > 0;

  // Round to nearest whole star, clamp 0–5
  const fullStars = Math.max(0, Math.min(5, Math.round(r)));

  // Mock place IDs (issued by server/lib/mocks/syntheticExternal.js when
  // MOCK_EXTERNAL_SERVICES=1) start "MOCK_" and don't resolve on Google
  // Maps. Render the chip without a deep-link in that case so dev/e2e
  // sessions don't show broken outbound links.
  const isMockPlaceId =
    typeof placeId === "string" && placeId.startsWith("MOCK_");

  // Use Google's universal "Maps URL scheme" format - works on desktop,
  // iOS Safari (Maps app), and Android (Google Maps app). The older
  // `?q=place_id:XXX` format is interpreted on iOS as a literal text
  // search and produces "No results found on Google Maps".
  // https://developers.google.com/maps/documentation/urls/get-started
  const href =
    placeId && !isMockPlaceId
      ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(
          placeId
        )}`
      : null;

  const stars = (
    <span
      className="ml-1 inline-flex text-[13px] leading-none text-[#F4B400]"
      aria-hidden="true"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i}>{i < fullStars ? "★" : "☆"}</span>
      ))}
    </span>
  );

  const reviewsText = hasCount ? (
    <span className="ml-1 text-[13px] leading-none text-[#1A0DAB]">
      {count} Google review{count === 1 ? "" : "s"}
    </span>
  ) : null;

  const inner = (
    <>
      {/* Google wordmark-style text */}
      <span className="inline-flex items-baseline text-[13px] sm:text-[14px] leading-none font-medium mr-1">
        <span className="text-[#4285F4]">G</span>
        <span className="text-[#DB4437]">o</span>
        <span className="text-[#F4B400]">o</span>
        <span className="text-[#4285F4]">g</span>
        <span className="text-[#0F9D58]">l</span>
        <span className="text-[#DB4437]">e</span>
      </span>

      {/* Numeric score */}
      <span className="text-[13px] leading-none text-slate-800 tabular-nums">
        {label}
      </span>

      {/* Stars */}
      {stars}

      {/* "10 Google reviews" text */}
      {reviewsText}
    </>
  );

  const commonProps = {
    className:
      "inline-flex items-center gap-0.5 text-xs sm:text-sm hover:underline hover:underline-offset-2 " +
      className,
    title: `Google rating ${label}${
      hasCount ? ` from ${count} review${count === 1 ? "" : "s"}` : ""
    }`,
    "aria-label": `Google rating ${label}${
      hasCount ? ` from ${count} review${count === 1 ? "" : "s"}` : ""
    }`,
    "data-testid": "builder-google-rating",
  } as const;

  return href ? (
    <a href={href} target="_blank" rel="noreferrer" {...commonProps}>
      {inner}
    </a>
  ) : (
    <span {...commonProps}>{inner}</span>
  );
}
