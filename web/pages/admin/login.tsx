// web/pages/admin/login.tsx
import Head from "next/head";
import Link from "next/link";

export default function AdminLoginPage() {
  return (
    <>
      <Head>
        <title>Admin sign-in • VetMyBuilder</title>
      </Head>

      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Lock icon */}
          <div className="flex justify-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 border border-slate-700 shadow-lg">
              <svg className="h-8 w-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white text-center mb-1">
            Admin sign-in
          </h1>
          <p className="text-sm text-slate-400 text-center mb-8">
            Access the VetMyBuilder admin console
          </p>

          {/* Card */}
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 backdrop-blur p-6 shadow-xl">
            <p className="text-sm text-slate-300 mb-5">
              Sign in with your admin account to access the leaderboard and
              management pages.
            </p>

            <Link
              href={{
                pathname: "/login",
                query: { next: "/admin/tradesmen-leaderboard" },
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100 transition-colors"
              data-testid="admin-login-continue"
            >
              <svg className="h-4 w-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Continue to sign in
            </Link>

            <p className="mt-4 text-xs text-slate-500 text-center">
              After you sign in you&apos;ll be redirected back to the admin
              console.
            </p>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
            >
              ← Back to VetMyBuilder
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
