// web/components/BrandWordmark.tsx
//
// The VetMyBuilder wordmark, used everywhere the brand appears (headers,
// menu, footer, toasts, legal pages). The "My" word renders in the Caveat
// cursive face with a tone-aware colour:
//   - tradesman context  -> emerald
//   - homeowner context  -> indigo
//   - default / unknown  -> indigo
//
// `tone="auto"` derives from the URL: anything under /tradesman/ uses
// emerald, everything else is indigo. Callers can pass an explicit tone
// when the URL doesn't reflect the current user's role (e.g. a tradesman
// browsing /account).

import { useRouter } from "next/router";

type Tone = "indigo" | "emerald" | "auto";

export default function BrandWordmark({
  tone = "auto",
  className = "text-2xl font-black tracking-tight text-zinc-900",
}: {
  tone?: Tone;
  /** Optional override for the outer span. Defaults to the standard header size. */
  className?: string;
}) {
  const router = useRouter();
  const resolved =
    tone === "auto"
      ? router.pathname.startsWith("/tradesman")
        ? "emerald"
        : "indigo"
      : tone;

  const myColor =
    resolved === "emerald" ? "text-emerald-600" : "text-indigo-600";

  return (
    <span className={className}>
      Vet
      <span
        className={myColor}
        style={{
          fontFamily: "'Caveat', cursive",
          fontWeight: 700,
          fontSize: "130%",
          WebkitTextStroke: "0.5px currentColor",
        }}
      >
        My
      </span>
      Builder
    </span>
  );
}
