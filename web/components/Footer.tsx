// web/components/Footer.tsx
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/utils/auth";
import BrandWordmark from "@/components/BrandWordmark";

export default function Footer() {
  const year = new Date().getFullYear();
  const { user } = useAuth();

  // Read isTradesman flag set by SiteHeader (avoids a second API call)
  const [isTrades, setIsTrades] = useState(false);
  useEffect(() => {
    if (!user) { setIsTrades(false); return; }
    setIsTrades(sessionStorage.getItem("vmb:isTradesman") === "1");
  }, [user]);

  // Tradespeople links:
  // - Not logged in -> Register + Login
  // - Homeowner logged in -> hide section entirely
  // - Tradesman logged in -> Profile + My Jobs
  const tradesLinks = user && isTrades
    ? [
        { label: "Your Profile", href: "/tradesman/profile" },
        { label: "My Jobs", href: "/tradesman/jobs" },
      ]
    : !user
    ? [
        { label: "Register", href: "/tradesman/register-tradesmen" },
        { label: "Login", href: "/tradesman/login" },
      ]
    : null; // homeowner logged in - hide tradespeople section

  // Item lists per section - extracted so the same set drives both
  // the mobile (stacked) and desktop (5-column) layouts.
  const platformLinks = [
    isTrades
      ? { label: "How it Works", href: "/how-it-works-trades" }
      : { label: "How it Works", href: "/how-it-works" },
    ...(user && !isTrades ? [{ label: "Post a Job", href: "/projects/new" }] : []),
    ...(!user ? [{ label: "Sign Up", href: "/signup" }] : []),
  ];
  const policiesLinks = [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
    { label: "All policies", href: "/legal" },
  ];
  const supportLinks = [
    { label: "Contact", href: "/contact" },
    { label: "Feedback", href: "/feedback" },
    { label: "Complaints", href: "/complaints" },
  ];

  // Render helper - one column per section. Centred on mobile,
  // left-aligned on sm+ to match the desktop grid.
  const Section = ({
    title,
    items,
  }: {
    title: string;
    items: { label: string; href: string }[];
  }) => (
    <div>
      <h4 className="font-bold text-white mb-4 text-[15px]">{title}</h4>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className="bg-zinc-900">
      <div className="mx-auto max-w-6xl px-6 sm:px-6 lg:px-8 py-14 sm:py-16">
        {/* MOBILE layout (single column, centred, well-spaced).
            Hidden on sm+ where the desktop grid takes over. */}
        <div className="sm:hidden text-center">
          <Link href="/" className="inline-flex items-center justify-center">
            <BrandWordmark
              tone={isTrades ? "emerald" : "indigo"}
              className="text-xl font-black tracking-tight text-white"
            />
          </Link>

          <div className="mt-10 space-y-9">
            <Section title="Platform" items={platformLinks} />
            {tradesLinks && <Section title="Tradespeople" items={tradesLinks} />}
            <Section title="Policies" items={policiesLinks} />
            <Section title="Support" items={supportLinks} />
          </div>
        </div>

        {/* DESKTOP layout - brand spans 2 columns so the wordmark has
            room to breathe next to the section headers. */}
        <div className="hidden sm:grid grid-cols-2 md:grid-cols-6 gap-8 lg:gap-12 text-left">
          {/* Brand */}
          <div className="col-span-2 md:col-span-2 md:pr-4">
            <Link href="/" className="flex items-center">
              <BrandWordmark
                tone={isTrades ? "emerald" : "indigo"}
                className="text-xl font-black tracking-tight text-white"
              />
            </Link>
          </div>

          <Section title="Platform" items={platformLinks} />
          {tradesLinks && <Section title="Tradespeople" items={tradesLinks} />}
          <Section title="Policies" items={policiesLinks} />
          <Section title="Support" items={supportLinks} />
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex flex-col gap-1 text-center sm:text-left">
            <p className="text-sm text-zinc-500">
              &copy; {year} VetMyBuilder Ltd. All rights reserved.
            </p>
            <p className="text-xs text-zinc-600">
              Registered in England and Wales. Company No. 1627511.
            </p>
          </div>
          <div className="flex items-center gap-5">
            <Link href="https://x.com/vetmybuilder" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="text-zinc-500 hover:text-white transition-colors">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/></svg>
            </Link>
            <Link href="https://www.instagram.com/vetmybuilder" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-zinc-500 hover:text-white transition-colors">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
            </Link>
            <Link href="https://www.youtube.com/@vetmybuilder" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="text-zinc-500 hover:text-white transition-colors">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
