// web/utils/oauthSignIn.ts
// Thin wrapper around Firebase signInWithPopup for the social providers we
// support — currently Google and Facebook. Used by the homeowner sign-up
// and login pages via OAuthSignInButton.
//
// We use the popup flow because it works reliably against the Firebase
// Auth emulator and across all browsers without the cross-origin storage
// gymnastics that signInWithRedirect needs. Visually it's a popup window
// that auto-closes on success — the same UX most production "Sign in
// with X" buttons (Stripe, GitHub, Linear, Notion, etc.) use.

import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  getAdditionalUserInfo,
  type AuthProvider,
  type UserCredential,
} from "firebase/auth";
import { initFirebase } from "./firebase";

export type OAuthProviderName = "google" | "facebook";

export type OAuthSignInResult =
  | { ok: true; credential: UserCredential; isNewUser: boolean }
  | { ok: false; code: string; message: string };

function buildProvider(name: OAuthProviderName): AuthProvider {
  if (name === "google") {
    const p = new GoogleAuthProvider();
    // Always show the account chooser, even if the user is already signed
    // into a single Google account in this browser.
    p.setCustomParameters({ prompt: "select_account" });
    return p;
  }

  // facebook
  const p = new FacebookAuthProvider();
  // We only need email + public profile (display name + photo). Both are
  // included in the default scopes, but listing them explicitly is
  // self-documenting.
  p.addScope("email");
  p.addScope("public_profile");
  return p;
}

export async function signInWithProvider(
  name: OAuthProviderName,
): Promise<OAuthSignInResult> {
  const auth = initFirebase();
  const provider = buildProvider(name);

  try {
    const credential = await signInWithPopup(auth, provider);
    const info = getAdditionalUserInfo(credential);
    return { ok: true, credential, isNewUser: !!info?.isNewUser };
  } catch (e: any) {
    return {
      ok: false,
      code: e?.code || "unknown",
      message: e?.message || `${name} sign-in failed`,
    };
  }
}
