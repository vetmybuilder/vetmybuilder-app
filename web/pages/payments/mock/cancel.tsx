// web/pages/payments/mock/cancel.tsx
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";

export default function MockPaymentCanceled() {
  const router = useRouter();
  const sessionId = useMemo(() => {
    const raw = router.query.session_id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [router.query.session_id]);

  return (
    <>
      <Head>
        <title>Payment canceled — VetMyBuilder (Mock)</title>
      </Head>

      <div className="min-h-screen bg-slate-50">
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
            <Link href="/" className="font-semibold text-slate-900">
              VetMyBuilder
            </Link>
            <div className="text-sm text-slate-500">Payment canceled</div>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <div className="mb-2 text-base font-semibold">Payment canceled</div>
            <p className="text-sm">
              {sessionId ? (
                <>
                  Checkout session{" "}
                  <span className="font-mono">{sessionId}</span> was canceled.
                </>
              ) : (
                <>Your checkout was canceled.</>
              )}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/account"
                className="h-11 rounded-full border border-amber-300 bg-white px-5 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                data-testid="btn-cancel-account"
              >
                Review my account
              </Link>
              <Link
                href="/tradesman/projects"
                className="h-11 rounded-full border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                data-testid="btn-cancel-trades"
              >
                Back to vendor portal
              </Link>
              <Link
                href="/"
                className="h-11 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-900/90"
                data-testid="btn-cancel-home"
              >
                Home
              </Link>
            </div>

            <p className="mt-6 text-xs text-amber-900/80">
              This is a mock page for development/testing only.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
