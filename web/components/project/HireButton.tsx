// web/components/project/HireButton.tsx
//
// Generic hire button shown on a tradesperson's profile page (either the
// recommendation-derived `/builders/[id]` page or the onboarded
// `/tradesman/[id]` page) when reached from a project context.
//
// The component reads `?projectId=` from the URL query, then:
//   1. Fetches the project's existing hires to verify access AND check whether
//      this target is already hired.
//   2. Hides itself entirely if the project isn't accessible (404/403) — no
//      broken hire flow for spoofed projectIds.
//   3. Renders the hire CTA, opens HireConfirmModal on click, and POSTs to
//      `/api/projects/:projectId/hires` with the right body field.
//
// Accepts EITHER `recommendationId` (for /builders/[id]) OR `tradesmanUserId`
// (for /tradesman/[id]) — exactly one must be provided.

import * as React from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import HireConfirmModal from "@/components/project/HireConfirmModal";
import { CheckCircle2 } from "lucide-react";

type Props = {
  /** Display name shown in the modal title and the button. */
  displayName: string;
  /** Recommendation-id flow (e.g. from /builders/[id]). */
  recommendationId?: number;
  /** Onboarded tradesman flow (e.g. from /tradesman/[id]). */
  tradesmanUserId?: string;
};

export default function HireButton({
  displayName,
  recommendationId,
  tradesmanUserId,
}: Props) {
  const router = useRouter();
  const api = useApi();

  // Project context comes from the query string.
  const projectIdRaw = router.query?.projectId;
  const projectId = React.useMemo(() => {
    const value = Array.isArray(projectIdRaw) ? projectIdRaw[0] : projectIdRaw;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [projectIdRaw]);

  const [open, setOpen] = React.useState(false);
  const [alreadyHired, setAlreadyHired] = React.useState(false);
  const [projectAccessible, setProjectAccessible] = React.useState<
    boolean | null
  >(null);

  const checkAlreadyHired = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const { data } = await api.get(`/api/projects/${projectId}/hires`);
      const items = Array.isArray(data?.items) ? data.items : [];
      const hit = items.some((h: any) => {
        if (recommendationId != null) {
          return h?.recommendationId === recommendationId;
        }
        if (tradesmanUserId) {
          return h?.tradesmanUserId === tradesmanUserId;
        }
        return false;
      });
      setAlreadyHired(hit);
      setProjectAccessible(true);
    } catch {
      setProjectAccessible(false);
    }
  }, [api, projectId, recommendationId, tradesmanUserId]);

  React.useEffect(() => {
    checkAlreadyHired();
  }, [checkAlreadyHired]);

  // Reasons to render nothing
  if (!projectId) return null;
  if (recommendationId == null && !tradesmanUserId) return null;
  if (projectAccessible === null) return null; // initial fetch in flight
  if (projectAccessible === false) return null; // 404/403 — hide entirely

  async function submitHire(message: string) {
    if (!projectId) return;
    const body: Record<string, any> = {
      homeownerMessage: message || undefined,
    };
    if (recommendationId != null) body.recommendationId = recommendationId;
    if (tradesmanUserId) body.tradesmanUserId = tradesmanUserId;

    await api.post(`/api/projects/${projectId}/hires`, body);
    setOpen(false);
    await checkAlreadyHired();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={alreadyHired}
        data-testid="hire-button"
        className={`inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
          alreadyHired
            ? "bg-emerald-100 text-emerald-700 cursor-default"
            : "bg-red-500 text-white shadow-sm hover:bg-red-600"
        }`}
      >
        <CheckCircle2 className="h-4 w-4" />
        {alreadyHired ? "Hired" : "Hire this tradesperson"}
      </button>

      <HireConfirmModal
        open={open}
        targetName={displayName}
        onConfirm={submitHire}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
