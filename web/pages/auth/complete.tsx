import * as React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { initFirebase } from "@/utils/firebase";
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { useAuth } from "@/utils/auth";

/**
 * Handles Firebase Email Link sign-in completion.
 * - If the email is in localStorage (vmb.magic.email), completes automatically.
 * - If not, prompts the user to type their email to finish.
 * - Redirects to ?next=/path if provided, else "/".
 */
export default function AuthCompletePage() {
  const router = useRouter();
  const { completeEmailLinkSignInIfPresent } = useAuth();

  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [needsEmail, setNeedsEmail] = React.useState(false);

  const nextPath = React.useMemo(() => {
    if (!router.isReady) return "/";
    const n = (router.query.next as string) || "/";
    try {
      // Prevent external redirects
      const url = new URL(n, window.location.origin);
      if (url.origin !== window.location.origin) return "/";
      return url.pathname + url.search + url.hash;
    } catch {
      return "/";
    }
  }, [router.isReady, router.query.next]);

  React.useEffect(() => {
    if (!router.isReady) return;

    (async () => {
      setError(null);
      setBusy(true);
      try {
        // If link is valid and email cached, this will sign-in and return user
        const u = await completeEmailLinkSignInIfPresent();
        if (u) {
          router.replace(nextPath);
          return;
        }

        // Not a valid email link? Show a friendly message.
        const auth = initFirebase();
        if (!isSignInWithEmailLink(auth, window.location.href)) {
          setError("This link is not valid or has already been used.");
          return;
        }

        // Valid link but no cached email — ask for it
        setNeedsEmail(true);
      } catch (e: any) {
        if (e?.message === "EMAIL_REQUIRED") {
          setNeedsEmail(true);
        } else {
          setError(
            e?.message || "Could not complete sign-in. Please try again."
          );
        }
      } finally {
        setBusy(false);
      }
    })();
  }, [router.isReady, nextPath, completeEmailLinkSignInIfPresent, router]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setBusy(true);
      const auth = initFirebase();
      // Complete sign-in using the email provided and the current URL
      await signInWithEmailLink(auth, trimmed, window.location.href);
      try {
        localStorage.removeItem("vmb.magic.email");
      } catch {}
      router.replace(nextPath);
    } catch (err: any) {
      setError(err?.message || "Sign-in failed. Please request a new link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>Signing you in… • VetMyBuilder</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 shadow-xl p-6">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {needsEmail ? "Confirm your email" : "Signing you in…"}
          </h1>

          {!needsEmail && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Please wait while we complete your sign-in.
            </p>
          )}

          {needsEmail && (
            <form
              onSubmit={submitEmail}
              className="mt-4 space-y-3"
              data-qa="magic-complete-form"
            >
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                To finish signing in, enter the email address where you received
                the link.
              </p>
              <input
                type="email"
                autoFocus
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 outline-none focus:ring-2 focus:ring-neutral-900/10"
                placeholder="you@example.com"
                data-qa="magic-email-input"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full h-11 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold hover:opacity-90 disabled:opacity-60"
                data-qa="magic-complete-submit"
              >
                {busy ? "Signing in…" : "Finish sign-in"}
              </button>
            </form>
          )}

          {error && (
            <p
              className="mt-4 text-sm text-red-600"
              role="alert"
              data-qa="magic-complete-error"
            >
              {error}
            </p>
          )}

          {!needsEmail && (
            <div className="mt-4 text-sm text-neutral-500 flex items-center gap-2">
              {busy && (
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    fill="currentColor"
                  />
                </svg>
              )}
              <span data-qa="magic-complete-status">
                If this takes more than a moment, you can safely close this tab.
              </span>
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={() => router.replace("/")}
              className="text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white underline"
              data-qa="magic-complete-back"
            >
              Go to home
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
