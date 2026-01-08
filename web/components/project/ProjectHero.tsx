import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import * as React from "react";

type Props = {
  className?: string;
  /** Optional background image (static import or URL) */
  imageSrc?: StaticImageData | string;
  /** CTA button */
  primaryCtaHref?: string;
  primaryCtaLabel?: string;
  /** Copy (defaults match the concept) */
  title?: string;
  subtitle?: string;
};

export default function ProjectHero({
  className = "",
  imageSrc,
  primaryCtaHref = "/projects/new",
  primaryCtaLabel = "Post a Job",
  title = "Inspire Your Next Renovation",
  subtitle = "Find ideas, shortlist tradesmen, and track your project journey.",
}: Props) {
  return (
    <section
      className={[
        "relative overflow-hidden rounded-[24px]",
        "h-[240px] sm:h-[280px] md:h-[320px]",
        "shadow-[0_10px_40px_rgba(15,23,42,0.10)]",
        className,
      ].join(" ")}
      data-testid="projects-hero"
    >
      {/* Background image (no fade/overlay) */}
      {imageSrc && (
        <Image
          src={imageSrc}
          alt=""
          fill
          priority
          sizes="(max-width: 768px) 100vw, 900px"
          className="object-cover"
        />
      )}

      {/* Content */}
      <div className="relative z-10 h-full px-6 sm:px-10 md:px-12 flex flex-col justify-center">
        <h2 className="text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.35)] text-[28px] sm:text-[34px] md:text-[40px] font-extrabold leading-tight max-w-[26ch]">
          {title}
        </h2>

        <p className="mt-2 text-white/90 hidden sm:block text-base max-w-[60ch]">
          {subtitle}
        </p>

        <div className="mt-5">
          <Link
            href={primaryCtaHref}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[16px] font-semibold shadow-md"
            style={{
              backgroundColor: "#d7b98a", // warm sand as per concept
              color: "#1b1f23",
            }}
            data-testid="hero-cta"
          >
            {primaryCtaLabel}
            <span aria-hidden>↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
