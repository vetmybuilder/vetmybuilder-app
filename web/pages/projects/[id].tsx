// web/pages/projects/[id].tsx
import * as React from "react";
import { useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useProjectView } from "@/components/project/views/useProjectView";
import OwnerProjectView from "@/components/project/views/OwnerProjectView";
import TradesmanProjectView from "@/components/project/views/TradesmanProjectView";
import NeighbourProjectView from "@/components/project/views/NeighbourProjectView";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";

type ViewerRole = "unknown" | "owner" | "trades" | "home";

export default function ProjectViewPage() {
  const vm = useProjectView();
  const api = useApi();
  const { user } = useAuth();

  const [viewerRole, setViewerRole] = useState<ViewerRole>("unknown");

  // Decide if a non-owner viewer is a tradesman or just a homeowner
  useEffect(() => {
    let alive = true;

    if (!user) {
      setViewerRole("home");
      return;
    }

    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const role = String(data?.role || "").toLowerCase();
        const prof = data?.profile || null;
        const isTrades = role === "tradesman" || !!prof;
        if (!alive) return;
        setViewerRole(isTrades ? "trades" : "home");
      } catch {
        if (!alive) return;
        // If the trades API fails, assume they are just a homeowner
        setViewerRole("home");
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, user]);

  const ready = !vm.loading && !vm.errorStatus && !!vm.project;

  let viewContent: React.ReactNode = null;

  if (ready) {
    if (vm.isOwner) {
      viewContent = <OwnerProjectView vm={vm} />;
    } else if (viewerRole === "trades") {
      viewContent = <TradesmanProjectView vm={vm} />;
    } else if (viewerRole === "home") {
      viewContent = <NeighbourProjectView vm={vm} />;
    }
  }

  return (
    <AuthedOnly>
      <div
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
        data-testid="project-view-page"
      >
        {vm.loadingUi}

        {viewContent}

        {/* Global modals common to all views */}
        {vm.closeProjectModal}
        {vm.plansModal}
      </div>
    </AuthedOnly>
  );
}
