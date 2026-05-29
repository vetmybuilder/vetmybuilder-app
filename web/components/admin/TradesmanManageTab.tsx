// web/components/admin/TradesmanManageTab.tsx
//
// "Manage" tab inside TradesmanDetailDrawer. Holds the admin actions
// that used to live as inline buttons on the leaderboard table:
//
//   - Status         (active / draft / inactive)
//   - Subscription   (grant tier, revoke, cancel at period end, cancel now)
//   - Spotlight      (grant N days, revoke)
//   - One-off unlocks (list active, grant per project ID, revoke)
//
// Each section refetches its own slice; the parent's `onRefresh` reloads
// the leaderboard row so the badge / count / plan changes are visible
// immediately after a mutation.

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/utils/api";

type BuilderSubTier = "week_1" | "week_2" | "month_1";

const TIER_LABEL: Record<BuilderSubTier, string> = {
  week_1: "7-day - £3.99",
  week_2: "14-day - £6.99",
  month_1: "30-day - £9.99",
};

type Unlock = {
  projectId: number;
  projectName: string | null;
  status: string | null;
  approvedAt: string | null;
};

type Props = {
  uid: string;
  currentStatus: string;
  currentPlan?: string | null;
  slug?: string | null;
  profilePublic?: boolean;
  onRefresh: () => void;
};

