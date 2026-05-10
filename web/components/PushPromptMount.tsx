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

import { useEffect, useState } from "react";
import { useAuth } from "@/utils/auth";
import PushPrompt from "@/components/PushPrompt";

export default function PushPromptMount({
  isTradesman = false,
}: {
  isTradesman?: boolean;
}) {
  const { profileComplete } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (profileComplete !== true) return;
    try {
      if (sessionStorage.getItem("vmb:showPushPrompt") === "1") {
        sessionStorage.removeItem("vmb:showPushPrompt");
        setOpen(true);
      }
    } catch {}
  }, [profileComplete]);

  if (!open) return null;
  return (
    <PushPrompt onComplete={() => setOpen(false)} isTradesman={isTradesman} />
  );
}
