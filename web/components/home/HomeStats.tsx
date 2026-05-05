// web/components/home/HomeStats.tsx
//
// Public homepage stats strip ("Members / Recommendations / Shortlists").
// Hidden until the community is past a small-launch threshold so the
// counters don't read as embarrassingly low while we onboard the first
// cohort. Threshold lives here so it's visible to anyone looking at
// the component and is unit-testable.

import { useEffect, useRef, useState } from "react";

/** Minimum communityMembers count before the stats section is shown. */
export const MIN_COMMUNITY_MEMBERS_TO_SHOW_STATS = 50;

type Stats = {
  communityMembers: number;
  recommendations: number;
  shortlists: number;
};

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

export default function HomeStats() {
  const [stats, setStats] = useState<Stats>({
    communityMembers: 0,
    recommendations: 0,
    shortlists: 0,
  });

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

  if (stats.communityMembers < MIN_COMMUNITY_MEMBERS_TO_SHOW_STATS) {
    return null;
  }

  return (
    <section
      className="bg-white py-12 sm:py-16"
      id="community"
      data-testid="home-stats"
    >
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-700 text-center">
          The community in numbers
        </p>
        <h2
          className="mt-2 text-[24px] sm:text-3xl font-black tracking-[-0.01em] text-slate-900 text-center leading-[1.1]"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Got your back.
        </h2>

        <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-4">
          {[
            {
              stat: stats.communityMembers,
              label: "Members",
              accent: "text-amber-600",
              bg: "bg-amber-50/70 border-amber-100",
            },
            {
              stat: stats.recommendations,
              label: "Recommendations",
              accent: "text-violet-600",
              bg: "bg-violet-50/70 border-violet-100",
            },
            {
              stat: stats.shortlists,
              label: "Shortlists",
              accent: "text-emerald-600",
              bg: "bg-emerald-50/70 border-emerald-100",
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`${item.bg} rounded-2xl p-3 sm:p-5 text-center border`}
            >
              <CountUp
                end={item.stat}
                durationMs={1600}
                className={`text-[28px] sm:text-4xl font-black ${item.accent}`}
              />
              <div className="mt-1 text-[11px] sm:text-sm font-extrabold text-slate-700">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
