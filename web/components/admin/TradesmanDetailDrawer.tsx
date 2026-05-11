// web/components/admin/TradesmanDetailDrawer.tsx
//
// Right-side slide-out drawer rendered when an admin clicks "View" on
// a row in the leaderboard. Shows the trade's verified-evidence panel
// (Overview), uploaded supporting docs with admin "Mark verified"
// controls (Docs), portfolio photos (Photos), full trades+areas list
// (Trades & areas), and a short activity log (Activity).
//
// Data sources:
//   - Overview/photos/trades/areas come from the leaderboard `Item`
//     prop the parent already has.
//   - Docs come from a fresh GET /api/admin/tradesmen/:uid/docs call
//     when the Docs tab is opened (deferred so we don't fetch on
//     every row click).
//   - "View doc" opens the authed proxy endpoint
//     /api/admin/tradesmen/:uid/docs/:idx in a new tab.
//   - "Mark verified" PATCHes /api/admin/tradesmen/:uid/docs/:idx.
//
// Mock that pinned the design lives at /tmp/admin-leaderboard-mock.html
// for cross-reference.

import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";
import { X, FileText, Check, AlertCircle } from "lucide-react";
import TradesmanManageTab from "@/components/admin/TradesmanManageTab";

export type LeaderboardItem = {
  userId: string;
  company: string;
  status: string;
  score: number;
  companyNumber: string | null;
  chStatus: string | null;
  webVerified: boolean;
  website: string | null;
  trades: string;
  areas: string;
  photos: number;
  docs: number;
  likes: number;
  wins: number;
  hires?: {
    total: number;
    accepted: number;
    declined: number;
    pending: number;
  };
  createdAt: string;
  updatedAt: string;
  plan?: string | null;
  warrantyMonths?: number;
};

type DocEntry = {
  type: string;
  label: string;
  customType: string | null;
  fileName: string | null;
  fileKey: string | null;
  fileUrl: string | null;
  verified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
};

type Tab = "overview" | "docs" | "photos" | "trades" | "activity" | "manage";

