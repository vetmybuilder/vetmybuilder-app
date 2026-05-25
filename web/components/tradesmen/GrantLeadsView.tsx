// web/components/tradesmen/GrantLeadsView.tsx
//
// Renders the "Grants" tab on /tradesman/leads. Self-contained: owns
// its own fetch against GET /api/tradesman/grant-leads, exposes both
// a mobile list (vertical cards) and a desktop table. Mounted by
// pages/tradesman/leads.tsx behind a `?type=grants` query param.
//
// Distinct from the existing Incoming-interest deck: grant leads are
// already routed to the assigned specialist (no swipe / pass needed)
// so the UI is read + tap-to-call rather than card-swipe.

import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";
import BottomSheet from "@/components/BottomSheet";

type QualifiedLevel = "full" | "partial" | "none";
type LeadStatus =
  | "new"
  | "emailed"
  | "contacted"
  | "surveyed"
  | "quoted"
  | "won"
  | "lost"
  | "dead";

export type GrantLead = {
  id: number;
  reference_code: string;
  created_at: string;
  property_type: string;
  tenure: string;
  heating_fuel: string;
  epc_rating: string;
  benefits: string[] | string;
  postcode: string;
  name: string;
  email: string;
  phone: string;
  qualified: QualifiedLevel;
  assigned_tradesperson_uid: string | null;
  status: LeadStatus;
  source: string | null;
  last_status_at: string | null;
  viewed_at: string | null;
};

type ApiResponse = {
  ok: true;
  total: number;
  rows: GrantLead[];
  statusCounts: Record<string, number>;
};

const STATUS_LABEL: Record<LeadStatus, { l: string; cls: string }> = {
  new: { l: "New", cls: "bg-emerald-600 text-white" },
  emailed: { l: "Emailed", cls: "bg-emerald-100 text-emerald-800" },
  contacted: { l: "Contacted", cls: "bg-emerald-100 text-emerald-800" },
  surveyed: { l: "Surveyed", cls: "bg-teal-100 text-teal-800" },
  quoted: { l: "Quoted", cls: "bg-amber-100 text-amber-800" },
  won: { l: "Won", cls: "bg-lime-200 text-lime-900" },
  lost: { l: "Lost", cls: "bg-zinc-200 text-zinc-700" },
  dead: { l: "Dead", cls: "bg-zinc-200 text-zinc-700" },
};

const QUALIFIED_LABEL: Record<
  QualifiedLevel,
  { l: string; bg: string; fg: string }
> = {
  full: { l: "Fully qualified", bg: "bg-emerald-100", fg: "text-emerald-800" },
  partial: { l: "Partial", bg: "bg-amber-100", fg: "text-amber-800" },
  none: { l: "Not eligible", bg: "bg-zinc-200", fg: "text-zinc-700" },
};

function ageLabel(iso: string): string {
  const created = new Date(iso).getTime();
  if (!Number.isFinite(created)) return "";
  const diff = Date.now() - created;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} wk${weeks === 1 ? "" : "s"} ago`;
}

function QualifiedPill({ level }: { level: QualifiedLevel }) {
  const m = QUALIFIED_LABEL[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${m.bg} ${m.fg}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {m.l}
    </span>
  );
}

function StatusPill({ status }: { status: LeadStatus }) {
  const m = STATUS_LABEL[status] || STATUS_LABEL.new;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${m.cls}`}
    >
      {m.l}
    </span>
  );
}

function useGrantLeads() {
  const api = useApi();
  const [rows, setRows] = useState<GrantLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ApiResponse>("/api/tradesman/grant-leads")
      .then(({ data }) => {
        if (cancelled) return;
        setRows(data?.rows || []);
        setTotal(data?.total || 0);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || "failed_to_load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Optimistic local mark-as-viewed: drops the NEW pill instantly and
  // fires the server POST in the background. Server endpoint is
  // idempotent so re-taps are harmless.
  function markViewed(id: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id && r.viewed_at == null
          ? { ...r, viewed_at: new Date().toISOString() }
          : r,
      ),
    );
    api
      .post(`/api/tradesman/grant-leads/${id}/view`, {})
      .catch(() => {
        /* swallow - the next page load will reconcile */
      });
  }

  return { rows, total, loading, error, markViewed };
}

/* ============================================================
   MOBILE - vertical list of grant cards
   ============================================================ */

