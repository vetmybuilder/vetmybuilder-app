// components/SiteHeader.tsx
import Link from "next/link";

export default function SiteHeader() {
  return (
    <header
      role="banner"
      aria-label="Site"
      className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav
          aria-label="Primary"
          className="h-14 flex items-center justify-between"
        >
          {/* Logo only (accessible name via sr-only text) */}
          <Link
            href="/"
            className="inline-flex items-center gap-2"
            aria-label="Vetmybuilder home"
          >
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-xl
                         bg-gradient-to-br from-indigo-500 to-blue-600 text-white ring-1 ring-indigo-200/50 shadow-sm"
            />
            <span className="sr-only">Vetmybuilder</span>
          </Link>

          {/* Right side reserved (empty for now) */}
          <div aria-hidden />
        </nav>
      </div>
    </header>
  );
}
