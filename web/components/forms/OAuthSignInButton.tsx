// web/components/forms/OAuthSignInButton.tsx
// Reusable "Continue with <provider>" button for the social sign-in
// providers we support — currently Google and Facebook.
//
// Uses Firebase's popup flow. Clicking the button opens the provider's
// account chooser in a popup window which auto-closes on success. The
// Firebase onIdTokenChanged listener in web/utils/auth.tsx then picks up
// the new user, hits /api/me, and routes to /signup/complete (incomplete
// profile) or returnTo / /projects (complete profile).
//
// The optional `returnTo` prop is stashed in sessionStorage before the
// popup opens so auth.tsx can read it after the credential is processed.

import { useState } from "react";
import {
  signInWithProvider,
  type OAuthProviderName,
} from "@/utils/oauthSignIn";
import { signOutUser } from "@/utils/auth";
import { useApi } from "@/utils/api";

type Props = {
  provider: OAuthProviderName;
  label?: string;
  returnTo?: string;
  /**
   * Declares which kind of account the user intends to sign up as.
   * When set to "tradesman", post-auth routing sends users without an
   * existing tradesman profile to /tradesman/signup/complete (the minimal
   * tradesman onboarding page). When omitted / "homeowner", the existing
   * homeowner-completion flow is used.
   */
  intent?: "homeowner" | "tradesman";
  onError?: (message: string) => void;
};

// Dedicated session-storage key for OAuth post-signup routing. We deliberately
// do NOT reuse the generic "vmb:returnTo" key here because _app.tsx auto-stashes
// the current pathname there on every non-auth route change — that auto-stash
// can hold values like "/?signedOut=1" which would poison the post-signup
// redirect. This key is only ever written by this button and read by GuestOnly,
// login.tsx, and /signup/complete.
export const RETURN_TO_KEY = "vmb:oauthReturnTo";

// Stashed before the OAuth popup opens. Read by the post-auth redirect logic
// in login.tsx to decide whether a user without an existing tradesman profile
// should be sent to /tradesman/signup/complete instead of the homeowner
// completion page.
export const INTENT_KEY = "vmb:oauthIntent";

const PROVIDER_LABELS: Record<OAuthProviderName, string> = {
  google: "Continue with Google",
  facebook: "Continue with Facebook",
};

const PROVIDER_TEST_IDS: Record<OAuthProviderName, string> = {
  google: "google-signin-button",
  facebook: "facebook-signin-button",
};

function ProviderIcon({ provider }: { provider: OAuthProviderName }) {
  if (provider === "google") {
    return (
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#FFC107"
          d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
        />
        <path
          fill="#FF3D00"
          d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
        />
      </svg>
    );
  }

  // facebook
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.469H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12z"
      />
    </svg>
  );
}

export default function OAuthSignInButton({
  provider,
  label,
  returnTo,
  intent,
  onError,
}: Props) {
  const [loading, setLoading] = useState(false);
  const api = useApi();

  async function handleClick() {
    setLoading(true);
    try {
      if (returnTo) {
        try {
          sessionStorage.setItem(RETURN_TO_KEY, returnTo);
        } catch {}
      }
      try {
        if (intent === "tradesman") {
          sessionStorage.setItem(INTENT_KEY, "tradesman");
        } else {
          // Clear any stale intent so a previous tradesman attempt doesn't
          // leak into a later homeowner sign-in on the same tab.
          sessionStorage.removeItem(INTENT_KEY);
        }
      } catch {}
      const result = await signInWithProvider(provider);

      // Beta gate: homeowner signups are invite-only during beta. If this
      // OAuth sign-in just CREATED a new homeowner account while the beta
      // gate is on, immediately sign them back out and block. Existing
      // homeowners (isNewUser=false) and tradesmen (intent=tradesman) are
      // unaffected.
      if (result.ok && result.isNewUser && intent !== "tradesman") {
        let blocked = false;
        try {
          const { data } = await api.get("/api/auth/beta-status?role=homeowner");
          blocked = !!data?.required;
        } catch {
          // Fail safe - block the new homeowner account rather than let it through.
          blocked = true;
        }
        if (blocked) {
          await signOutUser();
          // Hard-redirect to the signup page so the auth listener's in-flight
          // navigation to /projects is overridden and the signed-out state is
          // clean. The signup page reads ?invite_only=1 to show the message.
          if (typeof window !== "undefined") {
            window.location.replace("/signup?invite_only=1");
          }
          return;
        }
      }

      if (result.ok) {
        const { trackLogin } = await import("@/utils/analytics");
        trackLogin("google");
      }
      // On success, the credential has been issued and Firebase's
      // onIdTokenChanged listener will fire on the parent window — auth.tsx
      // takes it from there. We just suppress the cancel-by-user case so
      // closing the popup doesn't show an error.
      if (!result.ok) {
        if (result.code !== "auth/popup-closed-by-user" && onError) {
          onError(result.message);
        }
      }
    } catch (e: any) {
      if (onError) onError(e?.message || `${provider} sign-in failed`);
    } finally {
      setLoading(false);
    }
  }

  const displayLabel = label || PROVIDER_LABELS[provider];

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      data-testid={PROVIDER_TEST_IDS[provider]}
      className="w-full inline-flex items-center justify-center gap-3 rounded-full border border-zinc-300 bg-white px-8 py-4 text-base font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 hover:shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <ProviderIcon provider={provider} />
      {loading ? "Signing in…" : displayLabel}
    </button>
  );
}
