// web/components/Layout.tsx
import { useEffect, useState } from "react";
import Link from "next/link";
import CookieConsent from "react-cookie-consent";
import dynamic from "next/dynamic";
import SiteHeader from "@/components/SiteHeader";

const AddToHomeScreenToast = dynamic(
  () => import("@/components/AddToHomeScreenToast"),
  { ssr: false },
);

const BG_IMAGES = [
  "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=1920&q=80&auto=format",
  "https://images.unsplash.com/photo-1716037991590-c975184b37df?w=1920&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1646324554833-f0b6a479fa5d?w=1920&q=80&auto=format&fit=crop",
];

// Chosen once per browser session — stable across re-renders and route changes
let sessionBg: string | null = null;

export default function Layout({ children }: { children: React.ReactNode }) {
  // Start with no URL so SSR and client hydration are identical (no mismatch)
  const [bgUrl, setBgUrl] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Pick once and reuse for the whole session
    if (!sessionBg) {
      sessionBg = BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)];
    }
    setBgUrl(sessionBg);
  }, []);

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

      {/* Full-page background — hidden until image fully loads to prevent flicker */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-slate-900">
        {bgUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bgUrl}
              alt=""
              aria-hidden="true"
              fetchPriority="high"
              decoding="async"
              onLoad={() => setLoaded(true)}
              className={`h-full w-full object-cover transition-opacity duration-700 ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
            <div
              className={`absolute inset-0 bg-slate-900/15 transition-opacity duration-700 ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </>
        )}
      </div>

      <SiteHeader />

      <main id="main" className="pt-14" data-testid="main-content">
        {children}
      </main>

      <CookieConsent
        location="bottom"
        cookieName="vmb_cookie_consent"
        expires={365}
        buttonText="Got it"
        style={{
          background: "#1e293b",
          padding: "12px 20px",
          alignItems: "center",
          fontSize: "13px",
        }}
        buttonStyle={{
          background: "#ef4444",
          color: "#fff",
          borderRadius: "9999px",
          padding: "8px 24px",
          fontWeight: "700",
          fontSize: "13px",
        }}
      >
        We use cookies to keep you signed in and improve the site. By continuing, you accept analytics cookies.{" "}
        <Link href="/cookies" className="underline text-red-300 hover:text-red-200">
          Cookie policy
        </Link>
      </CookieConsent>

      <AddToHomeScreenToast />
    </>
  );
}
