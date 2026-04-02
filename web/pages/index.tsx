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

export default function Home() {
  const { user } = useAuth();

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

  const steps = [
    {
      number: 1,
      icon: IconProject,
      title: "Post your job",
      tagline: "Takes 2 minutes",
      description: 'Add a quick brief (e.g. "bathroom refit in E4"). You\'ll get a unique invite link to share.',
      color: "red",
    },
    {
      number: 2,
      icon: IconCommunity,
      title: "Gather recommendations",
      tagline: "From people you trust",
      description: "Share with friends & local members. They submit real recommendations with ratings and comments.",
      color: "emerald",
    },
    {
      number: 3,
      icon: IconShortlist,
      title: "Shortlist & hire",
      tagline: "With confidence",
      description: "Compare feedback, build your shortlist, and pick the right tradesperson — no more guesswork.",
      color: "amber",
    },
  ];

  return (
    <>
      <Head>
        <title>VetMyBuilder — Find a tradesperson you actually trust</title>
        <meta name="description" content="Community-powered tradesperson vetting for UK homeowners. Post a job, gather recommendations, hire with confidence." />
        {/* Override body background to cream so the header gap area blends in */}
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">
        {/* HERO */}
        <section className="relative pt-20 sm:pt-24 pb-16 sm:pb-20 overflow-hidden bg-stone-50" aria-label="Hero">
          {/* Diagonal colour bands */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Pink/rose band — right side */}
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
            {/* Sage green blob — bottom left */}
            <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
          </div>

          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 items-center">
              {/* Left: Text — 3/5 width so 'tradesperson' fits on one line */}
              <div className="lg:col-span-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-zinc-800 mb-6">
                  <span className="text-lg">👋</span>
                  <span>The smarter way to hire a tradesperson</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] text-zinc-900">
                  <span className="block">Find a tradesperson</span>
                  <span className="block">
                    you{" "}
                    <span className="relative inline-block">
                      <span className="relative z-10 text-red-500">actually</span>
                      <svg
                        className="absolute -bottom-1 left-0 w-full h-3 text-red-300"
                        viewBox="0 0 100 12"
                        preserveAspectRatio="none"
                      >
                        <path
                          d="M0 6 Q25 0, 50 6 T100 6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>{" "}
                    trust
                  </span>
                </h1>

                <p className="mt-6 text-xl sm:text-2xl leading-relaxed text-zinc-600 font-medium">
                  Post a job. Get recommendations from people you know. Hire with confidence. It&apos;s that simple.
                </p>

                <div className="mt-10 flex flex-col sm:flex-row gap-4">
                  <Link
                    href={user ? "/projects/new" : "/signup"}
                    onClick={!user ? rememberReturnTo : undefined}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 hover:scale-[1.02] transition-all"
                    data-testid="hero-cta"
                  >
                    Start your project
                    <IconArrowRight className="h-5 w-5" />
                  </Link>
                  <Link
                    href="#how-it-works"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-100 px-8 py-4 text-lg font-bold text-zinc-900 hover:bg-zinc-200 transition-colors"
                  >
                    See how it works
                  </Link>
                </div>

                {/* Social proof */}
                <div className="mt-12 flex items-center gap-4">
                  <div className="flex -space-x-3">
                    {[
                      { bg: "bg-red-500", letter: "S" },
                      { bg: "bg-emerald-500", letter: "J" },
                      { bg: "bg-amber-500", letter: "M" },
                      { bg: "bg-zinc-300", letter: "K" },
                    ].map((a, i) => (
                      <div
                        key={i}
                        className={`h-11 w-11 rounded-full ${a.bg} border-[3px] border-white flex items-center justify-center text-sm font-bold text-white shadow-md`}
                      >
                        {a.letter}
                      </div>
                    ))}
                  </div>
                  <div className="text-sm">
                    <div className="flex items-center gap-1 text-amber-500 mb-0.5">
                      {[...Array(5)].map((_, i) => (
                        <svg key={i} className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-zinc-500 font-medium">
                      Trusted by UK homeowners
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Image with fun frame — 2/5 width */}
              <div className="relative hidden lg:block lg:col-span-2">
                <div className="relative rounded-3xl overflow-hidden shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-500">
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/40 via-transparent to-transparent z-10" />
                  <Image
                    src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80"
                    alt="Happy tradesperson at work"
                    width={600}
                    height={500}
                    priority
                    className="w-full h-auto object-cover aspect-[4/3]"
                  />
                  {/* Floating badge */}
                  <div className="absolute bottom-4 left-4 right-4 z-20 bg-white/95 backdrop-blur rounded-2xl p-4 shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <IconCheck className="h-6 w-6 text-emerald-600" />
                      </div>
                      <div>
                        <div className="font-bold text-zinc-900">Verified by neighbours</div>
                        <div className="text-sm text-zinc-500">Real reviews from real people</div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Decorative elements */}
                <div className="absolute -top-4 -right-4 h-20 w-20 bg-amber-400 rounded-2xl rotate-12 -z-10" />
                <div className="absolute -bottom-4 -left-4 h-16 w-16 bg-emerald-400 rounded-full -z-10" />
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="bg-[#faf0e6] py-16 sm:py-20" id="community">
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
                  bg: "bg-red-100",
                  accent: "text-red-500",
                },
                {
                  stat: stats.recommendations,
                  label: "Recommendations shared",
                  tagline: "Real experiences, real people",
                  bg: "bg-emerald-100",
                  accent: "text-emerald-700",
                },
                {
                  stat: stats.shortlists,
                  label: "Shortlists created",
                  tagline: "Projects moving forward",
                  bg: "bg-yellow-100",
                  accent: "text-yellow-600",
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
        </section>

        {/* HOW IT WORKS */}
        <section className="bg-white py-20 sm:py-28" id="how-it-works">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-700 mb-4">
                Dead simple
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-zinc-900">
                Three steps to your perfect tradesperson
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
                href={user ? "/projects/new" : "/signup"}
                onClick={!user ? rememberReturnTo : undefined}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-10 py-5 text-lg font-bold text-white hover:scale-[1.02] hover:shadow-xl transition-all"
              >
                Start your free project
                <IconArrowRight className="h-5 w-5" />
              </Link>
              <p className="mt-4 text-sm text-zinc-400">
                No credit card needed. Free forever.
              </p>
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
                  <span className="text-red-500">love us</span>
                </h2>
                <p className="mt-6 text-xl text-zinc-600 leading-relaxed">
                  We&apos;re not a directory of every tradesperson in the UK. We&apos;re a
                  community of real homeowners sharing real experiences with real tradespeople.
                </p>

                <ul className="mt-10 space-y-5">
                  {[
                    "Recommendations only from people you trust",
                    "No paid placements or sponsored listings",
                    "100% transparent ratings and feedback",
                    "Completely free to use — always",
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
