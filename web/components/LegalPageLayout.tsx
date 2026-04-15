// web/components/LegalPageLayout.tsx
// Shared layout for every on-site legal / compliance page (privacy,
// terms, cookies, acceptable-use, verified, complaints, moderation,
// ranking, sub-processors). Keeps the visual language consistent with
// the existing privacy page and lets us add new pages without
// duplicating the hero/content scaffolding every time.
import Head from "next/head";
import Link from "next/link";
import React from "react";

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
        {/* No body background override so the global Layout builder
            image shows through behind the content section. The hero
            keeps its own opaque stone background. */}
      </Head>

      <div className="overflow-x-hidden -mt-14">
        {/* HERO */}
        <section className="relative pt-6 pb-12 sm:pt-28 overflow-hidden bg-stone-50">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          </div>
          <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-zinc-800 mb-6">
              Last updated: {lastUpdated}
            </div>
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-zinc-900 leading-[0.95]">
              {title}
              {titleAccent && (
                <>
                  {" "}
                  <span className="text-red-500">{titleAccent}</span>
                </>
              )}
            </h1>
            {subtitle && (
              <p className="mt-6 text-xl text-zinc-600 leading-relaxed font-medium max-w-2xl">
                {subtitle}
              </p>
            )}
          </div>
        </section>

        {/* CONTENT - transparent section so the global builder image
            shows through. The long-form prose sits in a single
            translucent white card for readability. */}
        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-8 sm:p-12">
              {summary && (
                <div className="bg-emerald-50 rounded-3xl p-6 mb-10 border border-emerald-100">
                  {summary}
                </div>
              )}

              <div className="space-y-10">
                {sections.map((section, i) => (
                  <div
                    key={i}
                    className="border-b border-zinc-100 pb-10 last:border-0 last:pb-0"
                  >
                    <h2 className="text-2xl font-black text-zinc-900 mb-4">
                      {numbered ? `${i + 1}. ${section.title}` : section.title}
                    </h2>
                    <div className="text-zinc-600 leading-relaxed space-y-3">
                      {section.content.split("\n\n").map((para, j) => (
                        <ParagraphBlock key={j} text={para} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 bg-white/95 backdrop-blur rounded-3xl shadow-xl p-8 text-center">
              <h3 className="text-xl font-black text-zinc-900 mb-3">
                Questions?
              </h3>
              <p className="text-zinc-600 mb-4">
                We&apos;re happy to help. Reach us anytime.
              </p>
              {footerCtaHref.startsWith("http") ||
              footerCtaHref.startsWith("mailto:") ? (
                <a
                  href={footerCtaHref}
                  className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white hover:scale-[1.02] transition-all"
                >
                  {footerCtaLabel}
                </a>
              ) : (
                <Link
                  href={footerCtaHref}
                  className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white hover:scale-[1.02] transition-all"
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
              className="list-disc list-outside ml-5 space-y-1 marker:text-red-400"
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
          chunk.lines[0].startsWith("**") &&
          chunk.lines[0].endsWith("**");
        return (
          <p
            key={i}
            className={
              isHeading ? "font-semibold text-zinc-800 mt-4 mb-1" : undefined
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
