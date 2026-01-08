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

  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [apiBase, setApiBase] = useState<string>("");

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    const envBase = process.env.NEXT_PUBLIC_API_BASE || "";
    setApiBase(envBase || window.location.origin);
  }, []);

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
        const token =
          typeof (user as any)?.getIdToken === "function"
            ? await (user as any).getIdToken()
            : undefined;
        if (!token || !apiBase) return;

        // Include limit on SSE bootstrap too
        const url = `${apiBase}/api/notifications/stream?limit=${NOTIF_LIMIT}&token=${encodeURIComponent(
          token
        )}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.addEventListener("bootstrap", (ev: MessageEvent) => {
          try {
            const payload = JSON.parse(ev.data);
            if (cancelled) return;
            setUnread(payload.unread ?? 0);
            // Merge latest with what we already have (in case fetch already ran)
            setItems((prev) =>
              dedupeAndSort([...(payload.latest ?? []), ...prev])
            );
          } catch {
            /* ignore */
          }
        });

        es.addEventListener("notification", () => {
          if (cancelled) return;
          setUnread((u) => u + 1);
          // Throttle a refresh that also asks with a higher limit
          if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
          refreshTimer.current = window.setTimeout(() => {
            refreshList();
            refreshTimer.current = null;
          }, 250);
        });

        es.onerror = () => {
          try {
            es.close();
          } catch {}
        };
      } catch {
        /* ignore */
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [user, apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  // CLEAR ALL: mark everything read on server then clear list locally
  async function clearAll() {
    if (busy || items.length === 0) return;
    setBusy(true);
    try {
      await api.post("/api/notifications/read-all");
      setUnread(0);
      setItems([]); // remove all notifications from the panel
    } finally {
      setBusy(false);
    }
  }

  async function onClickItem(n: NotifItem) {
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) =>
        prev.map((i) =>
          i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i
        )
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

  const showDot = unread > 0; // big red dot on the bell

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label={showDot ? "Notifications (unread)" : "Notifications"}
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

        {/* Big red dot indicator (no number) */}
        {showDot && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-rose-600 ring-2 ring-white shadow"
          />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-96 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
        >
          <div className="flex items-center justify-between px-3 py-2">
            {/* Top-left: show count of loaded items */}
            <div className="text-sm font-semibold text-gray-900">
              {items.length} Notifications
            </div>

            <button
              className="text-xs rounded-md px-2 py-1 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
              onClick={clearAll}
              disabled={busy || items.length === 0}
            >
              Clear all
            </button>
          </div>

          <div className="max-h-96 overflow-auto divide-y divide-gray-100">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-sm text-gray-500 text-center">
                You’re all caught up.
              </div>
            ) : (
              items.map((n) => {
                const isUnread = !n.readAt;
                return (
                  <button
                    key={`${n.id}-${n.createdAt}`}
                    role="menuitem"
                    className={`w-full text-left px-3 py-3 hover:bg-gray-50 transition
                      ${
                        isUnread
                          ? "bg-amber-50/80 border-l-4 border-amber-500"
                          : ""
                      }
                    `}
                    onClick={() => onClickItem(n)}
                  >
                    <div
                      className={`text-sm ${
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
      )}
    </div>
  );
}
