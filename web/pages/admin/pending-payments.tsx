import { useCallback, useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { useApi } from "@/utils/api";

type PendingPayment = {
  id: number;
  userId: string;
  type: "spotlight" | "unlock_contact";
  amount: number | null;
  currency: string | null;
  provider_session_id: string | null;
  created_at: string;
  tradesman?: {
    company: string;
    email: string;
    phone: string | null;
    plan: string | null;
  };
};

export default function PendingPaymentsPage() {
  return (
    <AuthedOnly>
      <AdminGate />
    </AuthedOnly>
  );
}

/* ======================== ADMIN GATE ======================== */
function AdminGate() {
  const api = useApi();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/admin/tradesmen?limit=1");
        setAllowed(true);
      } catch {
        setAllowed(false);
      }
    })();
  }, [api]);

  if (allowed === null) {
    return <div className="p-5 text-slate-600 text-sm">Checking admin…</div>;
  }
  if (!allowed) {
    return (
      <div className="p-5 text-slate-700 text-sm">
        Not authorised — admin only.
      </div>
    );
  }

  return <AdminPendingPayments />;
}

/* ======================== MAIN TABLE ======================== */

function AdminPendingPayments() {
  const api = useApi();
  const [items, setItems] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/api/admin/pending-payments");
      setItems(data?.items || []);
    } catch (e) {
      console.error("load pending payments error", e);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id: number, type: PendingPayment["type"]) {
    try {
      if (type === "spotlight") {
        await api.post("/api/admin/spotlight/approve", { paymentId: id });
      } else {
        await api.post("/api/admin/unlock-contact/approve", { paymentId: id });
      }
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || "Unable to approve");
    }
  }

  async function reject(id: number, type: PendingPayment["type"]) {
    try {
      if (type === "spotlight") {
        await api.post("/api/admin/spotlight/reject", { paymentId: id });
      } else {
        await api.post("/api/admin/unlock-contact/reject", { paymentId: id });
      }
      await load();
    } catch (e) {
      alert("Unable to reject");
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          Pending One-Off Payments
        </h1>
        <AdminRefreshButton onRefresh={load} />
      </div>

      {loading && (
        <div className="mb-3 text-slate-600 text-sm">Loading pending…</div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-slate-500 text-sm">No pending payments.</div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border border-slate-200 rounded-lg">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-semibold">
                  Tradesman
                </th>
                <th className="px-3 py-2 text-left text-sm font-semibold">
                  Type
                </th>
                <th className="px-3 py-2 text-left text-sm font-semibold">
                  Amount
                </th>
                <th className="px-3 py-2 text-left text-sm font-semibold">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-sm font-semibold">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-sm">
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-3">
                    <div className="font-semibold">
                      {p.tradesman?.company || "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.tradesman?.email}
                    </div>
                    {p.tradesman?.phone && (
                      <div className="text-xs text-slate-500">
                        {p.tradesman.phone}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    {p.type === "spotlight" ? (
                      <span className="rounded bg-purple-600/10 text-purple-700 px-2 py-[2px] text-xs font-semibold">
                        Spotlight
                      </span>
                    ) : (
                      <span className="rounded bg-cyan-600/10 text-cyan-700 px-2 py-[2px] text-xs font-semibold">
                        Unlock Contact
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    £{Number(p.amount || 0).toFixed(2)}
                  </td>

                  <td className="px-3 py-3 text-slate-600">
                    {new Date(p.created_at).toLocaleString()}
                  </td>

                  <td className="px-3 py-3 flex gap-2">
                    <button
                      onClick={() => approve(p.id, p.type)}
                      className="rounded bg-emerald-600 text-white px-3 py-1 text-xs font-semibold hover:bg-emerald-700"
                    >
                      Approve
                    </button>

                    <button
                      onClick={() => reject(p.id, p.type)}
                      className="rounded bg-rose-600 text-white px-3 py-1 text-xs font-semibold hover:bg-rose-700"
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
