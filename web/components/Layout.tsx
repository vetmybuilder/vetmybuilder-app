// web/components/Layout.tsx
import { useEffect } from "react";
import dynamic from "next/dynamic";
import SiteHeader from "@/components/SiteHeader";

const AddToHomeScreenToast = dynamic(
  () => import("@/components/AddToHomeScreenToast"),
  { ssr: false },
);

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
        aria-label="Skip to content"
        data-testid="skip-to-content"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main
        id="main"
        className="pt-14"
        data-testid="main-content"
      >
        {children}
      </main>

      <AddToHomeScreenToast />
    </>
  );
}