export default function TradesmanManageTab({
  uid,
  currentStatus,
  currentPlan,
  slug,
  profilePublic,
  onRefresh,
}: Props) {
  const api = useApi();
  // `busyKey` is the specific button id that's mutating right now -
  // lets us render an inline spinner on just that control instead of
  // disabling the whole panel and giving no feedback.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Local mirrors of the parent's status / plan props so we can reflect
  // the new value optimistically the moment the mutation resolves,
  // without waiting for the leaderboard to refetch + the drawer to be
  // re-keyed. Re-sync if the parent ever pushes a fresh item in.
  const [status, setStatus] = useState(currentStatus);
  const [plan, setPlan] = useState<string | null | undefined>(currentPlan);
  const [isPublic, setIsPublic] = useState<boolean>(!!profilePublic);
  const [localSlug, setLocalSlug] = useState<string | null | undefined>(slug);
  useEffect(() => setStatus(currentStatus), [currentStatus]);
  useEffect(() => setPlan(currentPlan), [currentPlan]);
  useEffect(() => setIsPublic(!!profilePublic), [profilePublic]);
  useEffect(() => setLocalSlug(slug), [slug]);

  // Unlocks state — fetched on mount, refetched after each mutation.
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);
  const [unlockProjectInput, setUnlockProjectInput] = useState("");

  // Subscription modal-local
  const [grantTier, setGrantTier] = useState<BuilderSubTier>("month_1");

  const loadUnlocks = useCallback(async () => {
    try {
      const { data } = await api.get<{ items?: Unlock[] }>(
        `/api/admin/tradesmen/${uid}/oneoff-unlocks`,
      );
      setUnlocks(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setUnlocks([]);
    }
  }, [api, uid]);

  useEffect(() => {
    void loadUnlocks();
  }, [loadUnlocks]);

  async function mutate(
    key: string,
    successMsg: string,
    fn: () => Promise<unknown>,
  ) {
    setBusyKey(key);
    setErr(null);
    setOkMsg(null);
    try {
      await fn();
      setOkMsg(successMsg);
      onRefresh();
      // Clear the success banner after a beat so it doesn't shout
      // forever - the visual button-state change is the persistent
      // confirmation.
      window.setTimeout(() => setOkMsg(null), 2200);
    } catch (e) {
      const e2 = e as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setErr(
        e2?.response?.data?.error ||
          e2?.message ||
          `Failed to ${successMsg.toLowerCase()}`,
      );
    } finally {
      setBusyKey(null);
    }
  }

  const busy = busyKey !== null;

  return (
    <div className="space-y-4" data-testid="drawer-manage">
      {err && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {err}
        </div>
      )}
      {okMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
          {okMsg}
        </div>
      )}

      {/* ============ STATUS ============ */}
      <Section title="Status" hint={`Currently ${status}`}>
        <div className="flex flex-wrap gap-2">
          {(["active", "draft", "inactive"] as const).map((s) => {
            const isCurrent = status === s;
            const isBusy = busyKey === `status-${s}`;
            return (
              <button
                key={s}
                type="button"
                disabled={busy || isCurrent}
                onClick={() =>
                  mutate(`status-${s}`, `Set to ${s}`, async () => {
                    const { data } = await api.post(`/api/admin/tradesmen/${uid}/status`, {
                      status: s,
                    });
                    setStatus(s);
                    // Activation generates a slug server-side - reflect it
                    // immediately so the publish toggle appears without a reload.
                    const newSlug = (data as { tradesman?: { slug?: string } })?.tradesman?.slug;
                    if (newSlug) setLocalSlug(newSlug);
                  })
                }
                className={`px-3 py-1.5 rounded-lg border-[1.5px] text-xs font-bold transition-colors ${
                  isCurrent
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 cursor-default ring-2 ring-indigo-200"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                } disabled:opacity-60`}
                data-testid={`manage-status-${s}`}
              >
                {isBusy ? "Saving…" : s}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ============ PUBLIC PROFILE ============ */}
      <Section title="Public profile" hint={isPublic ? "Live" : "Not published"}>
        {!localSlug ? (
          <p className="text-xs text-slate-500">
            No profile slug yet. Set the account to <strong>active</strong> first - a slug is generated automatically on activation.
          </p>
        ) : (
          <>
            {!isPublic && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 mb-3">
                This tradesperson&apos;s public website is ready but <strong>not yet live</strong>. Turn it on to publish it, notify them, and show the URL.
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {isPublic ? "Public profile is live" : "Publish public profile"}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 break-all">/t/{localSlug}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                disabled={busyKey === "profile-public"}
                onClick={() =>
                  mutate(
                    "profile-public",
                    isPublic ? "Public profile hidden" : "Public profile published",
                    async () => {
                      await api.post(`/api/admin/tradesmen/${uid}/profile-public`, {
                        enabled: !isPublic,
                      });
                      setIsPublic(!isPublic);
                    },
                  )
                }
                className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
                  isPublic ? "bg-emerald-500" : "bg-slate-300"
                } disabled:opacity-60`}
                data-testid="manage-profile-public"
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isPublic ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </>
        )}
      </Section>

      {/* ============ SUBSCRIPTION ============ */}
      <Section
        title="Subscription"
        hint={plan ? `Plan: ${plan}` : "Free / no active tier"}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <select
            value={grantTier}
            onChange={(e) => setGrantTier(e.target.value as BuilderSubTier)}
            className="bg-amber-50/40 border border-amber-100 rounded-lg px-3 py-2 text-sm font-bold text-slate-700"
            data-testid="manage-sub-tier"
          >
            {(Object.keys(TIER_LABEL) as BuilderSubTier[]).map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              mutate("sub-grant", "Subscription granted", async () => {
                await api.post("/api/admin/builder-subscriptions/grant", {
                  userId: uid,
                  tier: grantTier,
                });
                setPlan(grantTier);
              })
            }
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-3 py-2 disabled:opacity-60"
            data-testid="manage-sub-grant"
          >
            {busyKey === "sub-grant" ? "Granting…" : "Grant"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!confirm("Revoke this tradesperson's subscription?")) return;
              void mutate("sub-revoke", "Subscription revoked", async () => {
                await api.post("/api/admin/builder-subscriptions/revoke", {
                  userId: uid,
                });
                setPlan("free");
              });
            }}
            className="rounded-lg bg-white border border-rose-200 text-rose-700 text-xs font-bold px-3 py-1.5 hover:bg-rose-50 disabled:opacity-60"
            data-testid="manage-sub-revoke"
          >
            {busyKey === "sub-revoke" ? "Revoking…" : "Revoke"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              mutate(
                "sub-cancel-graceful",
                "Subscription will end at period end",
                async () => {
                  await api.post(
                    `/api/admin/tradesmen/${uid}/subscription/cancel`,
                    {},
                  );
                },
              )
            }
            className="rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 hover:bg-slate-50 disabled:opacity-60"
            data-testid="manage-sub-cancel-graceful"
          >
            {busyKey === "sub-cancel-graceful"
              ? "Scheduling…"
              : "Cancel at period end"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!confirm("Cancel this subscription immediately?")) return;
              void mutate("sub-cancel-now", "Subscription cancelled", async () => {
                await api.post(
                  `/api/admin/tradesmen/${uid}/subscription/cancel`,
                  { immediate: true },
                );
                setPlan("free");
              });
            }}
            className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-3 py-1.5 hover:bg-rose-100 disabled:opacity-60"
            data-testid="manage-sub-cancel-now"
          >
            {busyKey === "sub-cancel-now" ? "Cancelling…" : "Cancel now"}
          </button>
        </div>
      </Section>


      {/* ============ ONE-OFF UNLOCKS ============ */}
      <Section title="One-off unlocks" hint={`${unlocks.length} active`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <input
            type="number"
            min={1}
            value={unlockProjectInput}
            onChange={(e) => setUnlockProjectInput(e.target.value)}
            placeholder="Project ID"
            className="bg-amber-50/40 border border-amber-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
            data-testid="manage-unlock-project-id"
          />
          <button
            type="button"
            disabled={busy || !unlockProjectInput.trim()}
            onClick={() => {
              const id = Number(unlockProjectInput);
              if (!Number.isFinite(id) || id <= 0) {
                setErr("Enter a valid project ID");
                return;
              }
              void mutate("unlock-grant", "Unlock granted", async () => {
                await api.post(
                  `/api/admin/tradesmen/${uid}/oneoff-unlocks/grant`,
                  { projectId: id },
                );
                setUnlockProjectInput("");
                await loadUnlocks();
              });
            }}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-3 py-2 disabled:opacity-60"
            data-testid="manage-unlock-grant"
          >
            {busyKey === "unlock-grant" ? "Granting…" : "Grant unlock"}
          </button>
        </div>
        {unlocks.length === 0 ? (
          <p className="text-xs text-slate-500">No active unlocks.</p>
        ) : (
          <ul className="space-y-1.5" data-testid="manage-unlocks-list">
            {unlocks.map((u) => (
              <li
                key={u.projectId}
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-extrabold text-slate-900 truncate">
                    #{u.projectId} · {u.projectName || "Untitled"}
                  </div>
                  <div className="text-slate-400">
                    {u.status || "pending"}
                    {u.approvedAt ? ` · ${u.approvedAt}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(`Revoke unlock for project #${u.projectId}?`))
                      return;
                    void mutate(
                      `unlock-revoke-${u.projectId}`,
                      "Unlock revoked",
                      async () => {
                        await api.post(
                          `/api/admin/tradesmen/${uid}/oneoff-unlocks/revoke`,
                          { projectId: u.projectId },
                        );
                        await loadUnlocks();
                      },
                    );
                  }}
                  className="rounded-md bg-white border border-rose-200 text-rose-700 text-[11px] font-bold px-2 py-1 hover:bg-rose-50 shrink-0 disabled:opacity-60"
                  data-testid={`manage-unlock-revoke-${u.projectId}`}
                >
                  {busyKey === `unlock-revoke-${u.projectId}`
                    ? "Revoking…"
                    : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open
      className="rounded-xl border border-amber-100 bg-white p-4 open:bg-amber-50/40"
    >
      <summary className="cursor-pointer flex items-center justify-between gap-3 list-none">
        <span className="font-extrabold text-slate-900 text-sm">{title}</span>
        {hint && (
          <span className="text-[11px] font-bold text-slate-500">{hint}</span>
        )}
      </summary>
      <div className="mt-3 pt-3 border-t border-amber-100">{children}</div>
    </details>
  );
}
