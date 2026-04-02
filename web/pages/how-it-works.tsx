// web/pages/how-it-works.tsx
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/utils/auth";

function IconProject(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="2" />
      <circle cx="7" cy="7" r="1" fill="currentColor" />
      <circle cx="11" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

function IconCommunity(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M3 19a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="2" />
      <path d="M11 19a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconShortlist(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconCheck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const steps = [
  {
    number: 1,
    icon: IconProject,
    color: "red",
    title: "Post your job",
    tagline: "Takes 2 minutes",
    description: 'Add a quick brief — type of work, rough location, timescale. Something like "bathroom refit in E4" is enough to get started.',
    details: [
      "No lengthy forms or complicated sign-ups",
      "You get a unique shareable invite link instantly",
      "Your job is private — only people you invite can see it",
      "Edit or close your job at any time",
    ],
  },
  {
    number: 2,
    icon: IconCommunity,
    color: "emerald",
    title: "Gather recommendations",
    tagline: "From people you trust",
    description: "Share your invite link with friends, family, neighbours, or local community groups. They submit real recommendations with honest ratings.",
    details: [
      "Recommenders share their own first-hand experience",
      "Ratings cover quality, reliability, communication and price",
      "Anonymous feedback is never accepted — all real people",
      "Works in WhatsApp groups, Nextdoor, Facebook, anywhere",
    ],
  },
  {
    number: 3,
    icon: IconShortlist,
    color: "amber",
    title: "Shortlist & hire",
    tagline: "With confidence",
    description: "Compare the recommended builders side by side. See who has been verified against Companies House. Build your shortlist and reach out.",
    details: [
      "See full profiles: past jobs, ratings, verified status",
      "Companies House verification for registered firms",
      "Shortlist multiple builders and compare quotes",
      "No commission taken — you deal directly",
    ],
  },
];

const colorMap = {
  red: { circle: "bg-red-500", icon: "bg-red-50 text-red-500", label: "text-red-500", check: "bg-red-500" },
  emerald: { circle: "bg-emerald-600", icon: "bg-emerald-50 text-emerald-600", label: "text-emerald-700", check: "bg-emerald-600" },
  amber: { circle: "bg-amber-500", icon: "bg-amber-50 text-amber-600", label: "text-amber-600", check: "bg-amber-500" },
};

const faqs = [
  {
    q: "Is VetMyBuilder free to use?",
    a: "Yes — completely free for homeowners. Always. We don't charge commission, we don't take a cut of any job. We make money through optional tools for tradespeople.",
  },
  {
    q: "What if I don't know many people locally?",
    a: "You can share your invite link in local Facebook groups, Nextdoor, or community WhatsApp chats. You'd be surprised how many people are happy to share their builder experiences.",
  },
  {
    q: "How is this different from Checkatrade or Trustpilot?",
    a: "Those platforms collect reviews from anyone, including strangers. We collect recommendations from people in your network — people whose opinion you actually trust. It's the difference between a random online review and a tip from your neighbour.",
  },
  {
    q: "What does 'verified against Companies House' mean?",
    a: "For builders registered as a limited company or LLP, we automatically check their filing status and company details against the Companies House public register. It adds an extra layer of legitimacy.",
  },
  {
    q: "Can a builder pay to appear higher in results?",
    a: "No. We don't accept paid placements or sponsored listings. Ranking is entirely based on the quality and quantity of recommendations from real people.",
  },
];

export default function HowItWorks() {
  const { user } = useAuth();

  return (
    <>
      <Head>
        <title>How It Works — VetMyBuilder</title>
        <meta name="description" content="Learn how VetMyBuilder helps UK homeowners find trusted builders through community recommendations." />
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">

        {/* HERO */}
        <section className="relative pt-24 pb-16 sm:pt-28 sm:pb-20 overflow-hidden bg-stone-50">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          </div>
          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-zinc-800 mb-6">
                <span>Simple. Honest. Free.</span>
              </div>
              <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-[0.95] text-zinc-900">
                How{" "}
                <span className="text-red-500">VetMyBuilder</span>{" "}
                works
              </h1>
              <p className="mt-6 text-xl text-zinc-600 leading-relaxed font-medium">
                No directories. No paid reviews. No guesswork. Just trusted recommendations
                from real people in your community — in three simple steps.
              </p>
              {!user && (
                <div className="mt-8">
                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all"
                  >
                    Get started free
                    <IconArrowRight className="h-5 w-5" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* STEPS */}
        <section className="bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="space-y-16">
              {steps.map((step, idx) => {
                const c = colorMap[step.color as keyof typeof colorMap];
                const isEven = idx % 2 === 1;
                return (
                  <div
                    key={step.number}
                    className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${isEven ? "lg:flex-row-reverse" : ""}`}
                  >
                    {/* Text side */}
                    <div className={isEven ? "lg:order-2" : ""}>
                      <div className={`inline-flex h-14 w-14 rounded-full items-center justify-center text-2xl font-black text-white mb-6 ${c.circle}`}>
                        {step.number}
                      </div>
                      <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${c.label}`}>{step.tagline}</div>
                      <h2 className="text-3xl sm:text-4xl font-black text-zinc-900 mb-4">{step.title}</h2>
                      <p className="text-lg text-zinc-600 leading-relaxed mb-8">{step.description}</p>
                      <ul className="space-y-3">
                        {step.details.map((d, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <div className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center mt-0.5 ${c.check}`}>
                              <IconCheck className="h-3.5 w-3.5 text-white" />
                            </div>
                            <span className="text-zinc-700 font-medium">{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Visual side */}
                    <div className={isEven ? "lg:order-1" : ""}>
                      <div className={`rounded-3xl p-12 flex items-center justify-center ${c.icon} aspect-square max-w-sm mx-auto`}>
                        <step.icon className="h-32 w-32 opacity-80" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-[#faf0e6] py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-4xl font-black text-zinc-900">Frequently asked questions</h2>
            </div>
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100">
                  <h3 className="text-lg font-black text-zinc-900 mb-2">{faq.q}</h3>
                  <p className="text-zinc-600 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-zinc-900 py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
              Ready to find your builder?
            </h2>
            <p className="text-xl text-zinc-400 mb-10">
              Post your job in 2 minutes. It&apos;s completely free.
            </p>
            <Link
              href={user ? "/projects/new" : "/signup"}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-10 py-5 text-lg font-bold text-white hover:scale-[1.02] hover:shadow-xl transition-all"
            >
              Start your project
              <IconArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
