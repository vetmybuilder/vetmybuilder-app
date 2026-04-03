// web/pages/404.tsx
import Head from "next/head";
import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found — VetMyBuilder</title>
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14 min-h-screen">
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-stone-50">
          {/* Background bands */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
            <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
          </div>

          <div className="relative z-10 w-full max-w-lg px-4 sm:px-0 text-center">
            {/* Logo */}
            <Link href="/" className="inline-flex items-center gap-2.5 mb-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500">
                <Home className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-black text-zinc-900">
                Vet<span className="text-red-500">My</span>Builder
              </span>
            </Link>

            {/* Card */}
            <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-10 sm:p-14">
              <p className="text-8xl font-black text-red-500 leading-none mb-4">404</p>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900 mb-3">
                Page not found
              </h1>
              <p className="text-zinc-500 text-sm leading-relaxed mb-8">
                The page you&apos;re looking for doesn&apos;t exist or has been moved.
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all"
              >
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
