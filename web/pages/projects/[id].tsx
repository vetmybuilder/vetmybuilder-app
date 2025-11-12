import AuthedOnly from "@/components/AuthedOnly";
import { useProjectView } from "@/components/project/views/useProjectView";
import OwnerProjectView from "@/components/project/views/OwnerProjectView";
import TradesmanProjectView from "@/components/project/views/TradesmanProjectView";

export default function ProjectViewPage() {
  const vm = useProjectView();

  return (
    <AuthedOnly>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8" data-testid="project-view-page">
        {vm.loadingUi}

        {!vm.loading && !vm.errorStatus && vm.project && (
          vm.isOwner
            ? <OwnerProjectView vm={vm} />
            : <TradesmanProjectView vm={vm} />
        )}

        {/* Global modals common to both views */}
        {vm.closeProjectModal}
        {vm.plansModal}
      </div>
    </AuthedOnly>
  );
}
