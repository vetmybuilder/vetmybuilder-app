// pages/projects/[id].tsx
import * as React from "react";
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Home } from "lucide-react";
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

    // Not logged in → treat as neighbour (can view live projects, add recs)
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

  // Project not found or inaccessible
  if (!vm.loading && vm.errorStatus && viewerRole !== "unknown") {
    return (
      <>
        <Head>
          <title>Project not found — VetMyBuilder</title>
          <style>{`body { background: #fafaf9 !important; }`}</style>
        </Head>
        <div className="overflow-x-hidden min-h-screen">
          <div className="-mt-14 relative min-h-screen flex items-center justify-center overflow-hidden">
            <div className="relative z-10 w-full max-w-lg px-4 sm:px-0 text-center">
              <Link href="/" className="inline-flex items-center gap-2.5 mb-10">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500">
                  <Home className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-black text-zinc-900">
                  Vet<span className="text-red-500" style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: "130%", WebkitTextStroke: "0.5px currentColor" }}>My</span>Builder
                </span>
              </Link>
              <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-10 sm:p-14">
                <p className="text-8xl font-black text-red-500 leading-none mb-4">404</p>
                <h1 className="text-2xl font-black tracking-tight text-zinc-900 mb-3">
                  Project not found
                </h1>
                <p className="text-zinc-500 text-sm leading-relaxed mb-8">
                  This project doesn&apos;t exist or is no longer available.
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all"
                >
                  Back to home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!ready) {
    return (
      <div className="-mt-14 relative min-h-screen overflow-hidden">
        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10 pb-8">
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
    // Redirect already handled above
    viewContent = <TradesmanProjectView vm={vm} />;
  }

  // ---------------------------------------------------------
  // 5) FINAL RENDER
  // ---------------------------------------------------------
  return (
    <>
      <Head>
        <title>{vm.project?.name ? `${vm.project.name} — VetMyBuilder` : "Project — VetMyBuilder"}</title>
      </Head>
      <div className="-mt-14 relative min-h-screen overflow-hidden">
        <div
          className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10"
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
