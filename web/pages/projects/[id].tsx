// pages/projects/[id].tsx
import * as React from "react";
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ChevronLeft, Home } from "lucide-react";
import { useProjectView } from "@/components/project/views/useProjectView";
import OwnerProjectView from "@/components/project/views/OwnerProjectView";
import TradesmanProjectView from "@/components/project/views/TradesmanProjectView";
import NeighbourProjectView from "@/components/project/views/NeighbourProjectView";
import Layout from "@/components/Layout";
import SwipeDeck from "@/components/project/SwipeDeck";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";

type ViewerRole = "unknown" | "owner" | "trades" | "home";

function getShortProjectTitle(name?: string | null): string {
  if (!name) return "";
  let base = name.trim();
  if (base.toLowerCase().endsWith(" job post"))
    base = base.slice(0, -" job post".length).trim();
  const inIdx = base.toLowerCase().indexOf(" in ");
  if (inIdx > 0) base = base.slice(0, inIdx).trim();
  return base;
}

function ProjectSwipeMobile({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const api = useApi();
  const router = useRouter();
  const [matches, setMatches] = useState<{
    recommended: any[];
    subscribed: any[];
  } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${projectId}/matches`);
        if (alive) setMatches(data);
      } catch {
        /* noop - mobile swipe deck is additive */
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, api]);

  return (
    <main
      className="fixed inset-0 bg-white overflow-y-auto"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      <div className="h-[env(safe-area-inset-top)]" />

      {/* Back nav row — chevron-left in round grey button, title centred */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-[15px] font-bold text-gray-500 tracking-tight truncate max-w-[60%] text-center">
          {projectTitle || "Find your builder"}
        </div>
        <div className="w-10" />
      </div>

      {matches && (
        <SwipeDeck
          projectId={String(projectId)}
          builders={[
            ...(matches.recommended || []),
            ...(matches.subscribed || []),
          ]}
          onInfo={(builder) => {
            const recId = (builder as any).recommendationId;
            if (builder.tier === "recommended" && recId) {
              router.push(
                `/builders/${recId}?projectId=${projectId}`,
              );
            } else {
              router.push(
                `/tradesman/${builder.uid}?projectId=${projectId}`,
              );
            }
          }}
          onMatch={(matchId) => router.push(`/match/${matchId}`)}
        />
      )}
    </main>
  );
}

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
      <Layout>
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
                  Vet
                  <span
                    className="text-red-500"
                    style={{
                      fontFamily: "'Caveat', cursive",
                      fontWeight: 700,
                      fontSize: "130%",
                      WebkitTextStroke: "0.5px currentColor",
                    }}
                  >
                    My
                  </span>
                  Builder
                </span>
              </Link>
              <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-10 sm:p-14">
                <p className="text-8xl font-black text-red-500 leading-none mb-4">
                  404
                </p>
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
      </Layout>
    );
  }

  if (!ready) {
    return (
      <Layout>
        <div className="-mt-14 relative min-h-screen overflow-hidden">
          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10 pb-8">
            {vm.loadingUi}
          </div>
        </div>
      </Layout>
    );
  }

  // ---------------------------------------------------------
  // 4) Owner branch — mobile/desktop split
  // ---------------------------------------------------------
  if (vm.isOwner) {
    const projectIdStr = String(vm.project?.id ?? "");
    const projectTitle = getShortProjectTitle(vm.project?.name);
    return (
      <>
        <Head>
          <title>
            {vm.project?.name
              ? `${vm.project.name} — VetMyBuilder`
              : "Project — VetMyBuilder"}
          </title>
        </Head>

        {/* MOBILE — bare, full-screen swipe deck */}
        <div className="md:hidden">
          <ProjectSwipeMobile
            projectId={projectIdStr}
            projectTitle={projectTitle}
          />
        </div>

        {/* DESKTOP — unchanged: existing OwnerProjectView with site chrome */}
        <div className="hidden md:block">
          <Layout>
            <div className="-mt-14 relative min-h-screen overflow-hidden">
              <div
                className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10"
                data-testid="project-view-page"
              >
                <OwnerProjectView vm={vm} />
                {vm.closeProjectModal}
                {vm.plansModal}
              </div>
            </div>
          </Layout>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------
  // 5) Tradesman / neighbour branches — wrap in Layout (since
  //    we removed the global Layout wrapper for this path)
  // ---------------------------------------------------------
  let viewContent: React.ReactNode = null;
  if (viewerRole === "home") {
    viewContent = <NeighbourProjectView vm={vm} />;
  } else if (viewerRole === "trades") {
    // Redirect already handled above
    viewContent = <TradesmanProjectView vm={vm} />;
  }

  return (
    <Layout>
      <Head>
        <title>
          {vm.project?.name
            ? `${vm.project.name} — VetMyBuilder`
            : "Project — VetMyBuilder"}
        </title>
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
    </Layout>
  );
}
