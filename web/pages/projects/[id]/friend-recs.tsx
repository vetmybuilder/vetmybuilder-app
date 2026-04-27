// web/pages/projects/[id]/friend-recs.tsx
//
// Owner-only mobile page that lists off-platform recommendations for the
// project. Each row shows the company, recommender, comment, compact
// rating pills, pending-claim badge, and a Send-nudge action.

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ChevronLeft, Sparkles } from "lucide-react";
import { useApi } from "@/utils/api";
import { CATEGORY_LABELS, CATEGORY_ORDER, hasAnyRating, deterministicSummary } from "@/utils/ratingSummary";
import type { CategoryRatings } from "@/types/builderTypes";
import AuthedOnly from "@/components/AuthedOnly";

type FriendRec = {
  id: number;
  company: string;
  comment: string | null;
  createdAt: string;
  ratings: CategoryRatings | null;
  recommender: { name: string };
  invite: {
    sent: boolean;
    sentToEmail: string | null;
    companyEmail: string | null;
    nudgeCount: number;
    lastNudgedAt: string | null;
  };
};

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function CompactStars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{ fontSize: "8.5px", letterSpacing: "0.5px" }}
          className={i <= value ? "text-amber-500" : "text-gray-300"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function RecCard({ rec, onNudge, busy }: { rec: FriendRec; onNudge: () => void; busy: boolean }) {
  const lastNudgeAge = rec.invite.lastNudgedAt
    ? Date.now() - new Date(rec.invite.lastNudgedAt).getTime()
    : Infinity;
  const onCooldown = lastNudgeAge < NUDGE_COOLDOWN_MS;
  const initial = (rec.recommender.name?.[0] || "?").toUpperCase();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3.5 mb-2">
      <div className="flex items-center gap-2.5">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-extrabold"
          style={{ background: "linear-gradient(135deg, #c4b5fd, #8b5cf6)" }}
        >
          {initial}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-extrabold text-gray-900">{rec.company}</div>
          <div className="text-[10.5px] text-gray-500 mt-0.5">
            By {rec.recommender.name} &middot;{" "}
            {new Date(rec.createdAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })}
          </div>
        </div>
        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[9.5px] font-extrabold">
          Pending claim
        </span>
      </div>
      {(() => {
        const autoLine = !rec.comment && rec.ratings ? deterministicSummary(rec.ratings) : null;
        const display = rec.comment || autoLine;
        if (!display) return null;
        return (
          <>
            <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg text-[12px] text-gray-700 leading-relaxed italic">
              &ldquo;{display}&rdquo;
            </div>
            {!rec.comment && autoLine && (
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-indigo-700">
                <Sparkles className="h-2.5 w-2.5" />
                Auto from ratings
              </div>
            )}
          </>
        );
      })()}
      {hasAnyRating(rec.ratings) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {CATEGORY_ORDER.map((key) => {
            const v = rec.ratings?.[key];
            if (typeof v !== "number") return null;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[9.5px] font-bold text-gray-700"
              >
                <span>{CATEGORY_LABELS[key]}</span>
                <CompactStars value={v} />
              </span>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex gap-1.5">
        <button
          type="button"
          disabled={busy || onCooldown || !rec.invite.companyEmail}
          onClick={onNudge}
          className="flex-1 py-2 px-3 border border-gray-200 rounded-lg text-[10.5px] font-bold text-gray-700 disabled:opacity-50"
          data-testid="btn-nudge"
        >
          {onCooldown ? "Sent - try again tomorrow" : "Send nudge"}
        </button>
      </div>
    </div>
  );
}

function FriendRecsPage() {
  const router = useRouter();
  const api = useApi();
  const projectId = String(router.query.id || "");
  const [items, setItems] = useState<FriendRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(
          `/api/projects/${projectId}/off-platform-recommendations`
        );
        if (alive) setItems(data?.items || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNudge(rec: FriendRec) {
    setBusyId(rec.id);
    try {
      await api.post(`/api/recommendations/${rec.id}/nudge`);
      const { data } = await api.get(
        `/api/projects/${projectId}/off-platform-recommendations`
      );
      setItems(data?.items || []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Couldn't send nudge";
      alert(msg);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="flex-1">
          <h1 className="text-[16px] font-extrabold text-gray-900">Friend recs</h1>
          <p className="text-[11px] text-gray-500">{items.length} pending claim</p>
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-[12px] text-gray-500 leading-relaxed mb-3">
          These builders aren&apos;t on VetMyBuilder yet. We&apos;ve invited them - we&apos;ll
          notify you when they claim.
        </p>
        {loading ? (
          <div className="text-center text-[12px] text-gray-500 py-8">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-[12px] text-gray-500 py-8">
            No friend recs yet.
          </div>
        ) : (
          items.map((rec) => (
            <RecCard
              key={rec.id}
              rec={rec}
              busy={busyId === rec.id}
              onNudge={() => handleNudge(rec)}
            />
          ))
        )}
      </div>
    </main>
  );
}

export default function FriendRecsPageWrapper() {
  return (
    <AuthedOnly>
      <FriendRecsPage />
    </AuthedOnly>
  );
}
