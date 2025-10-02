import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import Footer from "@/components/Footer";

export default function Home() {
  const { user } = useAuth();

  return (
    <>
      <Head>
        <title>Vetmybuilder</title>
        <meta name="description" content="Find trusted builders, fast." />
      </Head>

      {/* MAIN PAGE */}
      <main className="bg-black text-white">
        {/* HERO (scoped background so it can't cover the footer) */}
        <section
          className="relative isolate min-h-[70vh] md:min-h-[calc(100svh-96px)] overflow-hidden"
          aria-label="Hero"
        >
          {/* BG image */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.55) 100%), url('/hero.png')",
            }}
            aria-hidden
          />

          {/* Top-left logo */}
          <header className="relative z-10">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
              <Link href="/" className="inline-flex items-center gap-2">
                <span className="inline-block h-7 w-7 rounded-lg bg-indigo-500" />
                <span className="text-white font-semibold tracking-tight text-lg">
                  Vetmybuilder
                </span>
              </Link>
            </div>
          </header>

          {/* Hero content */}
          <div className="relative z-10">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="pt-16 pb-24 sm:pt-24 sm:pb-32 lg:pt-32 lg:pb-40 max-w-3xl">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight">
                  And just like that — you’re hiring the right builder.
                </h1>
                <p className="mt-5 text-lg sm:text-xl text-zinc-300">
                  Create a project, invite trusted recommendations, and shortlist
                  with confidence.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  {!user ? (
                    <>
                      <Link
                        href="/login"
                        className="inline-flex items-center justify-center rounded-xl px-5 py-3 bg-indigo-600 hover:bg-indigo-500 transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        Login
                      </Link>
                      <Link
                        href="/register"
                        className="inline-flex items-center justify-center rounded-xl px-5 py-3 bg-white/10 hover:bg-white/15 border border-white/10 transition focus:outline-none focus:ring-2 focus:ring-white/30"
                      >
                        Register
                      </Link>
                    </>
                  ) : (
                    <Link
                      href="/projects"
                      className="inline-flex items-center justify-center rounded-xl px-5 py-3 bg-indigo-600 hover:bg-indigo-500 transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      Go to my projects
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Removed the bottom dark blur */}
        </section>

        {/* Small spacer so the footer is clearly reachable */}
        <div className="h-10 md:h-16" />
      </main>

      {/* FOOTER */}
      <Footer />
    </>
  );
}
