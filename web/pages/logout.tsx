// web/pages/logout.tsx
import { useEffect } from "react";
import { signOutUser } from "@/utils/auth";

export default function Logout() {
  useEffect(() => {
    (async () => {
      try {
        await signOutUser(); // Firebase sign out (clears client state)
        // Best-effort: clear any server cookies if route exists
        try {
          await fetch("/api/logout", { method: "POST", cache: "no-store" });
        } catch {}
      } finally {
        // Hard reload ensures header shows logged-out state immediately
        window.location.replace("/?signedOut=1");
      }
    })();
  }, []);
  return <p className="p-6 text-zinc-300">Signing you out…</p>;
}
