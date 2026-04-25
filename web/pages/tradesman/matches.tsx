import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import AuthedOnly from "@/components/AuthedOnly";
import IncomingLeadCard, {
  IncomingLead,
} from "@/components/project/IncomingLeadCard";
import SwipeActionBar from "@/components/project/SwipeActionBar";

export default function TradesmanMatches() {
  const api = useApi();
  const router = useRouter();
  const [leads, setLeads] = useState<IncomingLead[]>([]);
  const [subActive, setSubActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get("/api/tradesman/incoming-interest").then((r) => {
      if (cancelled) return;
      setLeads(r.data.leads);
      setSubActive(Boolean(r.data.subscriptionActive));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = leads[index];
  const gated = current?.source === "subscribed" && !subActive;

  async function respond(direction: "left" | "right") {
    if (!current || busy) return;
    if (gated) {
      router.push("/tradesman/billing");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/api/swipe/respond", {
        matchId: current.matchId,
        direction,
      });
      if (direction === "right" && res.data?.status === "matched") {
        router.push(`/match/${current.matchId}`);
        return;
      }
      setIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthedOnly>
      <main className="min-h-screen bg-gray-50 p-4">
        <h1 className="text-2xl font-extrabold mb-4">Incoming interest</h1>
        {!current && (
          <p className="text-gray-500 text-center mt-10">
            No one&apos;s picked you yet — stay visible by keeping your
            subscription active.
          </p>
        )}
        {current && (
          <>
            <IncomingLeadCard lead={current} />
            {gated ? (
              <div className="mt-4 p-4 rounded-xl bg-yellow-50 border border-yellow-200 text-sm text-yellow-800 text-center">
                Subscribe to respond to this lead.
                <button
                  onClick={() => router.push("/tradesman/billing")}
                  className="mt-2 block mx-auto py-2 px-4 bg-indigo-600 text-white rounded-lg font-bold"
                >
                  Go to billing
                </button>
              </div>
            ) : (
              <SwipeActionBar
                disabled={busy}
                onPass={() => respond("left")}
                onInfo={() => router.push(`/projects/${current.projectId}`)}
                onLike={() => respond("right")}
              />
            )}
          </>
        )}
      </main>
    </AuthedOnly>
  );
}
