import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { trackUnlockActivated } from "@/utils/analytics";

export default function PaymentSuccess() {
  const router = useRouter();
  const api = useApi();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!router.isReady || authLoading || !user) return;

    const sessionId = String(router.query.sessionId || router.query.session_id || "");
    const projectId = String(router.query.projectId || "");

    if (!sessionId) {
      setStatus("error");
      return;
    }

    (async () => {
      try {
        await api.post("/api/payments/activate-unlock", { sessionId, projectId });
      } catch {}

      if (projectId) {
        trackUnlockActivated(Number(projectId), 0);
      }

      setStatus("success");

      if (projectId) {
        setTimeout(() => {
          router.replace(`/tradesman/jobs?unlock=success&open=${projectId}`);
        }, 2000);
      }
    })();
  }, [router.isReady, authLoading, user, api, router]);

  return (
    <>
      <Head>
        <title>Payment Successful - VetMyBuilder</title>
      </Head>

      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-12 text-center max-w-md">
          {status === "loading" && (
            <>
              <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
                <svg className="h-6 w-6 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                </svg>
              </div>
              <h1 className="text-xl font-black text-zinc-900">Processing payment...</h1>
              <p className="mt-2 text-sm text-zinc-500">Please wait while we confirm your payment.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-black text-zinc-900">Payment successful</h1>
              <p className="mt-2 text-sm text-zinc-500">
                The job details are now unlocked. Redirecting you back...
              </p>
              <Link
                href="/tradesman/jobs"
                className="mt-6 inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white hover:bg-red-600 transition-colors"
              >
                Back to jobs
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-xl font-black text-zinc-900">Something went wrong</h1>
              <p className="mt-2 text-sm text-zinc-500">
                We couldn't confirm your payment. Please try again or contact support.
              </p>
              <Link
                href="/tradesman/jobs"
                className="mt-6 inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white hover:bg-red-600 transition-colors"
              >
                Back to jobs
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
