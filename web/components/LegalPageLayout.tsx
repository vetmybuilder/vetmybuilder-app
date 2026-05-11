// web/components/LegalPageLayout.tsx
// Shared layout for every on-site legal / compliance page (privacy,
// terms, cookies, acceptable-use, verified, complaints, moderation,
// ranking, sub-processors). Matches the warm cream / amber / indigo
// palette used by the homepage and signup flow.
import Head from "next/head";
import Link from "next/link";
import React from "react";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";

export type LegalSection = {
  title: string;
  /**
   * Plain text with two formatting affordances:
   *   - blank line separates paragraphs
   *   - a line starting with "- " renders as a list item
   *   - **bold** renders inline
   */
  content: string;
};

type Props = {
  title: string;
  titleAccent?: string;
  subtitle?: string;
  lastUpdated: string;
  sections: LegalSection[];
  metaDescription: string;
  summary?: React.ReactNode;
  numbered?: boolean;
  footerCtaHref?: string;
  footerCtaLabel?: string;
};

export default function LegalPageLayout({
  title,
  titleAccent,
  subtitle,
  lastUpdated,
  sections,
  metaDescription,
  summary,
  numbered = false,
  footerCtaHref = "mailto:hello@vetmybuilder.com",
  footerCtaLabel = "hello@vetmybuilder.com",
}: Props) {
  return (
    <>
      <Head>
        <title>{title} - VetMyBuilder</title>
        <meta name="description" content={metaDescription} />
        {/* Override the body bg so the global Layout image doesn't bleed
            through the cream / white sections below. */}
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">
        {/* HERO - cream wash with Sora display + Caveat handwritten accent.
            BrandWatermarkScatter overlays the cream chrome so legal pages
            match /projects, /login, /signup, etc. */}
        <section className="relative bg-[#fef6e9] pt-24 pb-12 sm:pt-28 sm:pb-16 overflow-hidden">
          <BrandWatermarkScatter />
          <div className="relative z-10 mx-auto max-w-3xl px-5 sm:px-8">
            <div className="inline-block rounded-full bg-amber-100/80 border border-amber-200 px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-amber-800 mb-5 whitespace-nowrap">
              {`Last updated: ${lastUpdated}`}
            </div>
            <h1
              className="text-[40px] sm:text-[56px] lg:text-[64px] font-black tracking-[-0.025em] text-slate-900 leading-[0.95]"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              {title}
              {titleAccent && (
                <>
                  {" "}
                  <span
                    className="text-indigo-600"
                    style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
                  >
                    {titleAccent}
                  </span>
                </>
              )}
            </h1>
            {subtitle && (
              <p className="mt-5 text-[16px] sm:text-lg text-slate-700 leading-relaxed max-w-2xl">
                {subtitle}
              </p>
            )}
          </div>
        </section>

        {/* CONTENT - white card on cream, narrow readable column */}
        <section className="relative bg-[#fef6e9] pb-16 overflow-hidden">
          <BrandWatermarkScatter />
          <div className="relative z-10 mx-auto max-w-3xl px-5 sm:px-8">
            <div className="bg-white rounded-3xl shadow-sm border border-amber-100 p-6 sm:p-10">
              {summary && (
                <div className="bg-amber-50 rounded-2xl p-5 mb-8 border border-amber-100">
                  {summary}
                </div>
              )}

              <div className="space-y-10">
                {sections.map((section, i) => (
                  <div
                    key={i}
                    className="border-b border-amber-100 pb-10 last:border-0 last:pb-0"
                  >
                    <h2
                      className="text-[22px] sm:text-2xl font-extrabold tracking-[-0.01em] text-slate-900 mb-4 leading-tight"
                      style={{ fontFamily: "'Sora', sans-serif" }}
                    >
                      {numbered ? `${i + 1}. ${section.title}` : section.title}
                    </h2>
                    <div className="text-[14.5px] sm:text-[15px] text-slate-700 leading-relaxed space-y-3">
                      {section.content.split("\n\n").map((para, j) => (
                        <ParagraphBlock key={j} text={para} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA card - matches the warm cream + indigo language */}
            <div className="mt-6 bg-white rounded-3xl shadow-sm border border-amber-100 p-7 sm:p-9 text-center">
              <h3
                className="text-xl sm:text-2xl font-extrabold text-slate-900"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Questions?
              </h3>
              <p className="mt-1.5 text-[14px] sm:text-[15px] text-slate-600">
                We&apos;re happy to help. Reach us anytime.
              </p>
              {footerCtaHref.startsWith("http") ||
              footerCtaHref.startsWith("mailto:") ? (
                <a
                  href={footerCtaHref}
                  className="mt-5 inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                  style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                >
                  {footerCtaLabel}
                </a>
              ) : (
                <Link
                  href={footerCtaHref}
                  className="mt-5 inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                  style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                >
                  {footerCtaLabel}
                </Link>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

// Render a single paragraph block (the chunks separated by blank lines
// in the source content). A block may be:
//   - plain prose
//   - a bold heading followed by bullets
//   - pure bullets
//   - a mix of prose lines and bullets
// We walk line-by-line, grouping consecutive "- " lines into a <ul>
// and rendering non-bullet lines as <p>, so you can stack a heading +
// bullets in the same block without having to split it in the source.
function ParagraphBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const chunks: Array<
    { kind: "text"; lines: string[] } | { kind: "list"; items: string[] }
  > = [];

  for (const line of lines) {
    const isBullet = line.startsWith("- ");
    const last = chunks[chunks.length - 1];
    if (isBullet) {
      if (last && last.kind === "list") {
        last.items.push(line.replace(/^- /, ""));
      } else {
        chunks.push({ kind: "list", items: [line.replace(/^- /, "")] });
      }
    } else {
      if (last && last.kind === "text") {
        last.lines.push(line);
      } else {
        chunks.push({ kind: "text", lines: [line] });
      }
    }
  }

  const renderInline = (s: string) =>
    s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk.kind === "list") {
          return (
            <ul
              key={i}
              className="list-disc list-outside ml-5 space-y-1.5 marker:text-amber-500"
            >
              {chunk.items.map((item, k) => (
                <li
                  key={k}
                  dangerouslySetInnerHTML={{ __html: renderInline(item) }}
                />
              ))}
            </ul>
          );
        }
        const joined = chunk.lines.join("\n");
        const isHeading =
          chunk.lines.length === 1 &&
          chunk.lines[0]!.startsWith("**") &&
          chunk.lines[0]!.endsWith("**");
        return (
          <p
            key={i}
            className={
              isHeading ? "font-extrabold text-slate-900 mt-4 mb-1" : undefined
            }
            dangerouslySetInnerHTML={{
              __html: renderInline(joined).replace(/\n/g, "<br/>"),
            }}
          />
        );
      })}
    </>
  );
}