export function GrantLeadsViewMobile() {
  const { rows, loading, error, markViewed } = useGrantLeads();
  // Tap-to-expand: opens a bottom sheet with the full lead detail
  // (property type, tenure, benefits, full contact) so the trade can
  // size up the lead before they call. Tap-to-call still works
  // straight from the sheet's primary action.
  //
  // Two-state pattern so the slide-up animation stays smooth:
  //   `sheetLead` -> mounted content (kept around through the close
  //     animation so the children don't unmount mid-slide)
  //   `sheetOpen` -> drives the BottomSheet `open` prop. Flipped one
  //     animation frame AFTER `sheetLead` is set so React has already
  //     painted the heavy detail content before the slide-up starts.
  // Without this split, the children render + the transform-up start
  // on the same frame and the slide visibly jutters - same component
  // as ProjectActionsSheet (which always has children mounted) but
  // here the lead data is per-row, so we have to mount lazily.
  const [sheetLead, setSheetLead] = useState<GrantLead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function openLead(l: GrantLead) {
    setSheetLead(l);
    // Mark seen as soon as they tap View - optimistic, idempotent.
    if (l.viewed_at == null) markViewed(l.id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setSheetOpen(true));
    });
  }
  function closeSheet() {
    setSheetOpen(false);
    // Match BottomSheet's 280ms unmount timer; clear after it's done
    // so a quick re-open uses fresh state.
    setTimeout(() => setSheetLead(null), 300);
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
        {loading && (
          <div className="text-center py-12 text-[13px] font-semibold text-emerald-700 animate-pulse">
            Loading grant leads...
          </div>
        )}
        {error && !loading && (
          <div className="mx-3 my-4 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-[12.5px] text-rose-800">
            Couldn&apos;t load grant leads: {error}
          </div>
        )}
        {!loading && !error && rows.length === 0 && <EmptyState />}
        {!loading && !error && rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((l) => (
              <li key={l.id} data-testid={`grant-lead-card-${l.id}`}>
                <button
                  type="button"
                  onClick={() => openLead(l)}
                  className="w-full rounded-2xl bg-white border border-emerald-100 p-3 shadow-sm text-left active:scale-[0.99] transition-transform"
                  data-testid={`grant-lead-open-${l.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black">
                      {(l.name || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-[14px] text-slate-900 truncate">
                          {l.name}
                        </span>
                        <QualifiedPill level={l.qualified} />
                      </div>
                      <div className="text-[12.5px] text-slate-600 mt-0.5">
                        {l.postcode} · {l.heating_fuel} · EPC {l.epc_rating}
                      </div>
                      <div className="text-[11.5px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                        <span>{ageLabel(l.created_at)}</span>
                        <span aria-hidden>·</span>
                        <span className="font-mono">{l.reference_code}</span>
                        {/* Drop the "New" pill once the trade has
                            viewed the lead. Other statuses keep showing
                            since they represent real funnel progress. */}
                        {!(l.status === "new" && l.viewed_at) && (
                          <StatusPill status={l.status} />
                        )}
                      </div>
                    </div>
                    <span
                      className="shrink-0 self-center inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white px-3 py-1.5 text-[12px] font-extrabold"
                      aria-hidden
                    >
                      View
                      <span>→</span>
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        ariaLabel="Grant lead details"
        sheetTestId="grant-lead-detail-sheet"
      >
        {sheetLead && <GrantLeadDetailSheetContent lead={sheetLead} />}
      </BottomSheet>
    </>
  );
}

function GrantLeadDetailSheetContent({ lead }: { lead: GrantLead }) {
  const benefitsArr = Array.isArray(lead.benefits)
    ? lead.benefits
    : (() => {
        try {
          const parsed = JSON.parse(String(lead.benefits || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
  const benefitsLabel =
    benefitsArr.length === 0 || (benefitsArr.length === 1 && benefitsArr[0] === "none")
      ? "None declared"
      : benefitsArr.join(", ");
  const telHref = `tel:${lead.phone.replace(/\s+/g, "")}`;
  const waHref = `https://wa.me/${lead.phone.replace(/\D/g, "")}`;

  return (
    <>
      <div className="px-5 pb-1">
        <div className="flex items-center gap-2 text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">
          Grant lead
          <span aria-hidden>·</span>
          <span className="font-mono normal-case tracking-normal text-slate-400">
            {lead.reference_code}
          </span>
        </div>
        <h3
          className="mt-1 text-[20px] font-black tracking-tight text-slate-900 leading-tight"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          {lead.name}
        </h3>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <QualifiedPill level={lead.qualified} />
          <StatusPill status={lead.status} />
          <span className="text-[11.5px] text-slate-400">
            {ageLabel(lead.created_at)}
          </span>
        </div>
      </div>

      <div className="px-5 pt-4 grid grid-cols-2 gap-2">
        <DetailCell label="Postcode" value={lead.postcode} />
        <DetailCell label="Property" value={lead.property_type} capitalize />
        <DetailCell label="Tenure" value={lead.tenure} capitalize />
        <DetailCell label="Heating" value={lead.heating_fuel} capitalize />
        <DetailCell label="EPC rating" value={lead.epc_rating} />
        <DetailCell label="Phone" value={lead.phone} mono />
        <div className="col-span-2">
          <DetailCell label="Email" value={lead.email} mono />
        </div>
        <div className="col-span-2">
          <DetailCell label="Benefits on file" value={benefitsLabel} />
        </div>
      </div>

      <div className="px-5 pt-4 pb-5 grid grid-cols-2 gap-2"
           style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <a
          href={telHref}
          className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 text-white py-3 font-extrabold text-[14px]"
          data-testid="grant-lead-sheet-call"
        >
          Call {firstNameOf(lead.name)}
        </a>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 py-3 font-extrabold text-[14px]"
          data-testid="grant-lead-sheet-whatsapp"
        >
          WhatsApp
        </a>
      </div>
    </>
  );
}

function DetailCell({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={`text-[13px] text-slate-900 mt-0.5 ${
          mono ? "font-mono" : "font-bold"
        } ${capitalize ? "capitalize" : ""} break-words`}
      >
        {value || "-"}
      </div>
    </div>
  );
}

function firstNameOf(fullName: string): string {
  return String(fullName || "").trim().split(/\s+/)[0] || "there";
}

/* ============================================================
   DESKTOP - earnings-style table
   ============================================================ */

export function GrantLeadsViewDesktop() {
  const { rows, total, loading, error } = useGrantLeads();
  return (
    <div className="mx-auto max-w-6xl px-6 pb-12 relative z-10">
      <div className="text-center pt-6 pb-4">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-0.5">
          Government grant enquiries
        </div>
        <h1
          className="text-[26px] font-black tracking-tight text-slate-900 leading-tight"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Grant{" "}
          <span
            className="text-emerald-600"
            style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
          >
            leads
          </span>
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Homeowners who could get their job paid for by a government grant.
        </p>
      </div>

      {loading && (
        <div className="bg-white border border-emerald-100 rounded-2xl shadow-sm flex items-center justify-center py-16">
          <span className="text-[14px] font-semibold text-emerald-600 animate-pulse">
            Loading...
          </span>
        </div>
      )}
      {error && !loading && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-5 text-rose-800 text-[13px]">
          Couldn&apos;t load grant leads: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="bg-white border border-emerald-100 rounded-3xl shadow-sm px-6 py-12 text-center">
          <EmptyState />
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <div className="text-[12px] font-bold text-slate-500 mb-3 px-1">
            {total} grant {total === 1 ? "lead" : "leads"} assigned to you
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[640px]">
                <thead className="bg-emerald-50/60 text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                  <tr>
                    <th className="px-5 py-2.5">Lead</th>
                    <th className="px-3 py-2.5">Area</th>
                    <th className="px-3 py-2.5">Qualified</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Age</th>
                    <th className="px-5 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr
                      key={l.id}
                      className="border-t border-emerald-50 hover:bg-emerald-50/30"
                      data-testid={`grant-lead-row-${l.id}`}
                    >
                      <td className="px-5 py-3">
                        <div className="font-extrabold text-[13.5px] text-slate-900">
                          {l.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {l.reference_code}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-700">
                        {l.postcode}
                      </td>
                      <td className="px-3 py-3">
                        <QualifiedPill level={l.qualified} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={l.status} />
                      </td>
                      <td className="px-3 py-3 text-[12.5px] text-slate-500">
                        {ageLabel(l.created_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <a
                          href={`tel:${l.phone.replace(/\s+/g, "")}`}
                          className="inline-flex items-center rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-[12px] font-extrabold transition-colors"
                          data-testid={`grant-lead-call-${l.id}`}
                        >
                          Call
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-10 text-center">
      <div
        className="mx-auto w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-[22px]"
        style={{ fontFamily: "'Sora', sans-serif" }}
        aria-hidden
      >
        £
      </div>
      <h3
        className="mt-3 text-[16px] font-black text-slate-900"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        No grant leads yet
      </h3>
      <p className="mt-1 text-[13px] text-slate-500 max-w-sm mx-auto">
        When a homeowner who could qualify for a government grant asks
        for your kind of work, they&apos;ll appear here. We&apos;ll push-notify
        you so you can call them straight away.
      </p>
    </div>
  );
}
