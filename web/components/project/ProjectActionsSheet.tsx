// web/components/project/ProjectActionsSheet.tsx
//
// Mobile owner project actions sheet — kebab menu offers a single action:
// "Mark project as completed", which routes to the full-screen /close page.
// Archive is intentionally not exposed: homeowners only ever close a project
// (the close flow itself decides between completed and archived based on
// whether the work went ahead and a winner was picked).

import { useRouter } from "next/router";
import { CheckCircle2 } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
};

export default function ProjectActionsSheet({
  open,
  onClose,
  projectId,
}: Props) {
  const router = useRouter();

  function pickClose() {
    onClose();
    router.push(`/projects/${projectId}/close`);
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Project actions"
      sheetTestId="project-actions-sheet"
    >
      <div className="text-center px-6">
        <h3 className="text-[19px] font-extrabold tracking-tight text-gray-900">
          Project actions
        </h3>
        <p className="mt-1.5 mx-2 text-[13px] text-gray-500 leading-snug">
          Close this project once the work is done or didn't go ahead.
        </p>
      </div>

      <div className="px-5 pt-4 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={pickClose}
          data-testid="project-actions-mark-complete"
          className="bg-white border-[1.5px] border-gray-200 rounded-[18px] p-4 flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
        >
          <span className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-extrabold tracking-tight text-gray-900">
              Mark project as completed
            </span>
            <span className="block text-[12.5px] text-gray-500 leading-snug">
              Tell us how the project ended.
            </span>
          </span>
        </button>
      </div>

      <div
        className="px-5 pt-3 pb-5"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-white border-[1.5px] border-gray-200 text-gray-600 font-bold text-[14px]"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}
