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
  const { user, token: authToken } = useAuth();
  const api = useApi();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [busy, setBusy] = useState(false);
  // SSE must bypass the Next.js rewrite proxy (which buffers SSE streams).
  // In dev, the web runs on :3000 and API on :3100. Detect and connect directly.
  const sseBase = (() => {
    if (typeof window === "undefined") return "";
    const loc = window.location;
    // Dev: Next.js on :3000 proxies to API on :3100. Connect SSE directly to :3100.
    if (loc.hostname === "localhost" && loc.port === "3000") {
      return `${loc.protocol}//localhost:3100`;
    }
    // Production or other setups: same origin
    return loc.origin;
  })();

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const refreshTimer = useRef<number | null>(null);

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
      // Ask the API for more than the old default of 50
      const { data } = await api.get(`/api/notifications?limit=${NOTIF_LIMIT}`);
      setItems((prev) => dedupeAndSort([...(data.items || []), ...prev]));
      setUnread(data.unread || 0);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };

    async function start() {
      cleanup();

      if (!user) {
        setItems([]);
        setUnread(0);
        return;
      }

      await refreshList();
      if (cancelled) return;

      try {
        // Get token from Firebase directly — useAuth token may lag behind
        const fbAuth = (window as any).firebaseAuth;
        const fbToken = fbAuth?.currentUser
          ? await fbAuth.currentUser.getIdToken()
          : null;
        const token = fbToken || authToken;
        if (!token || !sseBase) return;

        const url = `${sseBase}/api/notifications/stream?limit=${NOTIF_LIMIT}&token=${encodeURIComponent(
          token,
        )}`;
        console.log("[SSE-DEBUG] connecting to", url.slice(0, 80));
        const es = new EventSource(url);
        esRef.current = es;

        es.addEventListener("bootstrap", (ev: MessageEvent) => {
          try {
            const payload = JSON.parse(ev.data);
            if (cancelled) return;
            setUnread(payload.unread ?? 0);
            // Merge latest with what we already have (in case fetch already ran)
            setItems((prev) =>
              dedupeAndSort([...(payload.latest ?? []), ...prev]),
            );
          } catch {
            /* ignore */
          }
        });

        es.addEventListener("notification", (ev: MessageEvent) => {
          if (cancelled) return;
          setUnread((u) => u + 1);

          // Try to use the event data directly (avoids an extra API call)
          try {
            const n = JSON.parse(ev.data);

            // Broadcast to other components (e.g. rec list auto-refresh)
            try {
              window.dispatchEvent(new CustomEvent("vmb:notification", { detail: n }));
            } catch {}

            if (n?.message) {
              setItems((prev) =>
                dedupeAndSort([
                  {
                    id: -(Date.now()),
                    type: n.type || "info",
                    message: n.message,
                    projectId: n.projectId ?? null,
                    linkPath: n.linkPath ?? null,
                    createdAt: n.createdAt || new Date().toISOString(),
                    readAt: null,
                  },
                  ...prev,
                ]),
              );
            }
          } catch {
            // Fallback: refresh from API
            if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
            refreshTimer.current = window.setTimeout(() => {
              refreshList();
              refreshTimer.current = null;
            }, 250);
          }
        });

        // Let EventSource auto-reconnect on errors — don't close it
        es.onerror = () => {};
      } catch {
        /* ignore */
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [user, authToken, sseBase]); // eslint-disable-line react-hooks/exhaustive-deps

  // MARK ALL READ: set readAt on every notification, keep the list visible
  async function markAllRead() {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      await api.post("/api/notifications/read-all");
      setUnread(0);
      setItems((prev) =>
        prev.map((i) =>
          i.readAt ? i : { ...i, readAt: new Date().toISOString() },
        ),
      );
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

    try {
      await router.push(href);
    } catch {
      window.location.assign(href);
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

        {/* Numeric unread badge */}
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
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
                {items.length} Notifications
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/account/notifications"
                  onClick={() => setOpen(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Settings
                </Link>

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
              {items.length === 0 ? (
                <div className="px-4 py-8 text-sm text-gray-500 text-center">
                  You’re all caught up.
                </div>
              ) : (
                items.map((n) => {
                  const isUnread = !n.readAt;

                  return (
                    <button
                      key={`${n.id}-${n.createdAt}`}
                      role="menuitem"
                      className={`group relative w-full text-left px-4 py-4 hover:bg-gray-50 transition ${
                        isUnread
                          ? "bg-amber-50/80 border-l-4 border-amber-500"
                          : ""
                      }`}
                      onClick={() => onClickItem(n)}
                    >
                      <span
                        role="button"
                        aria-label="Dismiss notification"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                        onClick={(e) => dismissNotification(e, n)}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </span>
                      <div
                        className={`text-sm leading-6 pr-6 ${
                          isUnread
                            ? "text-gray-900 font-semibold"
                            : "text-gray-900"
                        }`}
                      >
                        {n.message}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
