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
    description: "Describe what you need in plain English. We'll automatically break it down  - which trades are involved, complexity level, and an estimated budget range  - so you and your tradespeople are on the same page from day one.",
    details: [
      "Project insights generated instantly from your description",
      "Estimated budget range based on scope, property, and location",
      "Matched tradespeople in your area are notified automatically",
      "Edit or close your job at any time",
    ],
  },
  {
    number: 2,
    icon: IconCommunity,
    color: "emerald",
    title: "Gather recommendations",
    tagline: "Verified by your community",
    description: "Share your invite link with friends, neighbours, or local groups. Every recommendation is cross-checked  - Companies House verification, Google Reviews, and review quality analysis  - so you see the real picture, not just a name.",
    details: [
      "Recommenders share their own first-hand experience",
      "Every tradesperson checked against Companies House automatically",
      "Google ratings and review counts pulled in for extra confidence",
      "Review quality scored so generic one-liners don't outweigh detailed feedback",
    ],
  },
  {
    number: 3,
    icon: IconShortlist,
    color: "amber",
    title: "Shortlist & hire",
    tagline: "Matched to your project",
    description: "We rank tradespeople by how well they match your specific job  - trade type, location, reputation, and recommendation quality. Compare profiles side by side and hire the right person, not the loudest one.",
    details: [
      "Smart matching scores every tradesperson against your project",
      "Full profiles: past jobs, ratings, Google reviews, verified status",
      "Real-time notifications when new recommendations arrive",
      "No commission taken  - you deal directly with your tradesperson",
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
    a: "Yes  - completely free for homeowners. Always. We don't charge commission, we don't take a cut of any job. We make money through optional tools for tradespeople.",
  },
  {
    q: "How does VetMyBuilder know which tradespeople to match me with?",
    a: "When you post a job, we analyse your description to understand the trades involved, complexity, and location. We then match you with tradespeople whose skills and service areas fit your project, ranked by reputation and recommendation quality.",
  },
  {
    q: "What if I don't know many people locally?",
    a: "You can share your invite link in local Facebook groups, Nextdoor, or community WhatsApp chats. We also notify matching tradespeople in your area automatically  - they can express interest and share their profile with you.",
  },
  {
    q: "How is this different from review directories?",
    a: "Most directories rely on reviews from strangers. VetMyBuilder collects recommendations from people you actually know  - neighbours, friends, local community members. Every tradesperson is verified against Companies House and Google Reviews, and we score each recommendation for quality so detailed first-hand accounts carry more weight.",
  },
  {
    q: "What does 'verified' mean on VetMyBuilder?",
    a: "We automatically check every recommended tradesperson against the Companies House register and pull in their Google Reviews rating. You'll see their filing status, Google score, and review count right on their profile  - no manual vetting needed.",
  },
  {
    q: "How accurate is the budget estimate?",
    a: "The estimated budget range is generated from your project description, property type, and location. It's a guide to help you plan  - not a quote. Actual costs will depend on the tradesperson's site visit and final scope.",
  },
  {
    q: "Can a tradesperson pay to appear higher in results?",
    a: "No. Ranking is based on how well a tradesperson matches your project  - trade type, location, recommendation quality, and verification status. We don't accept paid placements.",
  },
];

export default function HowItWorks() {
  const { user } = useAuth();

  return (
    <>
      <Head>
        <title>How It Works - VetMyBuilder</title>
        <meta name="description" content="Learn how VetMyBuilder helps UK homeowners find trusted tradespeople through community recommendations." />
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">

        {/* HERO */}
        <section className="relative pt-6 pb-16 sm:pt-28 sm:pb-20 overflow-hidden bg-zinc-900">
          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-1.5 text-sm font-bold text-white/80 mb-6">
                  <span>Smart. Honest. Free.</span>
                </div>
                <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-[0.95] text-white">
                  How{" "}
                  <span className="text-red-500" style={{ fontFamily: "'Indie Flower', cursive" }}>VetMyBuilder</span>{" "}
                  works
                </h1>
                <p className="mt-6 text-xl text-zinc-400 leading-relaxed font-medium">
                  Post a job and we do the heavy lifting - matching you with the right tradespeople,
                  verifying their credentials, and surfacing quality recommendations from your community.
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

              {/* Illustration */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="relative w-full max-w-sm">
                  {/* Main project card */}
                  <div className="bg-white rounded-3xl shadow-2xl shadow-zinc-300/50 p-5 border border-zinc-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-red-50 flex items-center justify-center">
                          <IconProject className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                          <div className="text-sm font-black text-zinc-900">Bathroom refit, E4</div>
                          <div className="text-xs text-zinc-400">Posted 2 hours ago</div>
                        </div>
                      </div>
                      <span className="text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">Open</span>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-zinc-100 my-3" />

                    {/* Recommendations */}
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">3 Recommendations</div>
                    <div className="space-y-3">
                      {[
                        { name: "Sarah K.", note: "Used him for our kitchen - brilliant work!", stars: 5, bg: "bg-red-500" },
                        { name: "James T.", note: "Very reliable, great communication.", stars: 5, bg: "bg-emerald-500" },
                        { name: "Mark D.", note: "Competitive price, tidy finish.", stars: 4, bg: "bg-amber-500" },
                      ].map((r) => (
                        <div key={r.name} className="flex items-start gap-3 bg-zinc-50 rounded-2xl px-3 py-2.5">
                          <div className={`h-8 w-8 rounded-full ${r.bg} flex-shrink-0 flex items-center justify-center text-xs font-black text-white`}>
                            {r.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-zinc-800">{r.name}</span>
                              <span className="text-amber-400 text-xs">{"★".repeat(r.stars)}</span>
                            </div>
                            <p className="text-xs text-zinc-500 truncate">{r.note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Floating verified badge */}
                  <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-xl shadow-zinc-200/70 px-4 py-3 flex items-center gap-2.5 border border-zinc-100">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <IconCheck className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-zinc-900">Companies House</div>
                      <div className="text-xs text-zinc-400">Verified business</div>
                    </div>
                  </div>

                  {/* Floating share badge */}
                  <div className="absolute -top-4 -left-4 bg-white rounded-2xl shadow-xl shadow-zinc-200/70 px-4 py-3 flex items-center gap-2.5 border border-zinc-100">
                    <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <IconCommunity className="h-4 w-4 text-red-500" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-zinc-900">Invite link shared</div>
                      <div className="text-xs text-zinc-400">WhatsApp · Nextdoor</div>
                    </div>
                  </div>
                </div>
              </div>
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
                    <div className={`${isEven ? "lg:order-2" : ""} text-center sm:text-left`}>
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
              Ready to find your tradesperson?
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
