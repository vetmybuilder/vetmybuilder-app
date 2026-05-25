// web/pages/admin/index.tsx
import Link from "next/link";

type Tile = {
  href: string;
  label: string;
  blurb: string;
  accent: string; // tailwind text-* class for the icon
  icon: React.ReactNode;
};

const ICON_PROPS = {
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const TILES: Tile[] = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    blurb: "Live signups, projects, matches and revenue.",
    accent: "text-emerald-400",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M3 13l4-4 4 4 7-7" />
        <path d="M14 6h7v7" />
      </svg>
    ),
  },
  {
    href: "/admin/tradesmen-leaderboard",
    label: "Tradespeople leaderboard",
    blurb: "Top-performing tradespeople by matches and unlocks.",
    accent: "text-amber-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 4h10v5a5 5 0 01-10 0V4z" />
        <path d="M17 4h3v2a3 3 0 01-3 3" />
        <path d="M7 4H4v2a3 3 0 003 3" />
      </svg>
    ),
  },
  {
    href: "/admin/projects",
    label: "Projects",
    blurb: "Every homeowner project, filterable and editable.",
    accent: "text-sky-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M3 7h7l2 2h9v10a2 2 0 01-2 2H3z" />
        <path d="M3 7V5a2 2 0 012-2h4l2 2" />
      </svg>
    ),
  },
  {
    href: "/admin/trades-pipeline",
    label: "Trade pipeline",
    blurb: "Companies House discovery, outreach and follow-ups.",
    accent: "text-indigo-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M3 12h4l3-7 4 14 3-7h4" />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "Users",
    blurb: "Homeowner and tradesperson accounts.",
    accent: "text-rose-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0113 0" />
        <circle cx="17" cy="9" r="3" />
        <path d="M15.5 20a5 5 0 016-4.9" />
      </svg>
    ),
  },
  {
    href: "/admin/recommendation-leaderboard",
    label: "Recommendation leaderboard",
    blurb: "Who is most recommended by their community.",
    accent: "text-fuchsia-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M12 17.3l-6.2 3.7 1.6-7L2 9.3l7.1-.6L12 2l2.9 6.7 7.1.6-5.4 4.7 1.6 7z" />
      </svg>
    ),
  },
  {
    href: "/admin/pilot-areas",
    label: "Pilot areas",
    blurb: "Borough-level launch gating.",
    accent: "text-cyan-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M12 22s-7-7.6-7-13a7 7 0 1114 0c0 5.4-7 13-7 13z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
  },
  {
    href: "/admin/pilot-project-types",
    label: "Pilot project types",
    blurb: "Which project categories are live at launch.",
    accent: "text-emerald-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <rect x="3" y="4" width="7" height="7" rx="1.5" />
        <rect x="14" y="4" width="7" height="7" rx="1.5" />
        <rect x="3" y="15" width="7" height="6" rx="1.5" />
        <path d="M14 18h7" />
        <path d="M14 21h7" />
      </svg>
    ),
  },
  {
    href: "/admin/reports",
    label: "Reports",
    blurb: "User-submitted issue reports.",
    accent: "text-orange-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.9L2.5 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.8-3L13.7 3.9a2 2 0 00-3.4 0z" />
      </svg>
    ),
  },
  {
    href: "/admin/grant-leads",
    label: "Grant leads",
    blurb: "Insulation grant funnel submissions, routed to Elegant.",
    accent: "text-lime-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M3 21h18" />
        <path d="M5 21V10l7-6 7 6v11" />
        <path d="M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    href: "/admin/feedback",
    label: "Feedback",
    blurb: "What users are telling us via the feedback form.",
    accent: "text-violet-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M21 11.5a8.4 8.4 0 01-9 8.4l-5 1.6 1.6-5A8.4 8.4 0 1121 11.5z" />
      </svg>
    ),
  },
  {
    href: "/admin/verify-company",
    label: "Verify company",
    blurb: "Manually verify a tradesperson against Companies House.",
    accent: "text-teal-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/admin/cleanup",
    label: "Cleanup",
    blurb: "Maintenance scripts and one-off jobs.",
    accent: "text-slate-300",
    icon: (
      <svg {...ICON_PROPS} aria-hidden>
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      </svg>
    ),
  },
];

export default function AdminIndex() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:py-14">
      {/* Header card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-6 md:p-8 mb-8 shadow-lg">
        {/* faint dot grid */}
        <svg
          className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
          aria-hidden
        >
          {Array.from({ length: 50 }).map((_, i) => {
            const cx = (i * 47) % 1200;
            const cy = (i * 83) % 240;
            return (
              <circle key={i} cx={cx} cy={cy} r="2" fill="#cbd5e1" />
            );
          })}
        </svg>
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-400 mb-2">
              VetMyBuilder operations
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              Admin console
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-xl">
              Jump straight into any operational area. Use the header for
              nested navigation, or pick a tile below.
            </p>
          </div>
          {/* shield-check illustration */}
          <svg
            viewBox="0 0 120 120"
            width="110"
            height="110"
            aria-hidden
            className="shrink-0 drop-shadow"
          >
            <path
              d="M60 12 L100 28 V62 C100 84 84 96 60 104 C36 96 20 84 20 62 V28 Z"
              fill="#0f172a"
              stroke="#cbd5e1"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M40 60 L55 75 L84 46"
              fill="none"
              stroke="#34d399"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Tile grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="group relative rounded-2xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 hover:border-slate-500 p-5 transition shadow-sm"
          >
            <div className="flex items-start gap-4">
              <div
                className={`shrink-0 rounded-xl bg-slate-900/70 border border-slate-700 p-2.5 ${tile.accent}`}
              >
                {tile.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold text-white leading-snug">
                  {tile.label}
                </p>
                <p className="mt-1 text-[12.5px] text-slate-400 leading-snug">
                  {tile.blurb}
                </p>
              </div>
            </div>
            <span
              className="absolute right-4 top-4 text-slate-500 group-hover:text-slate-200 transition"
              aria-hidden
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
