// web/pages/admin/login.tsx
import Head from "next/head";
import Link from "next/link";

export default function AdminLoginPage() {
  return (
    <>
      <Head>
        <title>Admin sign-in • VetMyBuilder</title>
      </Head>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <section className="mx-auto max-w-lg text-center">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">
            Admin sign-in
          </h1>
          <p className="text-sm text-slate-500 mb-8">
            Access the VetMyBuilder admin console to view tradesmen and
            recommendation leaderboards.
          </p>

          <div className="card px-6 py-6 text-left">
            <p className="text-sm text-slate-700 mb-4">
              You need to sign in with an admin account to access the admin
              leaderboard pages.
            </p>

            <Link
              href={{
                pathname: "/login",
                query: { next: "/admin/tradesmen-leaderboard" },
              }}
              className="btn w-full justify-center"
              data-testid="admin-login-continue"
            >
              Continue to login
            </Link>

            <p className="mt-4 text-xs text-slate-400">
              This uses the normal VetMyBuilder login screen. After you sign in,
              you&apos;ll be redirected back to the admin console.
            </p>
          </div>

          <div className="mt-6">
            <Link
              href="/"
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Back to VetMyBuilder home
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
