// web/pages/logout.tsx
import { useEffect } from "react";
import { signOutUser } from "@/utils/auth";
import { useRouter } from "next/router";

export default function Logout() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      try {
        await signOutUser();
      } finally {
        router.replace("/");
      }
    })();
  }, [router]);
  return <p className="p-6 text-zinc-300">Signing you out…</p>;
}
