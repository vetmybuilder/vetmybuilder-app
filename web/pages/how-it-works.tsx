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

function IconChat(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
    color: "amber",
    title: "Tell us about your job",
    tagline: "Takes 2 minutes",
    description:
      "Describe what you need in plain English. We work out which trades are involved, the complexity, and an estimated budget range. We don't sell your number, and we never spam-blast it to a list of cold callers.",
    details: [
      "Project insights generated instantly from your description",
      "Estimated budget range based on scope, property and location",
      "Edit or close your job at any time",
      "Your contact details stay private until you want to share them",
    ],
  },
  {
    number: 2,
    icon: IconCommunity,
    color: "violet",
    title: "See your shortlist",
    tagline: "Hand-picked, smart-ranked",
    description:
      "Tradespeople your community rates, ranked by how well they fit your specific job. Swipe through them like a deck of cards. Pick who you want to talk to.",
    details: [
      "Smart-ranked by trade type, location, reputation and recommendation quality",
      "Verified businesses surfaced with a green badge",
      "Recommendations from people in your area carry more weight than strangers",
      "Real-time updates when new tradespeople match your job",
    ],
  },
  {
    number: 3,
    icon: IconChat,
    color: "emerald",
    title: "Chat directly. Hire when ready.",
    tagline: "Built-in messaging",
    description:
      "When you both swipe right, you can chat in the app. Share photos, agree dates, get the work done. No middlemen, no commission, no chasing.",
    details: [
      "Photos and details shared in-app, your phone number stays private",
      "Hire on your timeline - no pressure to commit early",
      "Report any concerns to our trust and safety team",
      "We never take a cut of the work you book",
    ],
  },
];

const colorMap = {
  amber: { circle: "linear-gradient(135deg,#fbbf24,#f59e0b)", icon: "bg-amber-50 text-amber-700", label: "text-amber-700", check: "bg-amber-500" },
  violet: { circle: "linear-gradient(135deg,#a78bfa,#7c3aed)", icon: "bg-violet-50 text-violet-700", label: "text-violet-700", check: "bg-violet-500" },
  emerald: { circle: "linear-gradient(135deg,#10b981,#059669)", icon: "bg-emerald-50 text-emerald-700", label: "text-emerald-700", check: "bg-emerald-500" },
};

const faqs = [
  {
    q: "Is VetMyBuilder free for homeowners?",
    a: "Yes - completely free. We don't charge homeowners to post jobs, get matched, or chat with a tradesperson. We make money through optional paid tools for tradespeople.",
  },
  {
    q: "How does VetMyBuilder match me with tradespeople?",
    a: "When you post a job, we work out which trades are involved, the complexity, and the location. We then surface tradespeople whose skills and service areas fit, ranked by reputation and the quality of their community recommendations. We call this smart ranking.",
  },
  {
    q: "What if I don't know many tradespeople locally?",
    a: "You don't need to. We'll match you with verified tradespeople in your area automatically. You can also share your job link in local groups (Facebook, Nextdoor, WhatsApp) to get extra recommendations from people you trust.",
  },
  {
    q: "How is this different from review directories?",
    a: "Most directories rely on reviews from strangers. VetMyBuilder weights recommendations from people in your local community more heavily, and we score each recommendation for quality so detailed first-hand accounts carry more weight than generic one-liners.",
  },
  {
    q: "What does 'Verified' mean on VetMyBuilder?",
    a: "We confirm a tradesperson's business against UK public business records and pull in their public ratings. You'll see their filing status and review count on their profile - no manual vetting needed. The Verified badge isn't a quality endorsement; it just means the business is real.",
  },
  {
    q: "How accurate is the budget estimate?",
    a: "It's a guide based on your description, property type and location - not a quote. Actual costs depend on the tradesperson's site visit and final scope.",
  },
  {
    q: "Can a tradesperson pay to appear higher in my results?",
    a: "No. Ranking is based on how well a tradesperson matches your job - trade type, location, recommendation quality, and Verified status. We don't accept paid placements.",
  },
  {
    q: "What does the chat do?",
    a: "Once you and a tradesperson both swipe right, you can message in the app, share photos, and agree dates. Your phone number stays private until you want to share it.",
  },
];

