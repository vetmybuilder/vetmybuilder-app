// web/components/Footer.tsx
import Link from "next/link";
import { Home } from "lucide-react";

export default function Footer() {
  const year = new Date().getFullYear();
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
              The community-powered platform helping UK homeowners find builders
              they can actually trust.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-bold text-white mb-4">Platform</h4>
            <ul className="space-y-3">
              {[
                { label: "How it Works", href: "/#how-it-works" },
                { label: "Post a Job", href: "/projects/new" },
                { label: "Sign Up", href: "/signup" },
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

          {/* Tradespeople */}
          <div>
            <h4 className="font-bold text-white mb-4">Tradespeople</h4>
            <ul className="space-y-3">
              {[
                { label: "Register", href: "/tradesman/register" },
                { label: "Login", href: "/tradesman/login" },
                { label: "Your Profile", href: "/tradesman/profile" },
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
          <p className="text-sm text-zinc-500">
            &copy; {year} VetMyBuilder Ltd. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            {[
              { label: "Twitter", href: "https://x.com/vetmybuilder" },
              { label: "LinkedIn", href: "https://www.linkedin.com/company/vetmybuilder" },
              { label: "Instagram", href: "https://www.instagram.com/vetmybuilder" },
            ].map((social) => (
              <Link
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-zinc-500 hover:text-white transition-colors"
              >
                {social.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
