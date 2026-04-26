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
  /**
   * "compact" (default) — small green pill, matches the desktop chrome.
   * "primary" — full-width indigo-gradient CTA used by the mobile profile
   * pages where Hire is the page-level primary action.
   */
  size?: "compact" | "primary";
};

export default function HireButton({
  displayName,
  recommendationId,
  tradesmanUserId,
  size = "compact",
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
  const [hireStatus, setHireStatus] = React.useState<string | null>(null);
  const [projectAccessible, setProjectAccessible] = React.useState<
    boolean | null
  >(null);

  const checkAlreadyHired = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const { data } = await api.get(`/api/projects/${projectId}/hires`);
      const items = Array.isArray(data?.items) ? data.items : [];
      // Only ACTIVE hires (pending, pending_invite, accepted) block the
      // button — terminal statuses (declined, cancelled, expired) free it
      // up so the homeowner can re-hire.
      const ACTIVE_STATUSES = new Set([
        "pending",
        "pending_invite",
        "accepted",
      ]);
      let matchedStatus: string | null = null;
      const hit = items.some((h: any) => {
        if (!ACTIVE_STATUSES.has(h?.status)) return false;
        if (recommendationId != null && h?.recommendationId === recommendationId) {
          matchedStatus = h.status;
          return true;
        }
        if (tradesmanUserId && h?.tradesmanUserId === tradesmanUserId) {
          matchedStatus = h.status;
          return true;
        }
        return false;
      });
      setAlreadyHired(hit);
      setHireStatus(matchedStatus);
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

  const isPrimary = size === "primary";
  const baseClass = isPrimary
    ? "w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-[14px] font-extrabold transition-colors"
    : "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-colors";
  const stateClass = alreadyHired
    ? hireStatus === "pending" || hireStatus === "pending_invite"
      ? "bg-amber-100 text-amber-700 cursor-default"
      : "bg-emerald-100 text-emerald-700 cursor-default"
    : isPrimary
    ? "text-white shadow-lg shadow-indigo-500/30"
    : "bg-green-600 text-white shadow-sm hover:bg-green-700";
  const inlineStyle =
    !alreadyHired && isPrimary
      ? { background: "linear-gradient(135deg, #6366f1, #4f46e5)" }
      : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={alreadyHired}
        data-testid="hire-button"
        className={`${baseClass} ${stateClass}`}
        style={inlineStyle}
      >
        <CheckCircle2 className={isPrimary ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {alreadyHired ? (hireStatus === "pending" || hireStatus === "pending_invite" ? "Hire pending" : "Hired") : "Hire"}
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