export default function HowItWorks() {
  const { user } = useAuth();

  return (
    <>
      <Head>
        <title>How It Works - VetMyBuilder</title>
        <meta
          name="description"
          content="How VetMyBuilder helps UK homeowners find trusted tradespeople through community recommendations and smart-ranked matching."
        />
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">
        {/* HERO - cream wash with Sora display + Caveat indigo accent */}
        <section className="relative bg-[#fef6e9] pt-24 pb-12 sm:pt-28 sm:pb-16">
          <div className="relative mx-auto max-w-6xl px-5 sm:px-8 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-100/80 border border-amber-200 px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-amber-800 mb-5">
                  Smart. Honest. Free for homeowners.
                </div>
                <h1
                  className="text-[40px] sm:text-[56px] lg:text-[64px] font-black tracking-[-0.025em] text-slate-900 leading-[0.95]"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  How it{" "}
                  <span
                    className="text-indigo-600"
                    style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
                  >
                    works
                  </span>
                </h1>
                <p className="mt-5 text-[16px] sm:text-lg text-slate-700 leading-relaxed max-w-xl">
                  Post a job. Meet a hand-picked, smart-ranked deck of tradespeople from your community. Chat
                  directly with the ones you like. No spam, no commission, no chasing.
                </p>
                {!user && (
                  <div className="mt-7">
                    <Link
                      href="/signup"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] sm:text-base font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                      style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                    >
                      Get started free
                      <IconArrowRight className="h-5 w-5" />
                    </Link>
                  </div>
                )}
              </div>

              {/* Illustration - project card with sample recommendations */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="relative w-full max-w-sm">
                  <div className="bg-white rounded-3xl shadow-xl shadow-slate-300/50 p-5 border border-amber-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
                          <IconProject className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                          <div className="text-sm font-extrabold text-slate-900">Bathroom refit, E4</div>
                          <div className="text-xs text-slate-400">Posted 2 hours ago</div>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">Open</span>
                    </div>

                    <div className="border-t border-amber-100 my-3" />

                    <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-3">3 recommendations</div>
                    <div className="space-y-3">
                      {[
                        { name: "Sarah K.", note: "Used him for our kitchen - brilliant work!", stars: 5, bg: "bg-emerald-500" },
                        { name: "James T.", note: "Very reliable, great communication.", stars: 5, bg: "bg-amber-500" },
                        { name: "Mark D.", note: "Competitive price, tidy finish.", stars: 4, bg: "bg-violet-500" },
                      ].map((r) => (
                        <div key={r.name} className="flex items-start gap-3 bg-amber-50 rounded-2xl px-3 py-2.5 border border-amber-100/60">
                          <div className={`h-8 w-8 rounded-full ${r.bg} flex-shrink-0 flex items-center justify-center text-xs font-black text-white`}>
                            {r.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-800">{r.name}</span>
                              <span className="text-amber-500 text-xs">{"★".repeat(r.stars)}</span>
                            </div>
                            <p className="text-xs text-slate-500 truncate">{r.note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Floating verified badge */}
                  <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-xl shadow-slate-200/70 px-4 py-3 flex items-center gap-2.5 border border-amber-100">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <IconCheck className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">Verified</div>
                      <div className="text-xs text-slate-400">Real UK business</div>
                    </div>
                  </div>

                  {/* Floating community badge */}
                  <div className="absolute -top-4 -left-4 bg-white rounded-2xl shadow-xl shadow-slate-200/70 px-4 py-3 flex items-center gap-2.5 border border-amber-100">
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <IconCommunity className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">From your community</div>
                      <div className="text-xs text-slate-400">Real local recommendations</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STEPS - alternating layout, warm card visuals */}
        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-8">
            <div className="space-y-16">
              {steps.map((step, idx) => {
                const c = colorMap[step.color as keyof typeof colorMap];
                const isEven = idx % 2 === 1;
                return (
                  <div
                    key={step.number}
                    className={`grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-12 items-center`}
                  >
                    {/* Text side */}
                    <div className={`${isEven ? "lg:order-2" : ""} text-center sm:text-left`}>
                      <div
                        className="inline-flex h-14 w-14 rounded-full items-center justify-center text-2xl font-black text-white mb-5 shadow-md"
                        style={{ background: c.circle }}
                      >
                        {step.number}
                      </div>
                      <div className={`text-[11px] font-extrabold uppercase tracking-[0.16em] mb-2 ${c.label}`}>
                        {step.tagline}
                      </div>
                      <h2
                        className="text-[28px] sm:text-3xl lg:text-4xl font-black text-slate-900 leading-tight mb-4"
                        style={{ fontFamily: "'Sora', sans-serif" }}
                      >
                        {step.title}
                      </h2>
                      <p className="text-[15px] sm:text-lg text-slate-600 leading-relaxed mb-7">
                        {step.description}
                      </p>
                      <ul className="space-y-3">
                        {step.details.map((d, i) => (
                          <li key={i} className="flex items-start gap-3 text-left">
                            <div className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center mt-0.5 ${c.check}`}>
                              <IconCheck className="h-3.5 w-3.5 text-white" />
                            </div>
                            <span className="text-slate-700 text-[14px] sm:text-[15px]">{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Visual side */}
                    <div className={isEven ? "lg:order-1" : ""}>
                      <div
                        className={`rounded-3xl p-12 flex items-center justify-center ${c.icon} aspect-square max-w-sm mx-auto border border-amber-100`}
                      >
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
        <section className="bg-[#fef6e9] py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-5 sm:px-8 lg:px-8">
            <div className="text-center mb-10">
              <h2
                className="text-[32px] sm:text-4xl font-black tracking-[-0.01em] text-slate-900 leading-tight"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Frequently asked{" "}
                <span
                  className="text-indigo-600"
                  style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
                >
                  questions
                </span>
              </h2>
            </div>
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100">
                  <h3
                    className="text-[16px] sm:text-lg font-extrabold text-slate-900 mb-2"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    {faq.q}
                  </h3>
                  <p className="text-[14px] sm:text-[15px] text-slate-600 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section
          className="px-5 sm:px-8 py-16 sm:py-20 text-center"
          style={{
            backgroundImage:
              "radial-gradient(#0000 1px, rgba(255,237,213,0.45) 1px), linear-gradient(135deg,#fff5e0,#ffe2c4)",
            backgroundSize: "8px 8px, 100% 100%",
          }}
        >
          <h2
            className="mx-auto max-w-2xl text-[28px] sm:text-4xl font-black tracking-[-0.01em] text-slate-900 leading-tight"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            Ready to find your tradesperson?
          </h2>
          <p
            className="mt-2 text-amber-700 text-[24px] sm:text-3xl leading-none"
            style={{ fontFamily: "'Caveat', cursive" }}
          >
            Let&apos;s find yours.
          </p>
          <Link
            href={user ? "/projects/new" : "/signup"}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] sm:text-lg font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
          >
            Start your project
            <IconArrowRight className="h-5 w-5" />
          </Link>
        </section>
      </div>
    </>
  );
}
