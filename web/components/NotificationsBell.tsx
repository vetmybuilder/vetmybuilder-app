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

export default function NotificationsBell() {
  // Extra guard; component is dynamically imported with ssr: false,
  // but keep this in case it’s ever rendered on the server.
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
      const { data } = await api.get("/api/notifications");
      setItems(data.items || []);
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

        const url = `${apiBase}/api/notifications/stream?token=${encodeURIComponent(
          token
        )}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.addEventListener("bootstrap", (ev: MessageEvent) => {
          try {
            const payload = JSON.parse(ev.data);
            if (cancelled) return;
            setUnread(payload.unread ?? 0);
            setItems(payload.latest ?? []);
          } catch {}
        });

        es.addEventListener("notification", () => {
          if (cancelled) return;
          setUnread((u) => u + 1);
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
      } catch {}
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [user, apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markAllRead() {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      await api.post("/api/notifications/read-all");
      setUnread(0);
      setItems((prev) =>
        prev.map((i) => ({
          ...i,
          readAt: i.readAt ?? new Date().toISOString(),
        }))
      );
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
        } catch {}
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

    // Prefer SPA nav (use the top-level router instance)
    try {
      await router.push(href);
    } catch {
      window.location.assign(href);
    }
  }

  const count = Math.min(99, Math.max(0, unread));

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label={count ? `${count} unread notifications` : "Notifications"}
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
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 inline-flex min-w-[18px] items-center justify-center rounded-full
                       bg-rose-600 px-1.5 text-[10px] font-semibold text-white shadow ring-1 ring-rose-400/60"
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
        >
          <div className="flex items-center justify-between px-3 py-2">
            <div className="text-sm font-medium">Notifications</div>
            <button
              className="text-xs rounded-md px-2 py-1 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
              onClick={markAllRead}
              disabled={busy || count === 0}
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-auto divide-y divide-gray-100">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-sm text-gray-500 text-center">
                You’re all caught up.
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={`${n.id}-${n.createdAt}`}
                  role="menuitem"
                  className={`w-full text-left px-3 py-3 hover:bg-gray-50 ${
                    !n.readAt ? "bg-indigo-50/60" : ""
                  }`}
                  onClick={() => onClickItem(n)}
                >
                  <div className="text-sm text-gray-900">{n.message}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
            <Link
              href="/projects"
              className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline"
              onClick={() => setOpen(false)}
            >
              View projects
              <svg
                className="h-3 w-3"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 0 1 0-1.06l3.46-3.46-3.46-3.46a.75.75 0 0 1 1.06-1.06l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 0 1-1.06 0Z"
                />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
