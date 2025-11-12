import React from "react";
import {
  Medal,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  Image as ImageIcon,
  Star,
  Phone,
  Globe,
  Link as LinkIcon,
} from "lucide-react";

export type FeaturedTradesman = {
  builderId: string;
  companyName: string | null;
  displayName: string | null;
  tier: "free" | "unlock" | "gold" | "spotlight" | string;
  tierActiveUntil: string | null;
  badges: {
    companiesHouseVerified: boolean;
    insuranceValid: boolean;
  };
  avatarUrl: string | null;
  gallery: string[];
  stats: {
    completed: number;
    photos: number;
    reviews: number;
    stars: number; // now hard-coded by API
  };
  score: number | null;
  location?: {
    outward?: string | null;
  };

  // contact bits
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  socials?: string[]; // array of URLs
  companyNumber?: string | null;

  // optional extras
  badge?: string | null;
  offersDiscount?: boolean;
  warrantyMonths?: number;
};

type Props = {
  item: FeaturedTradesman;
  onViewProfile?: (builderId: string) => void;
  onMessage?: (builderId: string) => void;
  className?: string;
  borderless?: boolean; // ← used to remove border/bg/shadow
  "data-testid"?: string;
};

const GoldTradesmanCard: React.FC<Props> = ({
  item,
  onViewProfile,
  onMessage,
  className = "",
  borderless = false,
  "data-testid": testid = "gold-tradesman-card",
}) => {
  const {
    builderId,
    companyName,
    displayName,
    tier,
    badges,
    avatarUrl,
    gallery,
    stats,
    location,
    tierActiveUntil,
    phone,
    website,
    socials = [],
    companyNumber,
  } = item;

  const title = companyName || displayName || "Tradesman";
  const outward = location?.outward ?? null;

  const isSpotlight = String(tier).toLowerCase() === "spotlight";
  const isGold = String(tier).toLowerCase() === "gold";
  const isPaid = isSpotlight || isGold;

  const ribbonClass = isSpotlight
    ? "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500 text-white"
    : isGold
    ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-400 text-black"
    : "bg-neutral-200 text-neutral-800";

  const ribbonText = isSpotlight
    ? "Spotlight"
    : isGold
    ? "Gold Verified"
    : "Free";

  const untilLabel =
    tierActiveUntil && isPaid
      ? `Active until ${new Date(tierActiveUntil).toLocaleDateString()}`
      : null;

  // --- NEW: borderless container logic
  const containerBase =
    "group relative overflow-hidden rounded-2xl transition-shadow";
  const containerDecor = borderless
    ? "" // strip borders, bg, shadow for featured strip
    : "border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm hover:shadow-lg";

  return (
    <article
      data-testid={testid}
      className={`${containerBase} ${containerDecor} ${className}`}
    >
      {/* Ribbon */}
      <div className={`${ribbonClass} px-3 py-2 flex items-center gap-2`}>
        <Medal
          size={18}
          className={isGold ? "text-amber-900/80" : "text-white"}
        />
        <span className="text-xs font-semibold tracking-wide uppercase">
          {ribbonText}
        </span>
        {untilLabel && (
          <span className="ml-auto text-[10px] opacity-80">{untilLabel}</span>
        )}
      </div>

      {/* Body */}
      <div className={`p-4 sm:p-5 ${borderless ? "bg-transparent" : ""}`}>
        <div className="flex items-start gap-4">
          <Avatar src={avatarUrl} name={title} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate"
                title={title}
              >
                {title}
              </h3>
              {outward && (
                <span className="inline-flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
                  <MapPin size={14} />
                  <span>{outward}</span>
                </span>
              )}
              {companyNumber && (
                <span className="ml-auto text-xs text-neutral-500">
                  Co. {companyNumber}
                </span>
              )}
            </div>

            {/* Stars + stats (stars now hard-coded) */}
            <div className="mt-1 flex items-center gap-3 text-sm">
              <Stars value={stats?.stars ?? 0} />
              <span className="text-neutral-500 dark:text-neutral-400">
                {stats?.reviews ?? 0} likes
              </span>
              <span className="text-neutral-500 dark:text-neutral-400">
                {stats?.completed ?? 0} completed
              </span>
              {stats?.photos ? (
                <span className="inline-flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                  <ImageIcon size={14} />
                  {stats.photos}
                </span>
              ) : null}
            </div>

            {/* Badges */}
            <div className="mt-2 flex flex-wrap gap-2">
              {badges?.companiesHouseVerified && (
                <Badge
                  icon={<CheckCircle2 size={14} />}
                  text="Companies House verified"
                />
              )}
              {badges?.insuranceValid && (
                <Badge
                  icon={<ShieldCheck size={14} />}
                  text="Valid insurance"
                />
              )}
              {isSpotlight && (
                <Badge
                  tone="spotlight"
                  icon={<Medal size={14} />}
                  text="Featured"
                />
              )}
              {isGold && (
                <Badge tone="gold" icon={<Medal size={14} />} text="Gold" />
              )}
            </div>

            {/* Contact and links */}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center gap-1 text-neutral-700 dark:text-neutral-200 hover:underline"
                >
                  <Phone size={14} />
                  {phone}
                </a>
              )}
              {website && (
                <a
                  href={
                    website.startsWith("http") ? website : `https://${website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-neutral-700 dark:text-neutral-200 hover:underline"
                >
                  <Globe size={14} />
                  Website
                </a>
              )}
              {socials && socials.length > 0 && (
                <div className="inline-flex items-center gap-2">
                  {socials.slice(0, 3).map((url, i) => (
                    <a
                      key={`soc-${i}`}
                      href={url.startsWith("http") ? url : `https://${url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-neutral-700 dark:text-neutral-200 hover:underline"
                    >
                      <LinkIcon size={14} />
                      <span className="truncate max-w-[120px]">
                        {prettyDomain(url)}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Gallery (placeholder images provided by API) */}
        {Array.isArray(gallery) && gallery.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl overflow-hidden">
            {gallery.slice(0, 3).map((src, i) => (
              <img
                key={`${builderId}-g-${i}`}
                src={src}
                alt={`${title} project ${i + 1}`}
                className="aspect-[4/3] w-full object-cover hover:opacity-95"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {/* CTAs */}
        <div className="mt-4 flex gap-2">
          <button
            data-testid={`${testid}-view`}
            onClick={() => onViewProfile?.(builderId)}
            className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition"
          >
            View profile
          </button>
          <button
            data-testid={`${testid}-message`}
            onClick={() => onMessage?.(builderId)}
            className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white hover:opacity-90 transition"
          >
            Message
          </button>
        </div>
      </div>
    </article>
  );
};

export default GoldTradesmanCard;

/* ---------- helpers ---------- */

const Avatar: React.FC<{ src: string | null; name: string }> = ({
  src,
  name,
}) => {
  const initials = name
    ?.split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return src ? (
    <img
      src={src}
      alt={name}
      className="h-14 w-14 rounded-xl object-cover ring-1 ring-neutral-200 dark:ring-neutral-800"
    />
  ) : (
    <div className="h-14 w-14 rounded-xl bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 grid place-items-center font-semibold">
      {initials || "T"}
    </div>
  );
};

const Badge: React.FC<{
  icon?: React.ReactNode;
  text: string;
  tone?: "gold" | "spotlight" | "neutral";
}> = ({ icon, text, tone = "neutral" }) => {
  const classes =
    tone === "spotlight"
      ? "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500 text-white"
      : tone === "gold"
      ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-400 text-black"
      : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}
    >
      {icon}
      {text}
    </span>
  );
};

const Stars: React.FC<{ value: number }> = ({ value }) => {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${value} stars`}
    >
      {Array.from({ length: full }).map((_, i) => (
        <Star
          key={`s-f-${i}`}
          size={14}
          className="fill-yellow-400 text-yellow-400"
        />
      ))}
      {half && <Star key="s-h" size={14} className="text-yellow-400" />}
      {Array.from({ length: empty }).map((_, i) => (
        <Star
          key={`s-e-${i}`}
          size={14}
          className="text-neutral-300 dark:text-neutral-600"
        />
      ))}
      <span className="ml-1 text-sm text-neutral-700 dark:text-neutral-300">
        {value.toFixed(1)}
      </span>
    </span>
  );
};

function prettyDomain(url: string) {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
