// web/pages/index.tsx
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/utils/auth";
import Footer from "@/components/Footer";

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

function CountUp({
  end,
  durationMs = 1200,
  className = "",
}: {
  end: number;
  durationMs?: number;
  className?: string;
}) {
  const [val, setVal] = useState(0);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setVisible(e.isIntersecting)),
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || startedRef.current || end <= 0) return;
    startedRef.current = true;
    const startTs = performance.now();
    const from = 0;
    const to = end;
    function tick(now: number) {
      const p = Math.min(1, (now - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [visible, end, durationMs]);

  useEffect(() => {
    if (end > 0) {
      startedRef.current = false;
      setVal(0);
    }
  }, [end]);

  return (
    <span ref={ref} className={className}>
      {val.toLocaleString()}
    </span>
  );
}

const REVIEWS = [
  { name: "Sarah T.", location: "Walthamstow", job: "Plumbing", stars: 5, bg: "bg-emerald-600", quote: "Found a brilliant plumber through vetmybuilder. Fully vetted, showed up on time, and the quote was spot on." },
  { name: "James R.", location: "Chingford", job: "Kitchen Renovation", stars: 5, bg: "bg-blue-600", quote: "Kitchen renovation done perfectly. The builder vetmybuilder matched us with was incredible." },
  { name: "Priya K.", location: "Leyton", job: "Locksmith", stars: 5, bg: "bg-violet-600", quote: "Needed an emergency locksmith. vetmybuilder had someone vetted and at my door within the hour." },
  { name: "Mark D.", location: "Highams Park", job: "Loft Conversion", stars: 5, bg: "bg-amber-600", quote: "Our loft conversion was handled brilliantly. Would not have found them without vetmybuilder." },
  { name: "Laura M.", location: "Leytonstone", job: "Bathroom Refit", stars: 5, bg: "bg-cyan-600", quote: "Full bathroom refit with zero stress. vetmybuilder matched us with a fantastic tiler who was vetted and reviewed." },
  { name: "David H.", location: "Walthamstow", job: "Electrician", stars: 5, bg: "bg-rose-600", quote: "Had a full rewire done. The electrician was professional, certified, and competitively priced." },
  { name: "Amina B.", location: "Chingford", job: "Cleaning", stars: 4, bg: "bg-teal-600", quote: "End of tenancy clean was thorough and fairly priced. Great to know they were properly vetted." },
  { name: "Tom W.", location: "Leyton", job: "Painting & Decorating", stars: 5, bg: "bg-orange-600", quote: "Whole house painted inside and out. Brilliant finish, tidy workers, fair price. Highly recommend." },
  { name: "Rachel S.", location: "Highams Park", job: "Landscaping", stars: 5, bg: "bg-lime-600", quote: "Garden completely transformed. The landscaper vetmybuilder recommended was creative and reliable." },
  { name: "Chris P.", location: "Leytonstone", job: "Roofing", stars: 5, bg: "bg-indigo-600", quote: "Roof repair sorted quickly after a storm. Vetted roofer, honest quote, no hidden costs." },
  { name: "Karen L.", location: "Walthamstow", job: "External Wall Insulation", stars: 5, bg: "bg-sky-600", quote: "vetmybuilder recommended Elegant Building Services for our external wall insulation. Fantastic job, house is noticeably warmer and our energy bills have dropped." },
  { name: "Michael O.", location: "Chingford", job: "Insulation", stars: 5, bg: "bg-fuchsia-600", quote: "Had cavity wall insulation done by Elegant Building Services after vetmybuilder recommended them. Professional from start to finish, great value." },
  { name: "Helen G.", location: "Leyton", job: "External Wall Insulation", stars: 5, bg: "bg-emerald-700", quote: "Elegant Building Services did our EWI and the difference is incredible. vetmybuilder vetted them thoroughly and we felt confident from day one." },
  { name: "Diane F.", location: "Walthamstow", job: "Bin Cleaning", stars: 5, bg: "bg-zinc-600", quote: "vetmybuilder recommended thebinwisperer for our wheelie bin clean. Bins came back spotless and smelling fresh. Brilliant service." },
  { name: "Stuart N.", location: "Chingford", job: "Bin Cleaning", stars: 5, bg: "bg-slate-600", quote: "Had all our bins done by thebinwisperer through vetmybuilder. Quick, affordable, and the bins look brand new. Will be using them regularly." },
];

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function ReviewTicker() {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % REVIEWS.length);
        setFade(true);
      }, 200);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  const r = REVIEWS[idx];

  return (
    <div className="mt-12 max-w-2xl">
      <div className="flex items-start gap-4">
        <div
          className={`flex-shrink-0 w-12 h-12 rounded-full ${r.bg} border-2 border-white/20 flex items-center justify-center text-base font-bold text-white transition-opacity duration-200 ${fade ? "opacity-100" : "opacity-0"}`}
        >
          {r.name[0]}
        </div>
        <div className={`flex-1 min-w-0 transition-opacity duration-200 ${fade ? "opacity-100" : "opacity-0"}`}>
          <div className="flex items-center gap-1 text-amber-500 mb-1">
            {[...Array(r.stars)].map((_, i) => (
              <StarIcon key={i} className="h-4 w-4" />
            ))}
          </div>
          <p className="text-white/90 text-base leading-relaxed">
            &ldquo;{r.quote}&rdquo;
          </p>
          <p className="text-sm text-zinc-400 mt-2">
            <strong className="text-zinc-300">{r.name}</strong> &mdash; {r.location} &bull; {r.job}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-4">
        {REVIEWS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? "w-5 bg-amber-500" : "w-1.5 bg-white/20"}`}
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

  const [stats, setStats] = useState({
    communityMembers: 0,
    recommendations: 0,
    shortlists: 0,
  });

  function rememberReturnTo() {
    try {
      if (!sessionStorage.getItem("vmb:returnTo")) {
        sessionStorage.setItem("vmb:returnTo", "/");
      }
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/stats`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-store" },
        });
        if (!res.ok) throw new Error(`stats fetch failed: ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setStats({
            communityMembers: Number(json.communityMembers) || 0,
            recommendations: Number(json.recommendations) || 0,
            shortlists: Number(json.shortlists) || 0,
          });
        }
      } catch (e) {
        console.warn("stats error", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = isTrades
    ? [
        {
          number: 1,
          icon: IconProject,
          title: "Build your profile",
          tagline: "Stand out from the crowd",
          description: "Set up your trade profile with photos, service areas, and certifications. We'll verify your business against Companies House and pull in your Google Reviews automatically.",
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
          title: "Post your job",
          tagline: "Takes 2 minutes",
          description: "Describe what you need and we'll instantly break it down - which trades are involved, complexity, estimated budget - so the right tradespeople find you.",
          color: "red",
        },
        {
          number: 2,
          icon: IconCommunity,
          title: "Gather recommendations",
          tagline: "Verified by your community",
          description: "Share your job with friends and neighbours. Every recommended tradesperson is automatically verified and enriched with ratings, reviews, and business checks.",
          color: "emerald",
        },
        {
          number: 3,
          icon: IconShortlist,
          title: "Shortlist & hire",
          tagline: "Matched to your project",
          description: "Your shortlist is ranked by how well each tradesperson matches your job. See their verified profile, community votes, and reviews - then hire with confidence.",
          color: "amber",
        },
      ];

  return (
    <>
      <Head>
        <title>vetmybuilder</title>
        <meta name="description" content="Community-powered tradesperson vetting for UK homeowners. Post a job, gather recommendations, hire with confidence." />
        {/* Override body background to cream so the header gap area blends in */}
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">
        {/* HERO */}
        <section className="relative pt-6 sm:pt-24 pb-16 sm:pb-20 overflow-hidden" aria-label="Hero">
          <div className="absolute inset-0 bg-zinc-900/60 z-[1]" />

          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl ml-auto">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-1.5 text-sm font-bold text-white mb-6" style={{ fontFamily: "'Sora', sans-serif" }}>
                  {isTrades ? "The smarter way to win work" : "The smarter way to hire a tradesperson"}
                </div>

                <h1 className="text-2xl sm:text-4xl lg:text-5xl font-[800] tracking-tight leading-[1.1] text-white" style={{ fontFamily: "'Sora', sans-serif" }}>
                  {isTrades ? (
                    <>
                      <span className="block">Win more work with</span>
                      <span className="block text-red-500" style={{ fontFamily: "'Indie Flower', cursive" }}>vetmybuilder</span>
                    </>
                  ) : (
                    <>
                      <span className="block">Every tradesperson <span className="text-red-500" style={{ fontFamily: "'Indie Flower', cursive", fontSize: "115%" }}>vetted.</span></span>
                      <span className="block">Every recommendation <span className="text-red-500" style={{ fontFamily: "'Indie Flower', cursive", fontSize: "115%" }}>verified.</span></span>
                    </>
                  )}
                </h1>

                <p className="mt-4 text-base sm:text-xl lg:text-2xl leading-relaxed text-zinc-300 font-medium" style={{ fontFamily: "'Sora', sans-serif" }}>
                  {isTrades
                    ? "We match you to local projects that fit your skills, verify your credentials automatically, and put you in front of homeowners who are ready to hire."
                    : <span>Post your job, gather recommendations, <span className="text-red-500" style={{ fontFamily: "'Indie Flower', cursive", fontSize: "115%" }}>and we'll do the rest.</span></span>}
                </p>

                <div className="mt-10 flex flex-col sm:flex-row gap-4">
                  <Link
                    href={isTrades ? "/tradesman/projects" : user ? "/projects/new" : "/signup"}
                    onClick={!user ? rememberReturnTo : undefined}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 hover:scale-[1.02] transition-all"
                    data-testid="hero-cta"
                  >
                    {isTrades ? "View available jobs" : "Post a job"}
                    <IconArrowRight className="h-5 w-5" />
                  </Link>
                  {user && !isTrades ? (
                    <Link
                      href="/projects"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 px-8 py-4 text-lg font-bold text-white hover:bg-white/25 transition-colors"
                    >
                      My Projects
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 px-8 py-4 text-lg font-bold text-white hover:bg-white/25 transition-colors"
                    >
                      See how it works
                    </button>
                  )}
                </div>

                {/* Rotating review ticker */}
                <ReviewTicker />
              </div>

            </div>
          </div>
        </section>

        {/* STATS - hidden until community reaches 50 members */}
        {stats.communityMembers >= 50 && <section className="bg-[#faf0e6] py-16 sm:py-20" id="community">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-black text-zinc-900">
                A community that&apos;s got your back
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-8">
              {[
                {
                  stat: stats.communityMembers,
                  label: "Community members",
                  tagline: "And growing every day!",
                  bg: "bg-red-50",
                  accent: "text-red-500",
                },
                {
                  stat: stats.recommendations,
                  label: "Recommendations shared",
                  tagline: "Real experiences, real people",
                  bg: "bg-amber-50",
                  accent: "text-amber-600",
                },
                {
                  stat: stats.shortlists,
                  label: "Shortlists created",
                  tagline: "Projects moving forward",
                  bg: "bg-zinc-100",
                  accent: "text-zinc-700",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`${item.bg} rounded-3xl p-8 text-center hover:scale-[1.02] transition-transform`}
                >
                  <CountUp
                    end={item.stat}
                    durationMs={1600}
                    className={`text-5xl sm:text-6xl lg:text-7xl font-black ${item.accent}`}
                  />
                  <div className="mt-3 text-lg font-bold text-zinc-900">
                    {item.label}
                  </div>
                  <div className="mt-1 text-sm text-zinc-500 font-medium">
                    {item.tagline}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>}

        {/* HOW IT WORKS */}
        <section className="bg-white py-20 sm:py-28" id="how-it-works">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-700 mb-4">
                {isTrades ? "Free to join. No commission." : "Smart and simple"}
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-zinc-900">
                {isTrades ? "Three steps to winning more work" : "Three steps to the right tradesperson"}
              </h2>
            </div>

            <div className="relative">
              {/* Connecting line - desktop */}
              <div className="hidden md:block absolute top-24 left-[16.67%] right-[16.67%] h-1 bg-gradient-to-r from-red-400 via-emerald-400 to-amber-400 rounded-full opacity-30" />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {steps.map((step, index) => {
                  const colors = {
                    red: {
                      circle: "bg-red-500",
                      icon: "bg-red-50 text-red-500",
                      label: "text-red-500",
                    },
                    emerald: {
                      circle: "bg-emerald-500",
                      icon: "bg-emerald-50 text-emerald-600",
                      label: "text-emerald-600",
                    },
                    amber: {
                      circle: "bg-amber-500",
                      icon: "bg-amber-50 text-amber-600",
                      label: "text-amber-600",
                    },
                  }[step.color as "red" | "emerald" | "amber"];

                  return (
                    <div key={step.number} className="relative">
                      <div className="relative bg-white border-2 border-zinc-100 rounded-3xl p-8 hover:border-red-200 hover:shadow-xl transition-all group">
                        {/* Number circle */}
                        <div className={`absolute -top-6 left-1/2 -translate-x-1/2 h-12 w-12 rounded-full flex items-center justify-center text-xl font-black text-white shadow-lg ${colors.circle}`}>
                          {step.number}
                        </div>

                        {/* Icon */}
                        <div className={`mt-6 h-16 w-16 rounded-2xl flex items-center justify-center mx-auto ${colors.icon}`}>
                          <step.icon className="h-8 w-8" />
                        </div>

                        {/* Content */}
                        <div className="mt-6 text-center">
                          <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${colors.label}`}>
                            {step.tagline}
                          </div>
                          <h3 className="text-2xl font-black text-zinc-900 mb-3">
                            {step.title}
                          </h3>
                          <p className="text-zinc-500 leading-relaxed">
                            {step.description}
                          </p>
                        </div>
                      </div>

                      {/* Arrow connector - mobile */}
                      {index < steps.length - 1 && (
                        <div className="md:hidden flex justify-center my-4">
                          <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center rotate-90">
                            <IconArrowRight className="h-4 w-4 text-zinc-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-16 text-center">
              <Link
                href={isTrades ? "/tradesman/projects" : user ? "/projects/new" : "/signup"}
                onClick={!user ? rememberReturnTo : undefined}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-10 py-5 text-lg font-bold text-white hover:scale-[1.02] hover:shadow-xl transition-all"
              >
                {isTrades ? "View available jobs" : "Start your free project"}
                <IconArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>

        {/* TRUST SECTION */}
        <section className="bg-red-50 py-20 sm:py-24" id="about">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-zinc-900 leading-tight">
                  Why homeowners{" "}
                  <span className="text-red-500 font-black" style={{ fontFamily: "'Indie Flower', cursive" }}>love us</span>
                </h2>
                <p className="mt-6 text-xl text-zinc-600 leading-relaxed">
                  We&apos;re not a directory of every tradesperson in the UK. We&apos;re a
                  community of real homeowners sharing real experiences with real tradespeople.
                </p>

                <ul className="mt-10 space-y-5">
                  {[
                    "Recommendations only from people you trust",
                    "Only tradespeople matched to your job",
                    "100% transparent ratings and feedback",
                    "Free to get started - premium features coming soon",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-emerald-500 flex items-center justify-center mt-0.5">
                        <IconCheck className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-lg font-medium text-zinc-900">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Rating card */}
              <div className="relative">
                <div className="bg-white rounded-3xl p-10 shadow-xl border-2 border-zinc-50">
                  <div className="text-center">
                    <div className="text-8xl sm:text-9xl font-black text-red-500 leading-none">
                      4.9
                    </div>
                    <div className="flex items-center justify-center gap-1.5 mt-4">
                      {[...Array(5)].map((_, i) => (
                        <svg key={i} className="h-8 w-8 text-amber-400 fill-current" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <div className="mt-4 text-lg text-zinc-500">
                      Average homeowner satisfaction score
                    </div>
                  </div>
                </div>
                <div className="absolute -top-3 -right-3 h-16 w-16 bg-red-500 rounded-xl rotate-12 -z-10" />
                <div className="absolute -bottom-3 -left-3 h-12 w-12 bg-amber-400 rounded-full -z-10" />
              </div>
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </>
  );
}
