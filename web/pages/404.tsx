// web/pages/404.tsx
import Head from "next/head";
import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found - VetMyBuilder</title>
      </Head>

      <div className="overflow-x-hidden -mt-14 min-h-screen flex items-center justify-center bg-[#fafaf9]">
        <div className="text-center max-w-lg px-4">
          <div className="text-[80px] leading-none mb-4">
            <span className="inline-block -rotate-[20deg]">&#128295;</span>
            <span className="inline-block rotate-[20deg] -ml-2.5">&#128296;</span>
          </div>

          <h1 className="text-7xl font-[800] text-zinc-900 leading-none">404</h1>
          <p className="text-2xl font-[800] text-zinc-900 mt-2">Nothing to see here</p>
          <p className="text-base text-zinc-500 mt-3 leading-relaxed">
            This page doesn&apos;t exist. Head back home or post a job and
            we&apos;ll find the right tradesperson for you.
          </p>

          <div className="mt-7 flex gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-colors"
            >
              Go home
            </Link>
            <Link
              href="/projects/new"
              className="inline-flex items-center justify-center rounded-full border-2 border-zinc-300 px-8 py-3.5 text-base font-bold text-zinc-900 hover:bg-zinc-50 transition-colors"
            >
              Post a job
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
