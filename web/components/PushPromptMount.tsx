// web/components/PushPromptMount.tsx
//
// Self-contained mount for the post-signup notifications-opt-in modal.
// Drops into Layout.tsx so the prompt fires no matter where the user
// lands after auth completes - homepage, /projects, /projects/{id}
// (engagement-first happy path), /tradesman/jobs, etc.
//
// Conditions to fire:
//   - profileComplete === true (so SSO mid-signup users don't see it
//     before /signup/complete has captured their postcode)
//   - sessionStorage `vmb:showPushPrompt` is "1" (set by SignupForm
//     and signup/complete after a successful signup)
//
// The flag is removed on read, so the prompt fires exactly once per
// signup. If the user dismisses it, PushPrompt also writes
// localStorage `vmb:pushSetupShown` so future signups in the same
// browser don't re-prompt.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useRole } from "@/utils/useRole";
import PushPrompt from "@/components/PushPrompt";

export default function PushPromptMount() {
  const { profileComplete } = useAuth();
  const router = useRouter();
  // Derive isTradesman so the prompt picks up the correct palette
  // (emerald for traders, indigo for homeowners). Passing it from
  // _app.tsx would require role plumbing there; useRole already owns
  // the same sessionStorage / API fast-path as SiteHeader.
  const { role } = useRole();
  const isTradesman = role === "tradesman";
  const [open, setOpen] = useState(false);

  const checkFlag = useCallback(() => {
    if (profileComplete !== true) return;
    try {
      if (sessionStorage.getItem("vmb:showPushPrompt") === "1") {
        sessionStorage.removeItem("vmb:showPushPrompt");
        setOpen(true);
      }
    } catch {}
  }, [profileComplete]);

  // Initial check when profileComplete first flips to true (the
  // homeowner / fresh-Firebase-user path).
  useEffect(() => {
    checkFlag();
  }, [checkFlag]);

  // Trade signup completion path: an OAuth trader has
  // profileComplete=true from the start (touchUserMw seeded firstName
  // from their Google displayName), so the dep above never re-fires
  // when the wizard sets the flag. Listen for routeChangeComplete so
  // when the wizard router.replace's to /tradesman/jobs we re-read
  // sessionStorage and fire the prompt.
  useEffect(() => {
    const handler = () => checkFlag();
    router.events.on("routeChangeComplete", handler);
    return () => {
      router.events.off("routeChangeComplete", handler);
    };
  }, [router.events, checkFlag]);

  if (!open) return null;
  return (
    <PushPrompt onComplete={() => setOpen(false)} isTradesman={isTradesman} />
  );
}
