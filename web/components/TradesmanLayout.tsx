// web/components/TradesmanLayout.tsx
import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";

export default function TradesmanLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100">
      <SiteHeader />
      <main id="main" className="pt-14">
        {children}
      </main>
    </div>
  );
}
