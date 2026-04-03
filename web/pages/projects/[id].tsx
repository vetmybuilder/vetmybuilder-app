// pages/projects/[id].tsx
import * as React from "react";
import { useEffect, useState } from "react";
import Head from "next/head";
import { useProjectView } from "@/components/project/views/useProjectView";
import OwnerProjectView from "@/components/project/views/OwnerProjectView";
import TradesmanProjectView from "@/components/project/views/TradesmanProjectView";
import NeighbourProjectView from "@/components/project/views/NeighbourProjectView";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";

type ViewerRole = "unknown" | "owner" | "trades" | "home";

export default function ProjectViewPage() {
  const vm = useProjectView();
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [viewerRole, setViewerRole] = useState<ViewerRole>("unknown");

  // ---------------------------------------------------------
  // 1) Determine role (guest/homeowner/tradesman)
  // ---------------------------------------------------------
  useEffect(() => {
    if (authLoading) return;

    // Not logged in → homeowner-style viewer
    if (!user) {
      setViewerRole("home");
      return;
    }

    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const isTrades =
          String(data?.role || "").toLowerCase() === "tradesman" ||
          !!data?.profile;

        setViewerRole(isTrades ? "trades" : "home");
      } catch {
        setViewerRole("home");
      }
    })();
  }, [api, user, authLoading]);

  // ---------------------------------------------------------
  // 2) REDIRECT tradesmen away from homeowner project views
  // ---------------------------------------------------------
  useEffect(() => {
    if (viewerRole !== "trades") return;
    router.replace("/tradesman/projects");
  }, [viewerRole, router]);

  // ---------------------------------------------------------
  // 3) Prevent UI render until:
  //    - project is loaded
  //    - role is known
  // ---------------------------------------------------------
  const ready =
    !vm.loading && !vm.errorStatus && !!vm.project && viewerRole !== "unknown";

  if (!ready) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-stone-50">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
          {vm.loadingUi}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // 4) Select correct view
  // ---------------------------------------------------------
  let viewContent: React.ReactNode = null;

  if (vm.isOwner) {
    viewContent = <OwnerProjectView vm={vm} />;
  } else if (viewerRole === "home") {
    viewContent = <NeighbourProjectView vm={vm} />;
  } else if (viewerRole === "trades") {
    // (This will never show — redirect already handled)
    viewContent = <TradesmanProjectView vm={vm} />;
  }

  // ---------------------------------------------------------
  // 5) FINAL RENDER
  // ---------------------------------------------------------
  return (
    <>
      <Head>
        <title>{vm.project?.name ? `${vm.project.name} — VetMyBuilder` : "Project — VetMyBuilder"}</title>
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>
      <div className="relative min-h-screen overflow-hidden bg-stone-50">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
        </div>
        <div
          className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
          data-testid="project-view-page"
        >
          {viewContent}
          {vm.closeProjectModal}
          {vm.plansModal}
        </div>
      </div>
    </>
  );
}
