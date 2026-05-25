// web/components/project/ProjectActionsSheet.tsx
//
// Mobile owner project actions sheet — kebab menu offers a single action:
// "Mark project as completed", which routes to the full-screen /close page.
// Archive is intentionally not exposed: homeowners only ever close a project
// (the close flow itself decides between completed and archived based on
// whether the work went ahead and a winner was picked).

import { useRouter } from "next/router";
import { CheckCircle2, Pencil, PoundSterling } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";

// Project sub-types that roll up to the Insulation category. Kept in
// sync with the same list on pages/projects/[id].tsx - the server-side
// TYPE_TO_CATEGORY map isn't exposed to the web bundle.
const INSULATION_TYPES = new Set<string>([
  "Cavity Wall Insulation",
  "Draught Proofing",
  "External Wall Insulation",
  "Floor Insulation",
  "Garage Insulation",
  "Internal Wall Insulation",
  "Loft Insulation",
  "Pipe & Tank Lagging",
  "Room-in-Roof Insulation",
  "Soundproofing",
  "Underfloor Insulation",
]);

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  projectType?: string | null;
};

export default function ProjectActionsSheet({
  open,
  onClose,
  projectId,
  projectType,
}: Props) {
  const router = useRouter();
  const showGrantCheck =
    typeof projectType === "string" && INSULATION_TYPES.has(projectType);

  function pickEdit() {
    onClose();
    router.push(`/projects/${projectId}/edit`);
  }

  function pickClose() {
    onClose();
    router.push(`/projects/${projectId}/close`);
  }

  function pickGrantCheck() {
    onClose();
    if (typeof window !== "undefined") {
      window.open("/free-wall-insulation", "_blank", "noopener,noreferrer");
    }
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
          Edit the details or close the project once the work is done.
        </p>
      </div>

      <div className="px-5 pt-4 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={pickEdit}
          data-testid="project-actions-edit"
          className="bg-white border-[1.5px] border-gray-200 rounded-[18px] p-4 flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
        >
          <span className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <Pencil className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-extrabold tracking-tight text-gray-900">
              Edit project
            </span>
            <span className="block text-[12.5px] text-gray-500 leading-snug">
              Change details, description, photos.
            </span>
          </span>
        </button>

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

        {showGrantCheck && (
          <button
            type="button"
            onClick={pickGrantCheck}
            data-testid="project-actions-grant-check"
            className="bg-white border-[1.5px] border-emerald-200 rounded-[18px] p-4 flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
          >
            <span className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <PoundSterling className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-extrabold tracking-tight text-gray-900">
                Check grant eligibility
              </span>
              <span className="block text-[12.5px] text-gray-500 leading-snug">
                You might get this paid for by the government.
              </span>
            </span>
          </button>
        )}
      </div>

      <div
        className="px-5 pt-3 pb-5"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-[14px] transition-colors"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}
