// web/pages/legal.tsx
// Legal hub - a single discoverable index of every policy and disclosure.
// Footer links the essentials directly (Privacy, Terms, Cookies) and
// points here for everything else, so the footer stays scannable and
// users can still find the full set.
import Head from "next/head";
import Link from "next/link";

type Policy = {
  title: string;
  href: string;
  description: string;
  group: "Your data" | "Using the platform" | "Trust & safety";
};

const POLICIES: Policy[] = [
  {
    title: "Privacy Policy",
    href: "/privacy",
    description:
      "What personal data we collect, why we collect it, and your rights under UK GDPR.",
    group: "Your data",
  },
  {
    title: "Cookie Policy",
    href: "/cookies",
    description:
      "The small number of cookies and browser storage keys we use, and what each one does.",
    group: "Your data",
  },
  {
    title: "Sub-processors",
    href: "/sub-processors",
    description:
      "The third-party services that process your data on our behalf (Firebase, Google, Companies House).",
    group: "Your data",
  },
  {
    title: "Terms of Service",
    href: "/terms",
    description:
      "The agreement between you and us when you use VetMyBuilder.",
    group: "Using the platform",
  },
  {
    title: "Acceptable Use Policy",
    href: "/acceptable-use",
    description:
      "What you can and can't post, photo upload rules, and consequences for breaking them.",
    group: "Using the platform",
  },
  {
    title: "Complaints",
    href: "/complaints",
    description:
      "How to raise a concern, how we investigate, and what to expect in response.",
    group: "Using the platform",
  },
  {
    title: "What Verified means",
    href: "/verified",
    description:
      "What the green Verified badge actually represents - and what it doesn't.",
    group: "Trust & safety",
  },
  {
    title: "Ranking Transparency",
    href: "/ranking",
    description:
      "Why you see tradespeople in the order you do, and what does and doesn't influence it.",
    group: "Trust & safety",
  },
  {
    title: "Content Moderation",
    href: "/moderation",
    description:
      "How we review reports, the actions we can take, and your right to appeal.",
    group: "Trust & safety",
  },
];

const GROUPS: Array<Policy["group"]> = [
  "Your data",
  "Using the platform",
  "Trust & safety",
];

export default function LegalHub() {
  return (
    <>
      <Head>
        <title>Legal & policies - VetMyBuilder</title>
        <meta
          name="description"
          content="All VetMyBuilder policies and legal documents in one place."
        />
      </Head>

      <div className="overflow-x-hidden -mt-14">
        {/* HERO (unchanged - stone background + red rotated shape) */}
        <section className="relative pt-6 pb-12 sm:pt-28 overflow-hidden bg-stone-50">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          </div>
          <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-zinc-800 mb-6">
              Legal & policies
            </div>
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-zinc-900 leading-[0.95]">
              Everything in <span className="text-red-500">one place</span>
            </h1>
            <p className="mt-6 text-xl text-zinc-600 leading-relaxed font-medium max-w-2xl">
              The full set of VetMyBuilder policies. Pick the one you need -
              or skim the descriptions to work out which applies.
            </p>
          </div>
        </section>

        {/* CONTENT - no solid background so the global Layout image shows
            through between cards. Each card keeps a white fill for
            readability. */}
        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="space-y-10">
              {GROUPS.map((group) => (
                <div key={group}>
                  <h2 className="text-xs font-black uppercase tracking-wider text-white/90 mb-5 drop-shadow">
                    {group}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {POLICIES.filter((p) => p.group === group).map((p) => (
                      <Link
                        key={p.href}
                        href={p.href}
                        className="group block rounded-2xl border border-white/20 bg-white/95 backdrop-blur p-5 hover:border-red-300 hover:bg-white hover:shadow-xl transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-base font-bold text-zinc-900 group-hover:text-red-600 transition-colors">
                            {p.title}
                          </h3>
                          <span
                            className="text-zinc-300 group-hover:text-red-400 transition-colors shrink-0"
                            aria-hidden="true"
                          >
                            →
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
                          {p.description}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-14 bg-white/95 backdrop-blur rounded-3xl p-8 text-center shadow-xl">
              <h3 className="text-xl font-black text-zinc-900 mb-3">
                Can't find what you need?
              </h3>
              <p className="text-zinc-600 mb-4">
                Email us and a person will reply.
              </p>
              <a
                href="mailto:hello@vetmybuilder.com"
                className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white hover:scale-[1.02] transition-all"
              >
                hello@vetmybuilder.com
              </a>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
