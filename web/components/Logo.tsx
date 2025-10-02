// web/components/Logo.tsx
import Link from "next/link";

export default function Logo() {
  // If you have a real logo at /public/logo.svg replace the text block with:
  // <img src="/logo.svg" alt="Vetmybuilder" className="h-7 w-auto" />
  return (
    <Link href="/" className="inline-flex items-center gap-2">
      <span
        className="inline-block h-7 w-7 rounded-lg bg-indigo-500"
        aria-hidden
      />
      <span className="text-white font-semibold tracking-tight text-lg">
        Vetmybuilder
      </span>
    </Link>
  );
}
