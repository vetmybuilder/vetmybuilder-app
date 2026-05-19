// web/pages/admin/refunds.tsx
// Admin tool for issuing Stripe refunds by payment_intent or charge ID.
// No automatic DB state changes happen on success - admin handles
// downstream (re-locking unlocks, sub state, etc.) manually.

import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { useApi } from "@/utils/api";

type RefundRow = {
  id: number;
  stripe_refund_id: string | null;
  payment_intent_id: string | null;
  charge_id: string | null;
  amount_pence: number | null;
  reason: string;
  admin_uid: string;
  status: "success" | "error";
  error_text: string | null;
  created_at: string;
};

function formatAmount(pence: number | null): string {
  if (pence == null) return "full";
  return `£${(pence / 100).toFixed(2)}`;
}

export default function AdminRefunds() {
  return (
    <AuthedOnly>
      <Inner />
    </AuthedOnly>
  );
}

function Inner() {
  const api = useApi();
  const [items, setItems] = useState<RefundRow[]>([]);
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [chargeId, setChargeId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const fetchList = useCallback(async () => {
    try {
      const { data } = await api.get("/api/admin/refunds");
      setItems(data?.items || []);
    } catch {}
  }, [api]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFlash(null);
    const piTrim = paymentIntentId.trim();
    const chTrim = chargeId.trim();
    if (!piTrim && !chTrim) {
      setFlash({ kind: "err", text: "Enter a payment_intent or charge ID." });
      return;
    }
    if (reason.trim().length < 5) {
      setFlash({ kind: "err", text: "Reason is required (min 5 characters)." });
      return;
    }
    setSubmitting(true);
    try {
      const amt = Number(amountStr);
      const amountPence =
        amountStr && Number.isFinite(amt) && amt > 0
          ? Math.round(amt * 100)
          : null;
      const { data } = await api.post("/api/admin/refunds", {
        paymentIntentId: piTrim || undefined,
        chargeId: chTrim || undefined,
        amountPence,
        reason: reason.trim(),
      });
      setFlash({ kind: "ok", text: `Refunded: ${data.refundId}` });
      setPaymentIntentId("");
      setChargeId("");
      setAmountStr("");
      setReason("");
      await fetchList();
    } catch (e: any) {
      setFlash({
        kind: "err",
        text: e?.response?.data?.error || e?.message || "Refund failed.",
      });
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Refunds - Admin - VetMyBuilder</title>
      </Head>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-black text-zinc-900">Refunds</h1>
          <AdminRefreshButton onRefresh={fetchList} />
        </div>

        <form
          onSubmit={submit}
          className="bg-white border border-zinc-200 rounded-2xl p-5 mb-8 space-y-3"
          data-testid="admin-refund-form"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-zinc-600">
                Payment Intent ID
              </span>
              <input
                value={paymentIntentId}
                onChange={(e) => setPaymentIntentId(e.target.value)}
                placeholder="pi_..."
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono"
                data-testid="admin-refund-pi"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-zinc-600">
                or Charge ID
              </span>
              <input
                value={chargeId}
                onChange={(e) => setChargeId(e.target.value)}
                placeholder="ch_..."
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono"
                data-testid="admin-refund-ch"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-600">
              Amount in pounds (leave blank for full refund)
            </span>
            <input
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="e.g. 9.99"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              data-testid="admin-refund-amount"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-600">Reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              data-testid="admin-refund-reason"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-extrabold disabled:opacity-50"
              data-testid="admin-refund-submit"
            >
              {submitting ? "Refunding..." : "Refund"}
            </button>
            {flash && (
              <div
                className={`text-sm font-semibold ${
                  flash.kind === "ok" ? "text-emerald-700" : "text-rose-700"
                }`}
                data-testid="admin-refund-flash"
              >
                {flash.text}
              </div>
            )}
          </div>
        </form>

        <h2 className="text-lg font-extrabold text-zinc-900 mb-3">
          Recent refunds
        </h2>
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Stripe ref</th>
                <th className="px-3 py-2">PI / Charge</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Admin</th>
              </tr>
            </thead>
            <tbody data-testid="admin-refund-rows">
              {items.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{r.created_at}</td>
                  <td className="px-3 py-2 font-mono text-[12px]">
                    {r.stripe_refund_id || "-"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px]">
                    {r.payment_intent_id || r.charge_id || "-"}
                  </td>
                  <td className="px-3 py-2">{formatAmount(r.amount_pence)}</td>
                  <td className="px-3 py-2">{r.reason}</td>
                  <td
                    className={`px-3 py-2 font-semibold ${
                      r.status === "error"
                        ? "text-rose-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {r.status}
                    {r.error_text && (
                      <span className="block text-[11px] text-rose-600">
                        {r.error_text}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px]">
                    {r.admin_uid}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-4 text-center text-zinc-500"
                  >
                    No refunds yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
