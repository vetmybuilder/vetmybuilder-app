// web/pages/how-it-works-trades.tsx
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/utils/auth";

function IconProfile(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconJob(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="2" />
      <path d="M8 14h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 11h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconDiscount(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="15" cy="15" r="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 19L19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
    icon: IconProfile,
    color: "red",
    title: "Build your profile",
    tagline: "Stand out from the crowd",
    description: "Create a free trade profile showcasing your skills, work photos, and certifications. We'll automatically verify your business against Companies House and pull in your Google Reviews  - so homeowners see your credentials before you even speak.",
    details: [
      "Upload photos of your completed work  - homeowners want to see it",
      "Choose your trades and service areas so we match you to the right jobs",
      "Automatically verified against Companies House and Google Reviews",
      "Profile coaching tips help you fill gaps that win more work",
    ],
  },
  {
    number: 2,
    icon: IconJob,
    color: "emerald",
    title: "Get matched to jobs",
    tagline: "The right jobs find you",
    description: "We analyse every project posted in your area and score how well it matches your trade, location, and profile. You'll be notified in real time when a matching job goes live  - no browsing required.",
    details: [
      "Jobs scored and ranked by how well they match your skills",
      "Real-time notifications when a matching project is posted",
      "See project insights  - trades needed, complexity, timeline",
      "One-tap interest expression  - no lengthy proposals",
    ],
  },
  {
    number: 3,
    icon: IconDiscount,
    color: "amber",
    title: "Win work on reputation",
    tagline: "No commission, ever",
    description: "Homeowners see your verified profile, Google rating, and community recommendations side by side. The better your reputation, the more work you win  - and we never take a cut.",
    details: [
      "Your Google rating and Companies House status shown automatically",
      "Community recommendations build your track record over time",
      "We never charge commission on jobs you win",
      "Homeowners contact you directly  - no middleman",
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
    q: "Is it free to join as a tradesperson?",
    a: "Yes  - creating your profile and getting matched to jobs is completely free. We offer optional paid tools to help you win more work, but there's no obligation.",
  },
  {
    q: "How do you match me to the right jobs?",
    a: "When a homeowner posts a project, we analyse the description to work out which trades are needed. If your trade and service area match, you're notified instantly  - no browsing through irrelevant listings.",
  },
  {
    q: "How does the recommendation system benefit me?",
    a: "When homeowners in your area gather recommendations, your name can appear on their shortlist through community word-of-mouth. You start the conversation with credibility  - not as a cold lead.",
  },
  {
    q: "Do you take commission on jobs I win?",
    a: "Never. Once a homeowner contacts you, the relationship is entirely yours. We don't charge commission, don't take a cut, and don't mediate the contract.",
  },
  {
    q: "What verification do you do automatically?",
    a: "We check your business against the Companies House register and pull in your Google Reviews rating and review count. It's all automatic  - you don't need to do anything. Homeowners see this on your profile.",
  },
  {
    q: "What are profile coaching tips?",
    a: "We analyse your profile and suggest improvements  - like adding more photos, listing additional trades, or setting a warranty. A stronger profile ranks higher in job matching and wins more homeowner trust.",
  },
];

export default function HowItWorksTrades() {
  const { user } = useAuth();
  const [isTradesman, setIsTradesman] = useState(false);

  useEffect(() => {
    try {
      setIsTradesman(sessionStorage.getItem("vmb:isTradesman") === "1");
    } catch {}
  }, []);

  return (
    <>
      <Head>
        <title>How It Works for Tradespeople - VetMyBuilder</title>
        <meta name="description" content="Learn how VetMyBuilder connects UK tradespeople with homeowners through trusted community recommendations." />
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">

        {/* HERO */}
        <section className="relative pt-6 pb-16 sm:pt-28 sm:pb-20 overflow-hidden bg-zinc-900">
          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-1.5 text-sm font-bold text-white/80 mb-6">
                  <span>Free to join. No commission.</span>
                </div>
                <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-[0.95] text-white">
                  Win more work with{" "}
                  <span className="text-red-500" style={{ fontFamily: "'Indie Flower', cursive" }}>VetMyBuilder</span>
                </h1>
                <p className="mt-6 text-xl text-zinc-400 leading-relaxed font-medium">
                  We match you to local projects that fit your skills, verify your credentials automatically,
                  and put you in front of homeowners who are ready to hire. No cold calls, no bidding wars.
                </p>
                {!user && (
                  <div className="mt-8">
                    <Link
                      href="/tradesman/register-tradesmen"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all"
                    >
                      Create your free profile
                      <IconArrowRight className="h-5 w-5" />
                    </Link>
                  </div>
                )}
              </div>

              {/* Illustration */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="relative w-full max-w-sm">
                  {/* Profile card */}
                  <div className="bg-white rounded-3xl shadow-2xl shadow-zinc-300/50 p-5 border border-zinc-100">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="h-14 w-14 rounded-2xl bg-red-500 flex items-center justify-center text-xl font-black text-white flex-shrink-0">
                        J
                      </div>
                      <div>
                        <div className="text-sm font-black text-zinc-900">J&amp;S Plumbing Ltd</div>
                        <div className="text-xs text-zinc-400">Plumber · Gas Engineer</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-amber-400 text-xs">★★★★★</span>
                          <span className="text-xs text-zinc-400">4.9 · 38 recommendations</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 my-3" />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-red-50 rounded-xl p-3 text-center">
                        <div className="text-2xl font-black text-red-500">10%</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-red-300 mt-0.5">Discount offered</div>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3 text-center">
                        <div className="text-2xl font-black text-emerald-600">1yr</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mt-0.5">Warranty</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 bg-zinc-50 rounded-xl px-3 py-2">
                      <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <IconCheck className="h-3 w-3 text-emerald-600" />
                      </div>
                      <span className="text-xs font-semibold text-zinc-600">Companies House verified</span>
                    </div>
                  </div>

                  {/* Floating interest badge */}
                  <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-xl shadow-zinc-200/70 px-4 py-3 flex items-center gap-2.5 border border-zinc-100">
                    <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <IconJob className="h-4 w-4 text-red-500" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-zinc-900">3 new job matches</div>
                      <div className="text-xs text-zinc-400">In your area today</div>
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
            {user && !isTradesman ? (
              <>
                <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
                  Ready to find your builder?
                </h2>
                <p className="text-xl text-zinc-400 mb-10">
                  Post a job and let trusted tradespeople come to you.
                </p>
                <Link
                  href="/projects/new"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-10 py-5 text-lg font-bold text-white hover:scale-[1.02] hover:shadow-xl transition-all"
                >
                  Post a job
                  <IconArrowRight className="h-5 w-5" />
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
                  Ready to start winning work?
                </h2>
                <p className="text-xl text-zinc-400 mb-10">
                  Free to join. No commission. No bidding wars.
                </p>
                <Link
                  href={user && isTradesman ? "/tradesman/projects" : "/tradesman/register-tradesmen"}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-10 py-5 text-lg font-bold text-white hover:scale-[1.02] hover:shadow-xl transition-all"
                >
                  {user && isTradesman ? "Browse jobs" : "Create your free profile"}
                  <IconArrowRight className="h-5 w-5" />
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