type Props = {
  item: LeaderboardItem | null;
  onClose: () => void;
  // Called after any drawer-driven mutation that should trigger a
  // leaderboard refresh (status / plan / spotlight / unlocks).
  onRefresh?: () => void;
};

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, { cls: string; dot: string }> = {
    active: {
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    },
    draft: {
      cls: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
    },
    inactive: {
      cls: "bg-rose-50 text-rose-700 border-rose-200",
      dot: "bg-rose-500",
    },
  };
  const m = map[s] || map.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${m.cls} border-[1.5px] px-2.5 py-0.5 text-[11px] font-extrabold`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {s}
    </span>
  );
}

function PlanBadge({ plan }: { plan?: string | null }) {
  if (!plan) return null;
  const cls =
    plan === "free"
      ? "bg-white text-slate-600 border-slate-200"
      : "bg-indigo-50 text-indigo-700 border-indigo-200";
  return (
    <span
      className={`inline-flex items-center rounded-full ${cls} border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em]`}
    >
      {plan}
    </span>
  );
}

export default function TradesmanDetailDrawer({
  item,
  onClose,
  onRefresh,
}: Props) {
  const api = useApi();
  const [tab, setTab] = useState<Tab>("overview");
  const [docs, setDocs] = useState<DocEntry[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsErr, setDocsErr] = useState<string | null>(null);
  const [verifyingIdx, setVerifyingIdx] = useState<number | null>(null);
  const [openingDocIdx, setOpeningDocIdx] = useState<number | null>(null);

  const open = !!item;
  const uid = item?.userId;

  // Reset state every time a new tradesman opens
  useEffect(() => {
    if (open) {
      setTab("overview");
      setDocs(null);
      setDocsErr(null);
    }
  }, [open, uid]);

  // Lazy-load docs when the Docs tab is opened
  useEffect(() => {
    if (!open || !uid || tab !== "docs" || docs !== null) return;
    let cancelled = false;
    setDocsLoading(true);
    setDocsErr(null);
    (async () => {
      try {
        const { data } = await api.get<{ ok: boolean; docs: DocEntry[] }>(
          `/api/admin/tradesmen/${uid}/docs`,
        );
        if (cancelled) return;
        setDocs(data?.docs || []);
      } catch (e) {
        if (cancelled) return;
        const msg =
          (e as { message?: string })?.message || "Failed to load docs";
        setDocsErr(msg);
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, uid, tab, docs, api]);

  // Escape closes the drawer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function openDoc(idx: number) {
    if (!uid) return;
    setOpeningDocIdx(idx);
    // Open a tab synchronously inside the click handler so Safari /
    // Firefox don't treat it as a popup blocked navigation. We'll
    // redirect that tab to the resolved url once we have it.
    const win = window.open("", "_blank");
    try {
      const { data } = await api.get<{ ok: boolean; url: string }>(
        `/api/admin/tradesmen/${uid}/docs/${idx}`,
      );
      if (data?.ok && data.url) {
        if (win) win.location.href = data.url;
        else window.open(data.url, "_blank");
      } else {
        if (win) win.close();
        setDocsErr("Failed to resolve document URL");
      }
    } catch {
      if (win) win.close();
      setDocsErr("Failed to open document");
    } finally {
      setOpeningDocIdx(null);
    }
  }

  async function toggleVerified(idx: number, next: boolean) {
    if (!uid) return;
    setVerifyingIdx(idx);
    try {
      const { data } = await api.patch<{ ok: boolean; doc: DocEntry }>(
        `/api/admin/tradesmen/${uid}/docs/${idx}`,
        { verified: next },
      );
      if (data?.ok && docs) {
        const copy = docs.slice();
        copy[idx] = data.doc;
        setDocs(copy);
      }
    } catch {
      // best-effort; surface to the user via inline error
      setDocsErr("Failed to update doc verification");
    } finally {
      setVerifyingIdx(null);
    }
  }

  if (!open || !item) return null;

  const verifiedDocsCount = docs ? docs.filter((d) => d.verified).length : 0;
  const docCount = item.docs;

  return (
    <>
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/40 transition-opacity"
      />
      {/* Drawer panel */}
      <aside
        className="fixed top-0 right-0 z-50 h-full w-full md:w-[640px] bg-white shadow-2xl border-l border-amber-100 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Tradesman detail"
        data-testid="tradesman-detail-drawer"
      >
        <div className="px-6 py-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-amber-100 mb-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge s={item.status} />
                <PlanBadge plan={item.plan} />
              </div>
              <h2 className="text-xl font-black text-slate-900 leading-tight truncate">
                {item.company}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {item.companyNumber
                  ? `CH ${item.companyNumber}`
                  : "no CH number"}
              </p>
            </div>
            <div className="flex items-start gap-3 shrink-0">
              <div className="text-right">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-700">
                  VMB score
                </div>
                <div className="text-3xl font-black text-slate-900 leading-none">
                  {item.score.toFixed(1)}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-5 border-b border-slate-200 mb-4 text-sm font-extrabold overflow-x-auto">
            {(
              [
                ["overview", "Overview"],
                ["docs", `Docs (${docCount})`],
                ["photos", `Photos (${item.photos})`],
                ["trades", "Trades & areas"],
                ["activity", "Activity"],
                ["manage", "Manage"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`py-2 border-b-2 transition-colors whitespace-nowrap ${
                  tab === key
                    ? "border-indigo-500 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
                data-testid={`drawer-tab-${key}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Panels */}
          {tab === "overview" && (
            <OverviewTab
              item={item}
              docs={docs}
              verifiedDocsCount={verifiedDocsCount}
            />
          )}
          {tab === "docs" && (
            <DocsTab
              docs={docs}
              loading={docsLoading}
              err={docsErr}
              verifyingIdx={verifyingIdx}
              openingDocIdx={openingDocIdx}
              onToggle={toggleVerified}
              onOpenDoc={openDoc}
            />
          )}
          {tab === "photos" && <PhotosTab photoCount={item.photos} />}
          {tab === "trades" && <TradesTab item={item} />}
          {tab === "activity" && <ActivityTab item={item} />}
          {tab === "manage" && (
            <TradesmanManageTab
              uid={item.userId}
              currentStatus={item.status}
              currentPlan={item.plan}
              onRefresh={() => onRefresh?.()}
            />
          )}
        </div>
      </aside>
    </>
  );
}

/* ============= Tabs ============= */

function OverviewTab({
  item,
  docs,
  verifiedDocsCount,
}: {
  item: LeaderboardItem;
  docs: DocEntry[] | null;
  verifiedDocsCount: number;
}) {
  const hires = item.hires?.total ?? 0;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Hires" value={hires} />
        <StatCard label="Wins" value={item.wins} />
        <StatCard label="Likes" value={item.likes} />
        <StatCard
          label="Warranty"
          value={
            <>
              {item.warrantyMonths ?? 0}
              <span className="text-xs ml-1 font-bold text-slate-500">
                months
              </span>
            </>
          }
        />
      </div>
      <div className="rounded-xl bg-white border border-amber-100 p-4 mb-3">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-2">
          Verification
        </div>
        <ul className="space-y-1.5 text-sm">
          <CheckRow
            on={!!item.companyNumber}
            label="Companies House verified"
          />
          <CheckRow
            on={!!item.webVerified}
            label={`Website confirmed${
              item.website ? ` (${item.website})` : ""
            }`}
          />
          <CheckRow
            on={item.docs >= 2}
            label="Insurance + cert uploaded"
          />
          <CheckRow
            on={docs !== null && verifiedDocsCount >= 2}
            label={`Docs admin-reviewed (${verifiedDocsCount}/${item.docs})`}
          />
        </ul>
      </div>
      <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-xs text-slate-600">
        <span className="font-extrabold text-slate-900">Owner uid:</span>{" "}
        <code className="bg-white px-1.5 py-0.5 rounded">{item.userId}</code>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-700">
        {label}
      </div>
      <div className="text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function CheckRow({ on, label }: { on: boolean; label: string }) {
  return (
    <li
      className={`flex items-center gap-2 ${
        on ? "text-slate-900" : "text-slate-400"
      }`}
    >
      <span>{on ? "✓" : "·"}</span> {label}
    </li>
  );
}

function DocsTab({
  docs,
  loading,
  err,
  verifyingIdx,
  openingDocIdx,
  onToggle,
  onOpenDoc,
}: {
  docs: DocEntry[] | null;
  loading: boolean;
  err: string | null;
  verifyingIdx: number | null;
  openingDocIdx: number | null;
  onToggle: (idx: number, next: boolean) => void;
  onOpenDoc: (idx: number) => void;
}) {
  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-500">Loading docs…</div>;
  }
  if (err) {
    return (
      <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>{err}</span>
      </div>
    );
  }
  if (!docs || docs.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-500">
        <div className="text-4xl mb-2">📄</div>
        No documents uploaded yet.
      </div>
    );
  }
  return (
    <div data-testid="drawer-docs-list">
      {docs.map((d, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-amber-100 bg-white p-4 mb-3"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <h4 className="font-extrabold text-slate-900 text-sm capitalize">
                  {d.type.replace(/_/g, " ")}
                </h4>
                {d.verified ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                    <Check className="h-3 w-3" /> verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                    pending review
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 truncate">
                {d.label || (
                  <em className="text-slate-400">no label</em>
                )}
              </p>
              {d.fileName && (
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {d.fileName}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => onOpenDoc(idx)}
              disabled={openingDocIdx === idx}
              className="flex-1 inline-flex items-center justify-center py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-extrabold text-xs disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid={`drawer-doc-view-${idx}`}
            >
              {openingDocIdx === idx ? "Opening…" : "View"}
            </button>
            <button
              type="button"
              onClick={() => onToggle(idx, !d.verified)}
              disabled={verifyingIdx === idx}
              className={`flex-1 py-2 rounded-lg border font-extrabold text-xs ${
                d.verified
                  ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              data-testid={`drawer-doc-toggle-verified-${idx}`}
            >
              {verifyingIdx === idx
                ? "…"
                : d.verified
                  ? "Unverify"
                  : "Mark verified"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PhotosTab({ photoCount }: { photoCount: number }) {
  // Photo URLs aren't in the leaderboard payload yet - placeholder grid
  // so the visual rhythm stays consistent. A follow-up commit will pipe
  // the actual gallery through.
  if (photoCount === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-500">
        <div className="text-4xl mb-2">📷</div>
        No photos uploaded yet.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3" data-testid="drawer-photos">
      {Array.from({ length: Math.min(photoCount, 9) }).map((_, k) => (
        <div
          key={k}
          className="aspect-square rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 border border-amber-200 flex items-center justify-center text-amber-700 font-bold"
        >
          {k + 1}
        </div>
      ))}
      {photoCount > 9 && (
        <div className="col-span-3 text-xs text-slate-500 text-center mt-1">
          +{photoCount - 9} more
        </div>
      )}
    </div>
  );
}

function TradesTab({ item }: { item: LeaderboardItem }) {
  const trades = (item.trades || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const areas = (item.areas || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div data-testid="drawer-trades-areas">
      <div className="mb-4">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-2">
          Trades ({trades.length})
        </div>
        {trades.length === 0 ? (
          <p className="text-sm text-slate-500">No trades listed.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {trades.map((t) => (
              <span
                key={t}
                className="text-xs font-bold rounded-full bg-slate-100 text-slate-700 px-2.5 py-1"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-2">
          Service areas ({areas.length})
        </div>
        {areas.length === 0 ? (
          <p className="text-sm text-slate-500">No areas listed.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {areas.map((a) => (
              <span
                key={a}
                className="text-xs font-bold rounded-full bg-slate-100 text-slate-700 px-2.5 py-1"
              >
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityTab({ item }: { item: LeaderboardItem }) {
  // Minimal log derived from row metadata. Full activity stream comes
  // later (audit log table not exposed yet).
  return (
    <ol className="space-y-3 text-sm" data-testid="drawer-activity">
      <li className="flex gap-3">
        <span className="w-2 h-2 rounded-full bg-emerald-500 mt-2 shrink-0" />
        <div>
          <div className="font-extrabold">Profile last updated</div>
          <div className="text-xs text-slate-500">{item.updatedAt}</div>
        </div>
      </li>
      <li className="flex gap-3">
        <span className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0" />
        <div>
          <div className="font-extrabold">Profile created</div>
          <div className="text-xs text-slate-500">{item.createdAt}</div>
        </div>
      </li>
    </ol>
  );
}
