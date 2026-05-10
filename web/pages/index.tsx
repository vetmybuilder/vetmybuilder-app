// web/pages/index.tsx
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/utils/auth";
import Footer from "@/components/Footer";
import HomeStats from "@/components/home/HomeStats";
import HomeContactSection from "@/components/home/HomeContactSection";

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

const REVIEWS = [
  { name: "Sarah T.", location: "Walthamstow", job: "Plumbing", stars: 5, bg: "bg-emerald-600", quote: "We had a leak under the kitchen sink that had been driving us mad for weeks. Found a plumber through vetmybuilder and he came out the next morning, sorted it in under an hour. Really impressed." },
  { name: "James R.", location: "Chingford", job: "Kitchen Renovation", stars: 5, bg: "bg-blue-600", quote: "We were nervous about getting the kitchen done but the builder vetmybuilder matched us with was brilliant. Kept everything tidy, finished on time, and it looks amazing." },
  { name: "Priya K.", location: "Leyton", job: "Locksmith", stars: 5, bg: "bg-violet-600", quote: "Got locked out on a Sunday evening and was panicking. Posted on vetmybuilder and had a vetted locksmith at my door within the hour. Absolute lifesaver." },
  { name: "Mark D.", location: "Highams Park", job: "Loft Conversion", stars: 5, bg: "bg-amber-600", quote: "Our loft conversion was a big project and we wanted someone we could trust. vetmybuilder recommended a builder who was fantastic from start to finish. Could not be happier with the result." },
  { name: "Laura M.", location: "Leytonstone", job: "Bathroom Refit", stars: 5, bg: "bg-cyan-600", quote: "Had the whole bathroom ripped out and refitted. The tiler vetmybuilder matched us with did a beautiful job. No stress at all, which is rare with bathroom work." },
  { name: "David H.", location: "Walthamstow", job: "Electrician", stars: 5, bg: "bg-rose-600", quote: "Needed a full rewire on a 1930s house which is never straightforward. The electrician was professional, fully certified, and his price was very fair for the amount of work involved." },
  { name: "Amina B.", location: "Chingford", job: "Cleaning", stars: 4, bg: "bg-teal-600", quote: "Booked an end of tenancy clean through vetmybuilder. They did a thorough job and the landlord was happy, which is all that matters. Nice to know they were properly vetted too." },
  { name: "Tom W.", location: "Leyton", job: "Painting & Decorating", stars: 5, bg: "bg-orange-600", quote: "Had the whole house painted inside and out. The decorators were tidy, quick, and the finish is spot on. My wife is over the moon with the colours we picked." },
  { name: "Rachel S.", location: "Highams Park", job: "Landscaping", stars: 5, bg: "bg-lime-600", quote: "Our garden was a complete mess after years of neglect. The landscaper vetmybuilder recommended transformed it into something we actually want to sit in now. Really creative ideas too." },
  { name: "Chris P.", location: "Leytonstone", job: "Roofing", stars: 5, bg: "bg-indigo-600", quote: "Had a few tiles come off in a storm and needed it sorted quickly before the rain got worse. The roofer was out within two days, gave an honest quote, and did a proper job. No hidden costs." },
  { name: "Karen L.", location: "Walthamstow", job: "External Wall Insulation", stars: 5, bg: "bg-sky-600", quote: "vetmybuilder recommended Elegant Building Services for our external wall insulation. They did a fantastic job and the house is noticeably warmer. Our energy bills have already come down." },
  { name: "Michael O.", location: "Chingford", job: "Insulation", stars: 5, bg: "bg-fuchsia-600", quote: "Had cavity wall insulation done by Elegant Building Services after vetmybuilder recommended them. They were professional from start to finish and the price was really reasonable for what we got." },
  { name: "Helen G.", location: "Leyton", job: "External Wall Insulation", stars: 5, bg: "bg-emerald-700", quote: "We had external wall insulation fitted by Elegant Building Services and the difference has been incredible. The house holds heat so much better now and it looks great from the outside too." },
  { name: "Diane F.", location: "Walthamstow", job: "Bin Cleaning", stars: 5, bg: "bg-zinc-600", quote: "vetmybuilder recommended thebinwisperer for our wheelie bin clean. The bins came back looking and smelling like new. Such a simple thing but it makes a big difference." },
  { name: "Stuart N.", location: "Chingford", job: "Bin Cleaning", stars: 5, bg: "bg-slate-600", quote: "Had all our bins cleaned by thebinwisperer through vetmybuilder. Quick, affordable, and they genuinely look brand new. Going to make it a regular thing now." },
];

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function HeroReviewCard() {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % REVIEWS.length);
        setFade(true);
      }, 180);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const r = REVIEWS[idx]!;

  return (
    <div className="px-5 py-4 sm:px-6 sm:py-5">
      <div className={`flex items-start gap-3 sm:gap-4 transition-opacity duration-200 ${fade ? "opacity-100" : "opacity-0"}`}>
        <div
          className={`flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full ${r.bg} flex items-center justify-center text-base font-bold text-white shadow-sm`}
        >
          {r.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-amber-500 mb-1">
            {[...Array(r.stars)].map((_, i) => (
              <StarIcon key={i} className="h-3.5 w-3.5" />
            ))}
          </div>
          <p
            className="text-slate-800 text-[13.5px] sm:text-[15px] leading-snug italic line-clamp-3"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            &ldquo;{r.quote}&rdquo;
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1.5">
            <strong className="text-slate-700">{r.name}</strong> &middot; {r.location} &middot; {r.job}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-4">
        {REVIEWS.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show review ${i + 1}`}
            onClick={() => {
              setFade(false);
              setTimeout(() => { setIdx(i); setFade(true); }, 180);
            }}
            className={`h-2 rounded-full transition-all duration-300 ${i === idx ? "w-7 bg-amber-500" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();

  const isTrades = user
    ? (() => {
        try { return sessionStorage.getItem("vmb:isTradesman") === "1"; } catch { return false; }
      })()
    : false;

  function rememberReturnTo() {
    try {
      if (!sessionStorage.getItem("vmb:returnTo")) {
        sessionStorage.setItem("vmb:returnTo", "/");
      }
    } catch {
      /* noop */
    }
  }

  const steps = isTrades
    ? [
        {
          number: 1,
          icon: IconProject,
          title: "Build your profile",
          tagline: "Stand out from the crowd",
          description: "Set up your trade profile with photos, service areas, and certifications. We'll run business checks and pull in your Google Reviews automatically.",
          color: "red",
        },
        {
          number: 2,
          icon: IconCommunity,
          title: "Get matched to jobs",
          tagline: "The right jobs find you",
          description: "We analyse every project posted in your area and notify you in real time when one matches your trade and location - no browsing required.",
          color: "emerald",
        },
        {
          number: 3,
          icon: IconShortlist,
          title: "Win work on reputation",
          tagline: "No commission, ever",
          description: "Homeowners see your verified profile, Google rating, and community recommendations side by side. The better your reputation, the more work you win.",
          color: "amber",
        },
      ]
    : [
        {
          number: 1,
          icon: IconProject,
          title: "Tell us about your job",
          tagline: "Takes 1 minute",
          description: "A few details, photos if you have them. We don't sell your number, and we never spam-blast it to a list of cold callers.",
          color: "red",
        },
        {
          number: 2,
          icon: IconCommunity,
          title: "See your shortlist",
          tagline: "Hand-picked, smart-ranked",
          description: "Tradespeople your community rates, ranked by how well they fit your job. Swipe through them like a deck of cards. Pick who you want to talk to.",
          color: "emerald",
        },
        {
          number: 3,
          icon: IconShortlist,
          title: "Chat directly. Hire when ready.",
          tagline: "Built-in messaging",
          description: "When you both swipe right, you can chat in the app. Share photos, agree dates, get the work done. No middlemen, no commission.",
          color: "amber",
        },
      ];

  return (
    <>
      <Head>
        <title>VetMyBuilder · Trades, made personal</title>
        <meta name="description" content="Find a tradesperson the personal way. Hand-picked by your community, verified by us, ready to chat. No spam-and-pray lead-gen." />
        {/* Override body background to cream so the header gap area blends in */}
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">
        {/* HERO - photo-led, warm cream wash bleeding into the copy below.
            A floating glassy review-ticker card straddles the photo and
            the cream block so social proof is the first thing in view. */}
        <section className="relative bg-[#fef6e9]" aria-label="Hero">
          <div className="relative aspect-[4/5] sm:aspect-[16/9] lg:aspect-[5/2] xl:aspect-[12/5] overflow-hidden">
            {/* Mobile-only portrait crop */}
            <Image
              src="/hero-mobile.png"
              alt=""
              fill
              priority
              sizes="(max-width: 767px) 100vw, 0vw"
              className="md:hidden object-cover object-center"
            />
            {/* Desktop wide hero - shifted slightly left so the
                tradesman in the photo isn't covered by the bottom-right
                review card. */}
            <Image
              src="/hero.png"
              alt=""
              fill
              priority
              sizes="(min-width: 768px) 100vw, 0vw"
              className="hidden md:block object-cover object-left scale-[1.08] -translate-x-[6%] origin-left"
            />
            <div
              className="absolute inset-0"
              style={{
                // Two layered scrims:
                //   1. Vertical fade darkens the bottom (where mobile +
                //      desktop CTAs land).
                //   2. Horizontal fade darkens the left third (where the
                //      eyebrow + headline live) so white copy stays
                //      legible over the light interior wall behind the
                //      tradesperson in the photo.
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.30) 70%, rgba(0,0,0,0.55) 100%), linear-gradient(90deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0) 65%)",
              }}
            />


            <div className="absolute inset-0 flex flex-col justify-start pt-20 sm:pt-24 md:justify-end md:pt-0 md:pb-12 lg:pb-16">
              <div className="w-full max-w-6xl mx-auto md:mx-0 px-5 sm:px-8 md:pl-10 lg:pl-14 xl:pl-20">
                <div className="max-w-2xl">
                {!isTrades && (
                  <p
                    className="text-[13px] sm:text-sm font-extrabold uppercase tracking-[0.18em] text-white mb-4"
                    style={{
                      textShadow:
                        "0 1px 2px rgba(0,0,0,0.55), 0 2px 12px rgba(0,0,0,0.45)",
                    }}
                  >
                    Hundreds of vetted tradespeople nearby.
                  </p>
                )}
                <h1
                  className="font-black tracking-[-0.02em] text-amber-300 drop-shadow-lg leading-[0.95] text-[40px] sm:text-[52px] lg:text-[64px] xl:text-[72px]"
                  style={{ fontFamily: "'Caveat', cursive" }}
                >
                  {isTrades ? "Work, your way." : "Let’s find yours."}
                </h1>

                {/* Desktop-only CTAs sit inside the hero overlay so the
                    primary action is above the fold without scrolling.
                    Mobile keeps the existing CTAs in the cream block below
                    the photo (where they have room to breathe). */}
                <div className="hidden md:flex mt-6 lg:mt-8 flex-wrap gap-3">
                  {isTrades ? (
                    <>
                      <Link
                        href="/tradesman/jobs"
                        data-testid="hero-cta"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] lg:text-lg font-extrabold text-white shadow-lg shadow-emerald-500/40 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                        style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                      >
                        View available jobs
                        <IconArrowRight className="h-5 w-5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/95 backdrop-blur border-[1.5px] border-white/60 px-6 py-3.5 text-[14px] lg:text-base font-extrabold text-slate-800 hover:bg-white transition-colors shadow-lg"
                      >
                        See how it works
                      </button>
                    </>
                  ) : user ? (
                    <>
                      <Link
                        href="/projects/new"
                        data-testid="hero-cta"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] lg:text-lg font-extrabold text-white shadow-lg shadow-indigo-500/40 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                        style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                      >
                        Post a new job
                        <IconArrowRight className="h-5 w-5" />
                      </Link>
                      <Link
                        href="/projects"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/95 backdrop-blur border-[1.5px] border-white/60 px-6 py-3.5 text-[14px] lg:text-base font-extrabold text-slate-800 hover:bg-white transition-colors shadow-lg"
                      >
                        My projects
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/projects/new"
                        onClick={rememberReturnTo}
                        data-testid="hero-cta"
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[13px] lg:text-[14px] font-extrabold text-white shadow-lg shadow-indigo-500/40 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                        style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                      >
                        Post a job
                        <IconArrowRight className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/95 backdrop-blur border-[1.5px] border-white/60 px-5 py-2.5 text-[13px] lg:text-[14px] font-extrabold text-slate-800 hover:bg-white transition-colors shadow-lg"
                      >
                        See how it works
                      </button>
                    </>
                  )}
                </div>
                </div>
              </div>
            </div>

            {/* Review card pinned bottom-right of the hero on desktop /
                bottom-centre on mobile. White card on top of the photo
                in both viewports. The hero image is anchored to the
                left on desktop so the tradesman in the photo isn't
                covered. */}
            <div className="absolute bottom-4 left-4 right-4 md:left-auto md:bottom-6 md:right-6 lg:bottom-8 lg:right-8 z-10 mx-auto md:mx-0 w-auto md:w-full max-w-xs">
              <div className="rounded-2xl bg-white/95 backdrop-blur shadow-xl ring-1 ring-white/40">
                <HeroReviewCard />
              </div>
            </div>
          </div>

          {/* Cream block continuing below the photo. Mobile-only - just
              CTAs (the supporting paragraph + ratings/verified strip
              previously here were dropped to match the desktop cleanup).
              Desktop pulls the CTAs up into the hero overlay so above-
              the-fold value is clear without scrolling. */}
          <div className="md:hidden px-5 sm:px-8 pt-6 pb-9">
            <div className="mx-auto max-w-md">
              {isTrades ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/tradesman/jobs"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] sm:text-lg font-extrabold text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                    style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                    data-testid="hero-cta"
                  >
                    View available jobs
                    <IconArrowRight className="h-5 w-5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border-[1.5px] border-amber-200 px-6 py-3.5 text-[14px] sm:text-base font-bold text-amber-800 hover:bg-amber-50 transition-colors"
                  >
                    See how it works
                  </button>
                </div>
              ) : user ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/projects/new"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] sm:text-lg font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                    style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                    data-testid="hero-cta"
                  >
                    Post a new job
                    <IconArrowRight className="h-5 w-5" />
                  </Link>
                  <Link
                    href="/projects"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border-[1.5px] border-amber-200 px-6 py-3.5 text-[14px] sm:text-base font-bold text-amber-800 hover:bg-amber-50 transition-colors"
                  >
                    My projects
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/projects/new"
                    onClick={rememberReturnTo}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] sm:text-lg font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                    style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                    data-testid="hero-cta"
                  >
                    Post a job
                    <IconArrowRight className="h-5 w-5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border-[1.5px] border-amber-200 px-6 py-3.5 text-[14px] sm:text-base font-bold text-amber-800 hover:bg-amber-50 transition-colors"
                  >
                    See how it works
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <HomeStats />

        {/* HOW IT WORKS - warm cream alternating with white. Steps coloured
            per beat (amber / violet / emerald) so each feels distinct. */}
        <section className="bg-white py-14 sm:py-20" id="how-it-works">
          <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 sm:px-8">
            {isTrades && (
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-700 text-center">
                Free to join. No commission.
              </p>
            )}
            <h2
              className={`${isTrades ? "mt-2" : ""} text-[28px] sm:text-4xl lg:text-4xl font-black tracking-[-0.01em] text-slate-900 text-center leading-[1.05]`}
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              {isTrades ? "Win more work, your way." : "How it works"}
            </h2>

            <div className="mt-10 sm:mt-12 space-y-10 sm:space-y-12 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-8 lg:items-start">
              {steps.map((step, index) => {
                const palettes = [
                  { circle: "linear-gradient(135deg,#fbbf24,#f59e0b)", label: "text-amber-700" },
                  { circle: "linear-gradient(135deg,#a78bfa,#7c3aed)", label: "text-violet-700" },
                  { circle: "linear-gradient(135deg,#10b981,#059669)", label: "text-emerald-700" },
                ];
                const palette = palettes[index] || palettes[0]!;
                return (
                  <div key={step.number} className="flex flex-col items-center text-center">
                    <span
                      className="text-white w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center font-black text-[22px] sm:text-[24px] shadow-md mb-4"
                      style={{ background: palette.circle }}
                    >
                      {step.number}
                    </span>
                    <div className={`text-[11px] font-extrabold uppercase tracking-wider ${palette.label} mb-1.5`}>
                      {step.tagline}
                    </div>
                    <h3
                      className="text-[20px] sm:text-2xl font-extrabold text-slate-900 leading-tight"
                      style={{ fontFamily: "'Sora', sans-serif" }}
                    >
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-md text-[14px] sm:text-base text-slate-600 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* WHY HOMEOWNERS / TRADES LOVE IT - cream block with soft amber blob */}
        <section className="relative overflow-hidden bg-[#fef6e9] py-14 sm:py-20" id="about">
          <span
            aria-hidden
            className="absolute -top-12 -right-12 w-44 h-44 rounded-full blur-2xl"
            style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", opacity: 0.22 }}
          />
          <span
            aria-hidden
            className="absolute bottom-0 -left-16 w-44 h-44 rounded-full blur-2xl"
            style={{ background: "linear-gradient(135deg,#fda4af,#f97316)", opacity: 0.18 }}
          />
          <div className="relative mx-auto max-w-3xl lg:max-w-5xl px-5 sm:px-8">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-700 text-center">
              {isTrades ? "Why tradespeople love it" : "Why homeowners love it"}
            </p>
            <h2
              className="mt-2 text-[28px] sm:text-4xl lg:text-4xl font-black tracking-[-0.01em] text-slate-900 text-center leading-[1.05]"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Built on{" "}
              <span
                className="text-indigo-600"
                style={{ fontFamily: "'Caveat', cursive", fontSize: "125%" }}
              >
                trust.
              </span>
            </h2>

            <div className="mt-7 sm:mt-9 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-5">
              {(isTrades
                ? [
                    {
                      icon: "✓",
                      iconBg: "linear-gradient(135deg,#10b981,#059669)",
                      title: "Real local jobs, no chasing leads",
                      body: "We surface jobs that match your trade and area, smart-ranked for fit. No more cold lists, no per-lead fees.",
                    },
                    {
                      icon: "★",
                      iconBg: "linear-gradient(135deg,#a78bfa,#7c3aed)",
                      title: "Win on reputation, not commission",
                      body: "Verified profile + Google rating + community recommendations side by side. Tradespeople with the best track record win.",
                    },
                    {
                      icon: "🔒",
                      iconBg: "linear-gradient(135deg,#fbbf24,#f59e0b)",
                      title: "No spam-and-pray",
                      body: "You only see homeowners who've explicitly picked you. No race-to-call, no five strangers competing on price.",
                    },
                  ]
                : [
                    {
                      icon: "✓",
                      iconBg: "linear-gradient(135deg,#10b981,#059669)",
                      title: "Every tradesperson is verified",
                      body: "Business checks, insurance, real ratings. Hard checks, not just star averages.",
                    },
                    {
                      icon: "★",
                      iconBg: "linear-gradient(135deg,#a78bfa,#7c3aed)",
                      title: "Backed by your community",
                      body: "Real recommendations from people in your area, not paid testimonials.",
                    },
                    {
                      icon: "🔒",
                      iconBg: "linear-gradient(135deg,#fbbf24,#f59e0b)",
                      title: "You stay in control",
                      body: "You decide which tradespeople to chat with. No five-stranger pile-on, no contact details handed out without your say-so.",
                    },
                  ]
              ).map((pill) => (
                <div
                  key={pill.title}
                  className="rounded-2xl bg-white p-4 sm:p-5 flex items-start gap-3 sm:gap-4 shadow-sm border border-amber-100/70"
                >
                  <span
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-white text-lg sm:text-xl shrink-0"
                    style={{ background: pill.iconBg }}
                    aria-hidden
                  >
                    {pill.icon}
                  </span>
                  <div>
                    <div className="text-[15px] sm:text-lg font-extrabold text-slate-900 leading-tight">
                      {pill.title}
                    </div>
                    <p className="mt-1 text-[13px] sm:text-base text-slate-600 leading-relaxed">
                      {pill.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact us - replaces the old FINAL CTA. Same paper-texture
            backdrop so the rhythm of the page is unchanged; the section
            just does a different job (lead capture for general inquiries
            instead of repeating the hero CTA). */}
        <HomeContactSection />
      </div>

      <Footer />
    </>
  );
}
