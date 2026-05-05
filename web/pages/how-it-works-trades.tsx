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

function IconStar(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props} aria-hidden>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
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
    color: "amber",
    title: "Build your profile",
    tagline: "Stand out from the crowd",
    description:
      "Set up a free trade profile with photos of your work, service areas, and certifications. We run business checks and pull in your public ratings automatically, so homeowners see your credentials before you even say hello.",
    details: [
      "Upload photos of completed work - homeowners want to see it",
      "Choose your trades and service areas so we match you to the right jobs",
      "Verified status is checked automatically against UK business records",
      "Profile coaching tips help you fill the gaps that win more work",
    ],
  },
  {
    number: 2,
    icon: IconJob,
    color: "violet",
    title: "Get matched to jobs",
    tagline: "The right jobs find you",
    description:
      "We surface every project posted in your area and smart-rank it against your trade, location, and profile. Real-time notifications tell you the moment a matching job goes live - no browsing required.",
    details: [
      "Smart-ranked job deck - swipe through what fits your skills",
      "Real-time push notifications when a matching project posts",
      "See project insights up front - trades needed, complexity, timeline",
      "One-tap interest expression - no lengthy proposals or bidding wars",
    ],
  },
  {
    number: 3,
    icon: IconStar,
    color: "emerald",
    title: "Win work on reputation",
    tagline: "No commission, ever",
    description:
      "Homeowners see your Verified status, public rating, and community recommendations side by side. The better your reputation, the more matches you win - and we never take a cut of the work you book.",
    details: [
      "Verified businesses get a green badge that homeowners trust",
      "Community recommendations build your track record over time",
      "Optional paid passes or one-off unlocks if you want to reach unmatched homeowners",
      "When you win the work, the relationship is yours - we don't mediate the contract",
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
    q: "Is it free to join as a tradesperson?",
    a: "Yes - creating a profile and getting matched to jobs through swipes is completely free. You only pay if you choose to proactively reach a homeowner you didn't match with through the deck (a one-off unlock or a time-limited pass). There's no commission, no bidding fees, and no auto-renewal.",
  },
  {
    q: "How do you match me to the right jobs?",
    a: "When a homeowner posts a project, we work out which trades are needed and where. If your trade and service area fit, the job appears in your deck and we send a real-time notification. We also smart-rank the order so the best fits are at the top.",
  },
  {
    q: "What's the swipe deck?",
    a: "The deck is the simplest way to express interest. Each card is a job that matches your profile. Swipe right if you want to chat, swipe left to pass. If the homeowner also swipes right on your profile, you can chat in the app straight away.",
  },
  {
    q: "What are passes and one-off unlocks?",
    a: "Passes are optional paid tools for tradespeople who want to be more proactive. A one-off unlock lets you send a first message to a specific homeowner you haven't matched with through the deck. A time-limited pass (7, 14, or 30 days) lets you do that as often as you want during the period. No auto-renewal - you only pay when you buy.",
  },
  {
    q: "Do you take commission on jobs I win?",
    a: "Never. Once a homeowner contacts you, the relationship and the contract are entirely yours. We don't take a cut of the work, don't mediate the agreement, and don't charge per-lead.",
  },
  {
    q: "What verification do you do automatically?",
    a: "We confirm your business against UK public business records and pull in your public ratings and review count. It's all automatic - you don't need to do anything. Homeowners see this on your profile next to the Verified badge.",
  },
  {
    q: "What are profile coaching tips?",
    a: "We analyse your profile and suggest improvements - more photos, more trades, a warranty offer, etc. A stronger profile ranks higher in homeowner decks and wins more trust.",
  },
  {
    q: "Can homeowners chat with me directly?",
    a: "Yes. Once you both swipe right (or after a paid unlock), the in-app chat opens. You can share photos, agree dates, and finalise scope. Your phone number stays private until you choose to share it.",
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
        <meta
          name="description"
          content="How VetMyBuilder connects UK tradespeople with homeowners through community recommendations and smart-ranked matching."
        />
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">
        {/* HERO - cream wash with Sora display + Caveat emerald accent (trade tone) */}
        <section className="relative bg-[#fef6e9] pt-24 pb-12 sm:pt-28 sm:pb-16">
          <div className="relative mx-auto max-w-6xl px-5 sm:px-8 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100/80 border border-emerald-200 px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-emerald-800 mb-5">
                  Free to join. No commission.
                </div>
                <h1
                  className="text-[40px] sm:text-[56px] lg:text-[64px] font-black tracking-[-0.025em] text-slate-900 leading-[0.95]"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  Win more work,{" "}
                  <span
                    className="text-emerald-600"
                    style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
                  >
                    your way.
                  </span>
                </h1>
                <p className="mt-5 text-[16px] sm:text-lg text-slate-700 leading-relaxed max-w-xl">
                  We match you to local projects that fit your skills, verify your credentials automatically,
                  and put you in front of homeowners who are ready to hire. No cold calls, no bidding wars,
                  no commission.
                </p>
                {!user && (
                  <div className="mt-7">
                    <Link
                      href="/tradesman/register-tradesmen"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] sm:text-base font-extrabold text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                      style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                    >
                      Create your free profile
                      <IconArrowRight className="h-5 w-5" />
                    </Link>
                  </div>
                )}
              </div>

              {/* Illustration - sample tradesperson profile card */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="relative w-full max-w-sm">
                  <div className="bg-white rounded-3xl shadow-xl shadow-slate-300/50 p-5 border border-amber-100">
                    <div className="flex items-center gap-4 mb-4">
                      <div
                        className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-black text-white flex-shrink-0"
                        style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                      >
                        J
                      </div>
                      <div>
                        <div className="text-sm font-extrabold text-slate-900">J&amp;S Plumbing Ltd</div>
                        <div className="text-xs text-slate-400">Plumber · Gas Engineer</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-amber-500 text-xs">★★★★★</span>
                          <span className="text-xs text-slate-400">4.9 · 38 recommendations</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-amber-100 my-3" />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100/60">
                        <div className="text-2xl font-black text-amber-700">10%</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mt-0.5">Discount offered</div>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100/60">
                        <div className="text-2xl font-black text-emerald-700">1yr</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mt-0.5">Warranty</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100/60">
                      <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <IconCheck className="h-3 w-3 text-emerald-600" />
                      </div>
                      <span className="text-xs font-semibold text-slate-700">Verified business</span>
                    </div>
                  </div>

                  {/* Floating job-matches badge */}
                  <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-xl shadow-slate-200/70 px-4 py-3 flex items-center gap-2.5 border border-amber-100">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <IconJob className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">3 new job matches</div>
                      <div className="text-xs text-slate-400">In your area today</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STEPS */}
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
                  className="text-emerald-600"
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
          {user && !isTradesman ? (
            <>
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
                Post a job and let trusted tradespeople come to you.
              </p>
              <Link
                href="/projects/new"
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] sm:text-lg font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
              >
                Post a job
                <IconArrowRight className="h-5 w-5" />
              </Link>
            </>
          ) : (
            <>
              <h2
                className="mx-auto max-w-2xl text-[28px] sm:text-4xl font-black tracking-[-0.01em] text-slate-900 leading-tight"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Ready to start winning work?
              </h2>
              <p
                className="mt-2 text-amber-700 text-[24px] sm:text-3xl leading-none"
                style={{ fontFamily: "'Caveat', cursive" }}
              >
                Free to join. No commission. No bidding wars.
              </p>
              <Link
                href={user && isTradesman ? "/tradesman/jobs" : "/tradesman/register-tradesmen"}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] sm:text-lg font-extrabold text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
              >
                {user && isTradesman ? "Browse jobs" : "Create your free profile"}
                <IconArrowRight className="h-5 w-5" />
              </Link>
            </>
          )}
        </section>
      </div>
    </>
  );
}
