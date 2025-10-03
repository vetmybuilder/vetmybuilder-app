// web/pages/index.tsx
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, signOutUser } from "@/utils/auth";
import Footer from "@/components/Footer";
import { Rubik } from "next/font/google";

const rubik = Rubik({
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
});

// Optional: centralize API base if you later split web/api origins.
function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE || "";
}

function IconProject(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="7" r="1" fill="currentColor" />
      <circle cx="11" cy="7" r="1" fill="currentColor" />
      <circle cx="15" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}
function IconCommunity(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 19a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 19a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function IconShortlist(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <path
        d="M6 7h12M6 12h8M6 17h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m17 5 2 2 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m15 10 2 2 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m13 15 2 2 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Simple, dependency-free count-up that starts when visible */
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
  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);
  const fmt = useMemo(() => new Intl.NumberFormat(), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onStart = () => {
      if (started.current) return;
      started.current = true;

      const start = performance.now();
      const from = 0;
      const to = end;

      function tick(now: number) {
        const p = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setVal(Math.round(from + (to - from) * eased));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && onStart()),
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [end, durationMs]);

  return (
    <span ref={ref} className={className}>
      {fmt.format(val)}
    </span>
  );
}

export default function Home() {
  const { user } = useAuth();

  // === Live stats from API ===
  const [stats, setStats] = useState({
    communityMembers: 0,
    recommendations: 0,
    shortlists: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // NEW: use the public stats endpoint
        const res = await fetch(`${getApiBase()}/api/stats/public`);
        if (!res.ok) throw new Error("stats fetch failed");
        const json = await res.json();
        if (!cancelled) {
          setStats({
            communityMembers: Number(json.communityMembers) || 0,
            recommendations: Number(json.recommendations) || 0,
            shortlists: Number(json.shortlists) || 0,
          });
        }
      } catch {
        // keep defaults on error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Head>
        <title>Vetmybuilder</title>
        <meta name="description" content="Find trusted builders, fast." />
      </Head>

      {/* MAIN PAGE */}
      <main className="bg-white text-black">
        {/* HERO */}
        <section className="relative isolate overflow-hidden" aria-label="Hero">
          <div className="absolute inset-0">
            <Image
              src="/hero.png"
              alt=""
              priority
              fill
              className="object-cover object-center"
              sizes="100vw"
            />
            {/* Optional readability wash: <div className="absolute inset-0 bg-white/40" /> */}
          </div>

          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <header className="py-5 flex items-center justify-between">
              <Link href="/" className="inline-flex items-center gap-2">
                <span className="inline-block h-7 w-7 rounded-lg bg-indigo-600" />
                <span className="font-semibold tracking-tight text-lg text-black">
                  Vetmybuilder
                </span>
              </Link>

              {user && (
                <button
                  onClick={async () => {
                    try {
                      await signOutUser();
                    } finally {
                      window.location.href = "/";
                    }
                  }}
                  className="inline-flex items-center justify-center rounded-xl px-4 py-2
                             bg-red-600 text-white border border-red-600/30
                             hover:bg-red-500 transition
                             focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  Logout
                </button>
              )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center py-12 sm:py-16 lg:py-20 min-h-[70vh] md:min-h-[calc(100svh-96px)]">
              <div className="max-w-2xl text-black">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight">
                  And just like that — you’re hiring the right builder.
                </h1>

                <p
                  className={`${rubik.className} mt-5 text-lg sm:text-xl leading-relaxed text-zinc-900 tracking-tight`}
                >
                  powered by your <span className="font-black">community</span>.
                  Start a project, gather recommendations from friends and
                  nearby members, and turn real experiences into a shortlist you
                  can trust.
                </p>

                <div className="mt-8">
                  <Link
                    href={user ? "/projects/new" : "/register"}
                    className="inline-flex items-center justify-center rounded-xl px-5 py-3
                           bg-indigo-600 text-white hover:bg-indigo-500 transition
                           focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {user ? "Get started" : "Join our growing community"}
                  </Link>
                </div>
              </div>

              <div className="hidden lg:block" />
            </div>
          </div>
        </section>

        {/* HIGHLIGHTS / STATS (live from /api/stats/public) */}
        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="text-sm uppercase tracking-wide text-zinc-600">
                  Community members
                </div>
                <CountUp
                  end={stats.communityMembers}
                  durationMs={1400}
                  className="mt-2 block text-4xl font-extrabold text-zinc-900"
                />
                <div className="mt-1 text-sm text-zinc-500">
                  and growing every week
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="text-sm uppercase tracking-wide text-zinc-600">
                  Recommendations shared
                </div>
                <CountUp
                  end={stats.recommendations}
                  durationMs={1400}
                  className="mt-2 block text-4xl font-extrabold text-zinc-900"
                />
                <div className="mt-1 text-sm text-zinc-500">
                  real experiences from real people
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="text-sm uppercase tracking-wide text-zinc-600">
                  Shortlists created
                </div>
                <CountUp
                  end={stats.shortlists}
                  durationMs={1400}
                  className="mt-2 block text-4xl font-extrabold text-zinc-900"
                />
                <div className="mt-1 text-sm text-zinc-500">
                  projects moved forward with confidence
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="bg-white text-black">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 sm:py-18 lg:py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                A new way to hire
              </h2>
              <p className="mt-2 text-zinc-600">
                Simple, community-first steps from idea to the right
                tradesperson.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Step 1 */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <IconProject className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-medium text-indigo-700">
                    Step 1
                  </div>
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  Create your project
                </h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Add a quick brief (e.g. “bathroom refit in E4”). You’ll get a
                  unique invite link.
                </p>
              </div>

              {/* Step 2 */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-green-50 text-green-700 flex items-center justify-center">
                    <IconCommunity className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-medium text-green-700">
                    Step 2
                  </div>
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  Get community recs
                </h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Share the link with friends &amp; local members. They submit
                  real recommendations with ratings and comments.
                </p>
              </div>

              {/* Step 3 */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                    <IconShortlist className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-medium text-amber-700">
                    Step 3
                  </div>
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  Shortlist &amp; hire
                </h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Compare feedback, build your shortlist, and pick the right pro
                  with confidence.
                </p>
              </div>
            </div>

            <div className="mt-8"></div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
