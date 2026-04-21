import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { useApi } from "@/utils/api";

type FeedbackItem = {
  id: number;
  user_id: string | null;
  user_type: string | null;
  features_used: string | null;
  rating: number;
  ease_of_use: number | null;
  positives: string | null;
  improvements: string | null;
  recommend: string | null;
  created_at: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

const USER_TYPE_LABELS: Record<string, string> = {
  posted_job: "Posted a job",
  recommended: "Recommended someone",
  browsing: "Browsing",
  tradesperson: "Tradesperson",
};

const EMOJI_MAP: Record<number, string> = {
  1: "\uD83D\uDE1E",
  2: "\uD83D\uDE15",
  3: "\uD83D\uDE10",
  4: "\uD83D\uDE0A",
  5: "\uD83E\uDD29",
};

const REC_COLORS: Record<string, string> = {
  yes: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maybe: "bg-amber-50 text-amber-700 border-amber-200",
  no: "bg-red-50 text-red-700 border-red-200",
};

export default function AdminFeedback() {
  return (
    <AuthedOnly>
      <AdminFeedbackInner />
    </AuthedOnly>
  );
}

function AdminFeedbackInner() {
  const api = useApi();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeedback = useCallback(async () => {
    try {
      const { data } = await api.get("/api/admin/feedback");
      setItems(data?.items || []);
    } catch {}
    setLoading(false);
  }, [api]);

  useEffect(() => { fetchFeedback(); }, [fetchFeedback]);

  const avgRating = items.length > 0
    ? (items.reduce((s, i) => s + i.rating, 0) / items.length).toFixed(1)
    : "-";

  const easeItems = items.filter((i) => i.ease_of_use);
  const avgEase = easeItems.length > 0
    ? (easeItems.reduce((s, i) => s + (i.ease_of_use || 0), 0) / easeItems.length).toFixed(1)
    : "-";

  const recCounts = { yes: 0, maybe: 0, no: 0 };
  items.forEach((i) => { if (i.recommend && i.recommend in recCounts) recCounts[i.recommend as keyof typeof recCounts]++; });

  return (
    <>
      <Head>
        <title>Feedback - Admin - VetMyBuilder</title>
      </Head>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-black text-zinc-900">User Feedback</h1>
          <AdminRefreshButton onRefresh={fetchFeedback} />
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <div className="text-3xl font-black text-zinc-900">{items.length}</div>
            <div className="text-xs text-zinc-500 mt-1">Total responses</div>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <div className="text-3xl font-black text-zinc-900">{avgRating}</div>
            <div className="text-xs text-zinc-500 mt-1">Avg experience</div>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <div className="text-3xl font-black text-zinc-900">{avgEase}</div>
            <div className="text-xs text-zinc-500 mt-1">Avg ease of use</div>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <div className="text-3xl font-black text-emerald-600">{recCounts.yes}</div>
            <div className="text-xs text-zinc-500 mt-1">Would recommend</div>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <div className="text-3xl font-black text-red-500">{recCounts.no}</div>
            <div className="text-xs text-zinc-500 mt-1">Would not</div>
          </div>
        </div>

        {loading ? (
          <p className="text-zinc-500 text-sm">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-zinc-500 text-sm">No feedback yet.</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl border border-zinc-200 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{EMOJI_MAP[item.rating] || ""}</span>
                    <div>
                      <div className="font-bold text-zinc-900">
                        {item.firstName && item.lastName
                          ? `${item.firstName} ${item.lastName}`
                          : item.email || "Anonymous"}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {item.user_type && <span className="ml-2 text-zinc-500">{USER_TYPE_LABELS[item.user_type] || item.user_type}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.ease_of_use && (
                      <span className="px-2 py-1 rounded-full text-[10px] font-semibold border border-zinc-200 text-zinc-600">
                        Ease: {item.ease_of_use}/5
                      </span>
                    )}
                    {item.recommend && (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${REC_COLORS[item.recommend] || ""}`}>
                        {item.recommend === "yes" ? "Would recommend" : item.recommend === "maybe" ? "Maybe" : "Would not"}
                      </span>
                    )}
                  </div>
                </div>

                {item.features_used && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {item.features_used.split(",").map((f) => (
                      <span key={f} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-600">{f}</span>
                    ))}
                  </div>
                )}

                {item.positives && (
                  <div className="mb-2">
                    <span className="text-xs font-semibold text-emerald-600">What's working well:</span>
                    <p className="text-sm text-zinc-700 mt-0.5">{item.positives}</p>
                  </div>
                )}

                {item.improvements && (
                  <div>
                    <span className="text-xs font-semibold text-amber-600">One thing to change:</span>
                    <p className="text-sm text-zinc-700 mt-0.5">{item.improvements}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
