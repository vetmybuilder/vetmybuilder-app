// web/components/Footer.tsx
import Link from "next/link";
import { Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/utils/auth";

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
  // - Not logged in → Register + Login
  // - Homeowner logged in → hide section entirely
  // - Tradesman logged in → Profile + My Jobs
  const tradesLinks = user && isTrades
    ? [
        { label: "Your Profile", href: "/tradesman/profile" },
        { label: "My Jobs", href: "/tradesman/projects" },
      ]
    : !user
    ? [
        { label: "Register", href: "/tradesman/register-tradesmen" },
        { label: "Login", href: "/tradesman/login" },
      ]
    : null; // homeowner logged in — hide tradespeople section

  return (
    <footer className="bg-zinc-900">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500">
                <Home className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-black text-white">
                Vet<span className="text-red-400">My</span>Builder
              </span>
            </Link>
            <p className="mt-4 text-sm text-zinc-400 max-w-xs leading-relaxed">
              The community-powered platform helping UK homeowners find tradespeople
              they can actually trust.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-bold text-white mb-4">Platform</h4>
            <ul className="space-y-3">
              {[
                isTrades
                  ? { label: "How it Works", href: "/how-it-works-trades" }
                  : { label: "How it Works", href: "/how-it-works" },
                ...(user && !isTrades ? [{ label: "Post a Job", href: "/projects/new" }] : []),
                ...(!user ? [{ label: "Sign Up", href: "/signup" }] : []),
              ].map((item) => (
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

          {/* Tradespeople — hidden for logged-in homeowners */}
          {tradesLinks && (
            <div>
              <h4 className="font-bold text-white mb-4">Tradespeople</h4>
              <ul className="space-y-3">
                {tradesLinks.map((item) => (
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
          )}

          {/* Legal */}
          <div>
            <h4 className="font-bold text-white mb-4">Legal</h4>
            <ul className="space-y-3">
              {[
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms of Service", href: "/terms" },
                { label: "Contact", href: "/contact" },
              ].map((item) => (
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
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex flex-col gap-1 text-center sm:text-left">
            <p className="text-sm text-zinc-500">
              &copy; {year} VetMyBuilder. All rights reserved.
            </p>
            <p className="text-xs text-zinc-600">
              Powered by Connect2Find Ltd.
            </p>
          </div>
          <div className="flex items-center gap-5">
            <Link href="https://x.com/vetmybuilder" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="text-zinc-500 hover:text-white transition-colors">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/></svg>
            </Link>
            <Link href="https://www.linkedin.com/company/vetmybuilder" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-zinc-500 hover:text-white transition-colors">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </Link>
            <Link href="https://www.instagram.com/vetmybuilder" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-zinc-500 hover:text-white transition-colors">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
            </Link>
            <Link href="https://www.youtube.com/@vetmybuilder" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="text-zinc-500 hover:text-white transition-colors">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </Link>
            <Link href="https://www.tiktok.com/@vetmybuilder" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="text-zinc-500 hover:text-white transition-colors">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>
            </Link>
            <Link href="https://www.pinterest.com/vetmybuilder" target="_blank" rel="noopener noreferrer" aria-label="Pinterest" className="text-zinc-500 hover:text-white transition-colors">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
