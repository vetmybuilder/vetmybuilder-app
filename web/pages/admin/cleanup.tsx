// web/pages/admin/cleanup.tsx
//
// Admin maintenance hub. One card per cleanup operation; each card
// shows the precise count that will be affected BEFORE the admin
// commits, so there's no "click and pray" surprise.
//
// Server endpoints live in server/routes/admin/cleanup.js. Adding a
// new cleanup op means: (a) extend the server's preview to count it,
// (b) add a corresponding mutation route, (c) drop a card in here.

import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";

type Preview = {
  ok: boolean;
  notifications: {
    byDeprecatedType: Record<string, number>;
    legacyLinkPaths: number;
    olderThan: Record<string, number>; // keys are "30" / "60" / "90" / "180"
    closedProjectsForOwners: number;
  };
};

export default function AdminCleanupPage() {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyOp, setBusyOp] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [olderThanDays, setOlderThanDays] = useState<number>(90);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get<Preview>("/api/admin/cleanup/preview");
      setPreview(data);
    } catch (e: unknown) {
      const e2 = e as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setErr(
        e2?.response?.data?.error || e2?.message || "Failed to load preview",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Wait for Firebase auth to resolve before firing the preview fetch.
  // Without this gate the first request goes out before useApi() has a
  // Bearer token, the server returns 401 "Missing bearer token", and the
  // admin sees an error on first paint that disappears on the next
  // re-render. Tab-switch "fixes" it because Firebase has settled by
  // then.
  useEffect(() => {
    if (authLoading || !user) return;
    void load();
  }, [load, authLoading, user]);

  async function run(
    opKey: string,
    confirmMsg: string,
    fn: () => Promise<string>,
  ) {
    if (!window.confirm(confirmMsg)) return;
    setBusyOp(opKey);
    setSuccessMsg(null);
    setErr(null);
    try {
      const msg = await fn();
      setSuccessMsg(msg);
      // Refetch counts so the cards reflect the new state immediately.
      void load();
      window.setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: unknown) {
      const e2 = e as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setErr(e2?.response?.data?.error || e2?.message || "Operation failed");
    } finally {
      setBusyOp(null);
    }
  }

  function purgeByType(type: string) {
    void run(
      `purge-${type}`,
      `Permanently delete all notifications of type "${type}"? This cannot be undone.`,
      async () => {
        const { data } = await api.post<{ ok: boolean; deleted: number }>(
          "/api/admin/cleanup/notifications/purge-by-type",
          { type },
        );
        return `Deleted ${data.deleted} notifications (${type}).`;
      },
    );
  }

  function rewriteLinkPaths() {
    void run(
      "rewrite-linkpaths",
      "Rewrite legacy /projects/X?openChat=Y linkPaths to /chat/Y? This updates existing rows in place.",
      async () => {
        const { data } = await api.post<{ ok: boolean; updated: number }>(
          "/api/admin/cleanup/notifications/rewrite-linkpaths",
          {},
        );
        return `Rewrote ${data.updated} legacy linkPaths.`;
      },
    );
  }

  function purgeClosedProjects() {
    void run(
      "purge-closed-projects",
      "Delete notifications for projects already in status=completed (both homeowner and matched-tradesperson sides)? Forward-going closes already do this automatically; this is a one-off backfill.",
      async () => {
        const { data } = await api.post<{ ok: boolean; deleted: number }>(
          "/api/admin/cleanup/notifications/purge-closed-projects",
          {},
        );
        return `Deleted ${data.deleted} notifications for completed projects.`;
      },
    );
  }

  function purgeOlderThan() {
    if (!Number.isFinite(olderThanDays) || olderThanDays < 7) {
      setErr("Use a value of 7 or more.");
      return;
    }
    void run(
      "purge-older",
      `Permanently delete ALL notifications older than ${olderThanDays} days? This cannot be undone.`,
      async () => {
        const { data } = await api.post<{ ok: boolean; deleted: number }>(
          "/api/admin/cleanup/notifications/purge-older-than",
          { days: olderThanDays },
        );
        return `Deleted ${data.deleted} notifications older than ${olderThanDays} days.`;
      },
    );
  }

  return (
    <AuthedOnly>
      <Head>
        <title>Admin · Cleanup - VetMyBuilder</title>
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-12 relative overflow-hidden">
        <BrandWatermarkScatter />
        <main
          className="relative z-10 mx-auto max-w-4xl px-6 py-8"
          data-testid="admin-cleanup-page"
        >
          {/* Title row */}
          <div className="flex items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                Cleanup
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Maintenance operations on the notifications table. Counts
                are live - re-run after any deploy.
              </p>
            </div>
            <Link
              href="/admin"
              className="text-xs font-bold text-slate-500 hover:text-slate-900"
            >
              ← Admin home
            </Link>
          </div>

          {err && (
            <div
              className="rounded-2xl bg-rose-50 border border-rose-200 p-5 text-rose-700 mb-4"
              data-testid="cleanup-error"
            >
              {err}
            </div>
          )}
          {successMsg && (
            <div
              className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-emerald-700 mb-4"
              data-testid="cleanup-success"
            >
              {successMsg}
            </div>
          )}

          {loading && !preview ? (
            <div className="text-sm text-slate-500">Loading counts…</div>
          ) : preview ? (
            <div className="space-y-4">
              {/* ============ Deprecated types ============ */}
              {Object.entries(preview.notifications.byDeprecatedType).map(
                ([type, count]) => (
                  <Card
                    key={type}
                    title={`Delete \`${type}\` notifications`}
                    description={
                      type === "project_live_local"
                        ? "Server no longer creates this type. Safe to purge any historical rows."
                        : "Deprecated notification type. Safe to purge."
                    }
                    count={count}
                    countLabel="rows to delete"
                    actionLabel="Delete all"
                    actionTestid={`cleanup-purge-${type}`}
                    onAction={() => purgeByType(type)}
                    busy={busyOp === `purge-${type}`}
                    disabled={count === 0}
                    tone={count === 0 ? "neutral" : "danger"}
                  />
                ),
              )}

              {/* ============ Legacy linkPaths ============ */}
              <Card
                title="Rewrite legacy /projects/X?openChat=Y linkPaths"
                description="Older notification rows still link to the retired project page. Rewrite them so clicks land on the new /chat/:matchId page."
                count={preview.notifications.legacyLinkPaths}
                countLabel="rows to update"
                actionLabel="Rewrite all"
                actionTestid="cleanup-rewrite-linkpaths"
                onAction={rewriteLinkPaths}
                busy={busyOp === "rewrite-linkpaths"}
                disabled={preview.notifications.legacyLinkPaths === 0}
                tone={
                  preview.notifications.legacyLinkPaths === 0
                    ? "neutral"
                    : "primary"
                }
              />

              {/* ============ Closed-project notifications (both sides) ============ */}
              <Card
                title="Delete notifications for completed projects"
                description="Covers both the homeowner and any matched tradespeople. One-off backfill - forward-going closes strip these on both sides automatically via close.post."
                count={preview.notifications.closedProjectsForOwners}
                countLabel="rows to delete"
                actionLabel="Delete all"
                actionTestid="cleanup-purge-closed-projects"
                onAction={purgeClosedProjects}
                busy={busyOp === "purge-closed-projects"}
                disabled={preview.notifications.closedProjectsForOwners === 0}
                tone={
                  preview.notifications.closedProjectsForOwners === 0
                    ? "neutral"
                    : "danger"
                }
              />

              {/* ============ Age purge ============ */}
              <div
                className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5"
                data-testid="cleanup-purge-older-card"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-extrabold text-slate-900">
                      Delete notifications older than N days
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Trim the activity feed for everyone. Minimum 7 days so
                      a slip can't wipe recent activity.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 items-end mb-3">
                  <div>
                    <label
                      className="block text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-1"
                      htmlFor="cleanup-older-days"
                    >
                      Older than (days)
                    </label>
                    <input
                      id="cleanup-older-days"
                      type="number"
                      min={7}
                      value={olderThanDays}
                      onChange={(e) =>
                        setOlderThanDays(Number(e.target.value) || 0)
                      }
                      className="w-32 bg-amber-50/40 border border-amber-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
                      data-testid="cleanup-older-days-input"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busyOp === "purge-older" || olderThanDays < 7}
                    onClick={purgeOlderThan}
                    className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    data-testid="cleanup-purge-older"
                  >
                    {busyOp === "purge-older" ? "Deleting…" : "Delete"}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  {(["30", "60", "90", "180"] as const).map((bucket) => (
                    <div
                      key={bucket}
                      className="rounded-xl bg-amber-50/60 border border-amber-100 p-2"
                    >
                      <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-700">
                        &gt; {bucket}d
                      </div>
                      <div className="text-lg font-black text-slate-900">
                        {preview.notifications.olderThan[bucket] ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </AuthedOnly>
  );
}

/* ============= Pieces ============= */

function Card({
  title,
  description,
  count,
  countLabel,
  actionLabel,
  actionTestid,
  onAction,
  busy,
  disabled,
  tone,
}: {
  title: string;
  description: string;
  count: number;
  countLabel: string;
  actionLabel: string;
  actionTestid: string;
  onAction: () => void;
  busy: boolean;
  disabled: boolean;
  tone: "primary" | "danger" | "neutral";
}) {
  const buttonCls =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : tone === "primary"
        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
        : "bg-slate-100 text-slate-400 cursor-not-allowed";
  return (
    <div
      className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5"
      data-testid={`${actionTestid}-card`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-extrabold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-700">
            {countLabel}
          </div>
          <div className="text-2xl font-black text-slate-900 leading-none">
            {count}
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={onAction}
          data-testid={actionTestid}
          className={`rounded-xl text-xs font-extrabold px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed ${buttonCls}`}
        >
          {busy ? "Working…" : actionLabel}
        </button>
      </div>
    </div>
  );
}
