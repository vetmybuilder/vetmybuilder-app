// web/components/Footer.tsx
import Link from "next/link";

const socials = [
  {
    name: "X (Twitter)",
    href: "https://x.com/yourhandle",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path
          d="M18.244 2H21l-6.56 7.49L22.5 22h-6.89l-5.39-7.03L3.5 22H1l7.05-8.05L1.8 2h6.97l4.86 6.5L18.244 2Zm-2.41 18h1.9L7.3 4h-1.9l10.43 16Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/yourcompany",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path
          d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8.5h4V23h-4V8.5zM8.5 8.5h3.83v1.98h.06c.53-.95 1.83-1.98 3.77-1.98 4.03 0 4.77 2.65 4.77 6.1V23h-4v-6.49c0-1.55-.03-3.55-2.17-3.55-2.17 0-2.5 1.69-2.5 3.44V23h-4V8.5z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/yourhandle",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path
          d="M12 2.2c3.2 0 3.6.01 4.87.07 1.2.06 1.85.25 2.28.42.57.22.98.49 1.41.92.43.43.7.84.92 1.41.17.43.36 1.08.42 2.28.06 1.27.07 1.67.07 4.87s-.01 3.6-.07 4.87c-.06 1.2-.25 1.85-.42 2.28a3.88 3.88 0 0 1-.92 1.41 3.88 3.88 0 0 1-1.41.92c-.43.17-1.08.36-2.28.42-1.27.06-1.67.07-4.87.07s-3.6-.01-4.87-.07c-1.2-.06-1.85-.25-2.28-.42a3.88 3.88 0 0 1-1.41-.92 3.88 3.88 0 0 1-.92-1.41c-.17-.43-.36-1.08-.42-2.28C2.21 15.6 2.2 15.2 2.2 12s.01-3.6.07-4.87c.06-1.2.25-1.85.42-2.28.22-.57.49-.98.92-1.41.43-.43.84-.7 1.41-.92.43-.17 1.08-.36 2.28-.42C8.4 2.21 8.8 2.2 12 2.2Zm0 1.8c-3.16 0-3.53.01-4.78.07-.99.05-1.53.21-1.88.35-.47.18-.8.39-1.15.74-.35.35-.56.68-.74 1.15-.14.35-.3.89-.35 1.88-.06 1.25-.07 1.62-.07 4.78s.01 3.53.07 4.78c.05.99.21 1.53.35 1.88.18.47.39.8.74 1.15.35.35.68.56 1.15.74.35.14.89.3 1.88.35 1.25.06 1.62.07 4.78.07s3.53-.01 4.78-.07c.99-.05 1.53-.21 1.88-.35.47-.18.8-.39 1.15-.74.35-.35.56-.68.74-1.15.14-.35.3-.89.35-1.88.06-1.25.07-1.62.07-4.78s-.01-3.53-.07-4.78c-.05-.99-.21-1.53-.35-1.88a2.1 2.1 0 0 0-.74-1.15 2.1 2.1 0 0 0-1.15-.74c-.35-.14-.89-.3-1.88-.35-1.25-.06-1.62-.07-4.78-.07Zm0 3.05a6.75 6.75 0 1 1 0 13.5 6.75 6.75 0 0 1 0-13.5Zm0 1.8a4.95 4.95 0 1 0 0 9.9 4.95 4.95 0 0 0 0-9.9Zm6.88-2.15a1.58 1.58 0 1 1-3.16 0 1.58 1.58 0 0 1 3.16 0Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    name: "Email",
    href: "mailto:hello@yourdomain.com",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path
          d="M2 5a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5Zm3-.5a.5.5 0 0 0-.5.5v.36l7.5 5.25L20.5 5.36V5a.5.5 0 0 0-.5-.5H5Zm15 3.14-6.83 4.78a2 2 0 0 1-2.34 0L4 7.64V19a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5V7.64Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <span className="inline-block h-8 w-8 rounded-lg bg-indigo-600" aria-hidden />
            <div>
              <div className="font-semibold">Vetmybuilder</div>
              <div className="text-sm text-zinc-400">
                Powered by your community.
              </div>
            </div>
          </div>

          {/* Social */}
          <nav className="flex items-center gap-4">
            {socials.map((s) => (
              <Link
                key={s.name}
                href={s.href}
                aria-label={s.name}
                target={s.href.startsWith("http") ? "_blank" : undefined}
                rel={s.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 hover:bg-white/10 transition"
              >
                {s.icon}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 grid gap-2 text-sm text-zinc-400 md:flex md:items-center md:justify-between">
          <p>© {year} Vetmybuilder. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-white transition">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white transition">
              Privacy
            </Link>
            <Link href="/contact" className="hover:text-white transition">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
