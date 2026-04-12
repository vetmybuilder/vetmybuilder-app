// web/components/TradesmanLayout.tsx
import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";

export default function TradesmanLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-stone-50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
        <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
      </div>
      <div className="relative z-10">
        <SiteHeader />
        <main id="main" className="pt-2 sm:pt-14">
          {children}
        </main>
      </div>
    </div>
  );
}
