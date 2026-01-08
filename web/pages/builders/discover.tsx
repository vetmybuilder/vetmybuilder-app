import AuthedOnly from "@/components/AuthedOnly";
import dynamic from "next/dynamic";

// Code-split the heavy component for a snappier page
const DiscoverBuilders = dynamic(
  () => import("@/components/tradesmen/DiscoverTradesmenSection"),
  { ssr: true }
);

export default function DiscoverBuildersPage() {
  return (
    <AuthedOnly>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6">
        <DiscoverBuilders />
      </div>
    </AuthedOnly>
  );
}
