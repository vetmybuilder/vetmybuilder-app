// web/pages/legal.tsx
// Legal hub - a single discoverable index of every policy and disclosure.
// Footer links the essentials directly (Privacy, Terms, Cookies) and
// points here for everything else, so the footer stays scannable and
// users can still find the full set.
import Head from "next/head";
import Link from "next/link";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";

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
      "The small number of cookies and browser-storage keys we use, and what each one does.",
    group: "Your data",
  },
  {
    title: "Sub-processors",
    href: "/sub-processors",
    description:
      "The third-party services that process your data on our behalf (authentication, payments, storage, AI).",
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
    title: "Refund Policy",
    href: "/refund-policy",
    description:
      "When we refund tradesperson payments, when we don't, and how to request one.",
    group: "Using the platform",
  },
  {
    title: "Acceptable Use Policy",
    href: "/acceptable-use",
    description:
      "What you can and can't post, photo and chat conduct rules, and consequences for breaking them.",
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
      "Why you see tradespeople in the order you do, and what does and doesn't influence the order.",
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
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">
        {/* HERO - cream wash with Sora display + Caveat indigo accent.
            BrandWatermarkScatter overlays the cream chrome so this page
            matches /projects, /login, /signup, etc. */}
        <section className="relative bg-[#fef6e9] pt-24 pb-12 sm:pt-28 sm:pb-16 overflow-hidden">
          <BrandWatermarkScatter />
          <div className="relative z-10 mx-auto max-w-3xl px-5 sm:px-8 lg:px-8">
            <div className="inline-block rounded-full bg-amber-100/80 border border-amber-200 px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-amber-800 mb-5 whitespace-nowrap">
              Legal & policies
            </div>
            <h1
              className="text-[40px] sm:text-[56px] lg:text-[64px] font-black tracking-[-0.025em] text-slate-900 leading-[0.95]"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Everything in{" "}
              <span
                className="text-indigo-600"
                style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
              >
                one place
              </span>
            </h1>
            <p className="mt-5 text-[16px] sm:text-lg text-slate-700 leading-relaxed max-w-2xl">
              The full set of VetMyBuilder policies. Pick the one you need - or skim the
              descriptions to work out which applies.
            </p>
          </div>
        </section>

        {/* CONTENT - cream backdrop, white cards with amber border */}
        <section className="relative bg-[#fef6e9] pb-16 overflow-hidden">
          <BrandWatermarkScatter />
          <div className="relative z-10 mx-auto max-w-3xl px-5 sm:px-8 lg:px-8">
            <div className="space-y-8">
              {GROUPS.map((group) => (
                <div key={group}>
                  <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-3">
                    {group}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {POLICIES.filter((p) => p.group === group).map((p) => (
                      <Link
                        key={p.href}
                        href={p.href}
                        className="group block rounded-2xl border border-amber-100 bg-white p-5 shadow-sm hover:border-indigo-200 hover:shadow-md hover:-translate-y-[1px] transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3
                            className="text-base font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors"
                            style={{ fontFamily: "'Sora', sans-serif" }}
                          >
                            {p.title}
                          </h3>
                          <span
                            className="text-amber-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0"
                            aria-hidden="true"
                          >
                            →
                          </span>
                        </div>
                        <p className="mt-2 text-[13.5px] text-slate-600 leading-relaxed">
                          {p.description}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 bg-white rounded-3xl p-7 sm:p-9 text-center border border-amber-100 shadow-sm">
              <h3
                className="text-xl sm:text-2xl font-extrabold text-slate-900"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Can&apos;t find what you need?
              </h3>
              <p className="mt-1.5 text-[14px] sm:text-[15px] text-slate-600">
                Email us and a person will reply.
              </p>
              <a
                href="mailto:hello@vetmybuilder.com"
                className="mt-5 inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
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
