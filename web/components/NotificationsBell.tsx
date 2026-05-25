// web/components/NotificationsBell.tsx
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";

type NotifItem = {
  id: number;
  type: string;
  message: string;
  projectId: number | null;
  linkPath: string | null;
  createdAt: string;
  readAt?: string | null;
};

type NotifGroup = {
  projectId: number;
  projectName: string;
  projectStatus: string;
  unread: number;
  total: number;
  latest: string;
  summary: Record<string, number>;
  items: NotifItem[];
};

// How many notifications we keep client-side and ask the server for
const NOTIF_LIMIT = 200;

function dedupeAndSort(items: NotifItem[], limit = NOTIF_LIMIT) {
  const byId = new Map<number, NotifItem>();
  for (const it of items) {
    const existing = byId.get(it.id);
    // Prefer the one that has readAt (ensures read state isn’t lost)
    if (!existing || (!!it.readAt && !existing.readAt)) byId.set(it.id, it);
  }
  return Array.from(byId.values())
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, limit);
}

export default function NotificationsBell() {
  // Guard for any SSR rendering path
  if (typeof window === "undefined") return null;
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState<NotifGroup[]>([]);
  const [ungrouped, setUngrouped] = useState<NotifItem[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function refreshList() {
    try {
      const { data } = await api.get(`/api/notifications?grouped=1`);
      setGroups(data.groups || []);
      setUngrouped(data.ungrouped || []);
      setUnread(data.unread || 0);
      // Also update flat items for SSE merge compatibility
      const allItems: NotifItem[] = [
        ...(data.groups || []).flatMap((g: NotifGroup) => g.items || []),
        ...(data.ungrouped || []),
      ];
      setItems(dedupeAndSort(allItems));
    } catch {}
  }

  // Initial bootstrap fetch + react to events from GlobalSseDispatcher.
  // The dispatcher (mounted in _app.tsx) owns the single app-wide SSE
  // connection and re-broadcasts every notification as a `vmb:notification`
  // DOM CustomEvent. Listening here keeps the bell working on every route
  // — including bare mobile routes where SiteHeader is not rendered (the
  // bell still might not be visible there, but its unread count and list
  // stay consistent for any place that does mount it).
  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setItems([]);
      setUnread(0);
      return;
    }

    refreshList();

    function onNotification() {
      if (cancelled) return;
      setUnread((u) => u + 1);
      refreshList();
    }
    function onBootstrap() {
      if (cancelled) return;
      refreshList();
    }

    window.addEventListener("vmb:notification", onNotification);
    window.addEventListener("vmb:bootstrap", onBootstrap);

    return () => {
      cancelled = true;
      window.removeEventListener("vmb:notification", onNotification);
      window.removeEventListener("vmb:bootstrap", onBootstrap);
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // MARK ALL READ: set readAt on every notification, keep the list visible
  async function markAllRead() {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      await api.post("/api/notifications/read-all");
      setUnread(0);
      await refreshList();
    } finally {
      setBusy(false);
    }
  }

  // DISMISS: remove a single notification entirely
  async function dismissNotification(e: React.MouseEvent, n: NotifItem) {
    e.stopPropagation();
    const wasUnread = !n.readAt;
    setItems((prev) => prev.filter((i) => i.id !== n.id));
    if (wasUnread) setUnread((u) => Math.max(0, u - 1));
    if (n.id > 0) {
      try {
        await api.delete(`/api/notifications/${n.id}`);
      } catch {
        /* ignore */
      }
    }
  }

  async function onClickItem(n: NotifItem) {
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) =>
        prev.map((i) =>
          i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i,
        ),
      );
      if (n.id > 0) {
        try {
          await api.post(`/api/notifications/${n.id}/read`);
        } catch {
          /* ignore */
        }
      } else {
        refreshList();
      }
    }

    setOpen(false);

    const href =
      n.linkPath && n.linkPath.startsWith("/")
        ? n.linkPath
        : n.projectId
          ? `/projects/${n.projectId}`
          : "/projects";

    // Grant funnel notifications open in a new tab so the user keeps
    // their VMB session in place.
    if (n.type === "grant_opportunity") {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      await router.push(href);
    } catch {
      window.location.assign(href);
    }
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function summaryText(summary: Record<string, number>): string {
    const parts: string[] = [];
    const rec = summary.recommendation_new || 0;
    if (rec > 0) parts.push(`${rec} new rec${rec > 1 ? "s" : ""}`);
    const shared = summary.tradesman_shared_profile || 0;
    if (shared > 0) parts.push(`${shared} builder${shared > 1 ? "s" : ""} shared`);
    const hires = (summary.hire_received || 0) + (summary.hire_accepted || 0) + (summary.hire_declined || 0);
    if (hires > 0) parts.push(`${hires} hire update${hires > 1 ? "s" : ""}`);
    const interest = summary.tradesman_interest || 0;
    if (interest > 0) parts.push(`${interest} interested`);
    const match = summary.project_match || 0;
    if (match > 0) parts.push(`${match} match${match > 1 ? "es" : ""}`);
    return parts.join(" · ") || "Activity";
  }

  async function handleMarkGroupRead(group: NotifGroup) {
    setBusy(true);
    const unreadIds = group.items.filter((n) => !n.readAt).map((n) => n.id);
    for (const id of unreadIds) {
      try { await api.post(`/api/notifications/${id}/read`); } catch {}
    }
    await refreshList();
    setBusy(false);
  }

  function handleItemClick(n: NotifItem) {
    onClickItem(n);
  }

  function handleDismiss(id: number) {
    const n = items.find((i) => i.id === id);
    if (n) {
      const syntheticEvent = { stopPropagation: () => {} } as React.MouseEvent;
      dismissNotification(syntheticEvent, n);
      refreshList();
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label={unread > 0 ? "Notifications (unread)" : "Notifications"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center rounded-full p-2 ring-1 ring-gray-300/80 bg-white hover:bg-gray-50 shadow-sm"
      >
        <svg
          className="h-5 w-5 text-gray-700"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M14 19a2 2 0 1 1-4 0m-5-1h14c-.9-1.2-1.6-2.3-1.6-5.1 0-3.5-2.2-6.4-5.4-6.9-3.4-.6-6 2.1-6 5.7 0 2.8-.7 3.9-2 6.3Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Red dot badge */}
        {unread > 0 && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 bg-black/20 sm:hidden"
            onClick={() => setOpen(false)}
          />

          <div
            ref={menuRef}
            role="menu"
            aria-label="Notifications"
            className="
    fixed inset-x-3 top-20 z-50 max-h-[70vh] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl
    sm:absolute sm:left-auto sm:right-0 sm:inset-x-auto sm:top-full sm:mt-2 sm:z-50 sm:w-96 sm:max-h-96 sm:rounded-xl sm:ring-1 sm:ring-black/5
  "
          >
            <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">
                Notifications
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="text-xs rounded-md px-2 py-1 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  onClick={markAllRead}
                  disabled={busy || unread === 0}
                >
                  Mark all as read
                </button>

                <button
                  type="button"
                  className="sm:hidden text-sm rounded-md px-2 py-1 text-gray-600 hover:bg-gray-50"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-auto max-h-[calc(70vh-56px)] sm:max-h-96 divide-y divide-gray-100">
              {/* Grouped project summaries */}
              {groups.map((g) => {
                const isExpanded = expandedProjectId === g.projectId;
                return (
                  <div key={g.projectId} className="border-b border-zinc-100 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpandedProjectId(isExpanded ? null : g.projectId)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-zinc-50 ${
                        g.unread > 0 ? "bg-amber-50/80 border-l-4 border-amber-500" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-zinc-900 truncate pr-2">{g.projectName}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {g.unread > 0 && (
                            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{g.unread}</span>
                          )}
                          <span className={`text-zinc-400 text-xs transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{summaryText(g.summary)}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Latest: {timeAgo(g.latest)}</p>
                    </button>
                    {isExpanded && (
                      <div className="bg-zinc-50/50">
                        {g.items.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => handleItemClick(n)}
                            className={`group flex items-start gap-2 px-4 py-2 pl-6 cursor-pointer border-b border-zinc-100/50 last:border-b-0 hover:bg-zinc-100/50 ${
                              !n.readAt ? "font-medium" : ""
                            }`}
                          >
                            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${!n.readAt ? "bg-amber-500" : "bg-zinc-300"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-zinc-700 truncate">{n.message}</p>
                              <p className="text-[10px] text-zinc-400">{timeAgo(n.createdAt)}</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDismiss(n.id); }}
                              className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 text-xs px-1"
                              aria-label="Dismiss"
                            >×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {ungrouped.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`group flex items-start gap-2 px-4 py-3 cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 ${
                    !n.readAt ? "bg-amber-50/80 border-l-4 border-amber-500 font-medium" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-700">{n.message}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDismiss(n.id); }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 text-xs px-1"
                    aria-label="Dismiss"
                  >×</button>
                </div>
              ))}
              {groups.length === 0 && ungrouped.length === 0 && (
                <p className="py-8 text-center text-sm text-zinc-400">You're all caught up.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
