// web/pages/404.tsx
import Head from "next/head";
import Link from "next/link";
import { useRole } from "@/utils/useRole";

export default function NotFound() {
  const { role } = useRole();
  const isTradesman = role === "tradesman";
  const isGuest = role === "guest";

  // Three role-tailored states:
  //  - tradesman   → emerald, send to their jobs deck + profile
  //  - guest       → indigo, send home + nudge them to sign up
  //                  (instead of pushing them to /projects/new which
  //                   would just bounce them through /login first)
  //  - homeowner   → indigo, send home + Post a job
  const body = isTradesman
    ? "This page doesn't exist. Head back to your jobs deck or your profile - your matches are still waiting."
    : isGuest
      ? "This page doesn't exist. Head back home or sign up to post a job and we'll find the right tradesperson for you."
      : "This page doesn't exist. Head back home or post a job and we'll find the right tradesperson for you.";

  const primary = isTradesman
    ? { href: "/tradesman/jobs", label: "Browse jobs" }
    : { href: "/", label: "Go home" };

  const secondary = isTradesman
    ? { href: "/tradesman/profile", label: "My profile" }
    : isGuest
      ? { href: "/signup", label: "Get started" }
      : { href: "/projects/new", label: "Post a job" };

  return (
    <>
      <Head>
        <title>Page not found - VetMyBuilder</title>
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <div
        className="overflow-x-hidden -mt-14 min-h-screen flex items-center justify-center px-4"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08), transparent 55%)," +
            "radial-gradient(circle at 80% 80%, rgba(245,158,11,0.10), transparent 55%)," +
            "#fef6e9",
        }}
      >
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-3xl border border-amber-100 shadow-xl shadow-indigo-200/30 px-8 py-10 sm:px-10 sm:py-12 text-center">
            {/* Tools illustration */}
            <div
              className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl text-[40px] leading-none"
              style={{
                background: "linear-gradient(135deg, #fef3c7, #fcd34d)",
                boxShadow: "0 12px 28px rgba(245,158,11,0.30)",
              }}
              aria-hidden
            >
              <span className="inline-block -rotate-[18deg]">{"\u{1F527}"}</span>
              <span className="inline-block rotate-[18deg] -ml-2">
                {"\u{1F528}"}
              </span>
            </div>

            {/* 404 numerals */}
            <div
              className="text-[60px] sm:text-[72px] font-black text-slate-900 leading-none tracking-tight"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              404
            </div>

            {/* Headline with Caveat accent on "here" - matches the rest
                of the app's headline treatment. */}
            <h1
              className="mt-3 text-[22px] sm:text-[24px] font-extrabold text-slate-900 leading-tight tracking-tight"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Nothing to see{" "}
              <span
                className="text-indigo-600"
                style={{
                  fontFamily: "'Caveat', cursive",
                  fontSize: "120%",
                }}
              >
                here
              </span>
            </h1>

            <p className="mt-2 text-[14px] text-slate-500 leading-relaxed">
              {body}
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                href={primary.href}
                className="inline-flex items-center justify-center rounded-full px-7 py-3 text-[14px] font-extrabold text-white transition-all"
                style={{
                  background: isTradesman
                    ? "linear-gradient(135deg, #10b981, #059669)"
                    : "linear-gradient(135deg, #6366f1, #4f46e5)",
                  boxShadow: isTradesman
                    ? "0 8px 22px rgba(16,185,129,0.30)"
                    : "0 8px 22px rgba(99,102,241,0.30)",
                }}
              >
                {primary.label}
              </Link>
              <Link
                href={secondary.href}
                className="inline-flex items-center justify-center rounded-full border-[1.5px] border-amber-200 bg-white px-7 py-3 text-[14px] font-extrabold text-amber-800 hover:bg-amber-50 transition-colors"
              >
                {secondary.label}
              </Link>
            </div>
          </div>

          <div className="mt-5 text-center text-[12px] text-slate-400">
            VetMyBuilder
          </div>
        </div>
      </div>
    </>
  );
}
