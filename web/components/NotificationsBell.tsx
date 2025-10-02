import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useApi } from "@/utils/api";

type Notif = {
  id?: number; // undefined for ephemeral broadcasts
  type: string;
  message: string;
  projectId?: number | null;
  linkPath?: string | null;
  createdAt: string;
  readAt?: string | null;
};

type Toast = { key: string; message: string; link: string; createdAt: string };

declare global {
  interface Window {
    __VMB_ES?: EventSource;
    __VMB_SEEN_KEYS?: Set<string>;
  }
}

export default function NotificationsBell() {
  const api = useApi();
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const started = useRef(false);

  const seen = useMemo(() => {
    if (!window.__VMB_SEEN_KEYS) window.__VMB_SEEN_KEYS = new Set();
    return window.__VMB_SEEN_KEYS;
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Initial fetch
    (async () => {
      try {
        const { data } = await api.get("/api/notifications");
        const list: Notif[] = (data.items || []).map((n: any) => ({
          ...n,
          readAt: n.readAt ?? n.read_at ?? null,
        }));
        setItems(list);
        // Prefer server unread, otherwise compute
        if (typeof data.unread === "number") {
          setUnread(data.unread);
        } else {
          setUnread(list.filter((n) => !n.readAt).length);
        }
        for (const n of list) seen.add(keyOf(n));
      } catch {
        // ignore
      }
    })();

    // SSE stream
    (async () => {
      const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";
      try {
        if (!window.__VMB_ES) {
          const { getAuth } = await import("firebase/auth");
          const u = getAuth().currentUser;
          const t = u ? await u.getIdToken() : "";
          window.__VMB_ES = new EventSource(
            `${base}/api/notifications/stream?token=${encodeURIComponent(t)}`
          );
        }
        const es = window.__VMB_ES!;

        const onBootstrap = (ev: MessageEvent) => {
          try {
            const payload = JSON.parse(ev.data);
            if (Array.isArray(payload.latest)) {
              const latest = (payload.latest as any[]).map((n) => ({
                ...n,
                readAt: n.readAt ?? n.read_at ?? null,
              }));
              setItems((prev) => mergeUnique(latest, prev, seen));
            }
            if (typeof payload.unread === "number") setUnread(payload.unread);
            if (Array.isArray(payload.broadcasts)) {
              for (const b of payload.broadcasts) {
                const k = keyOf(b);
                if (seen.has(k)) continue;
                seen.add(k);
                pushToast(b);
                // also show in bell + count as unread (ephemeral but visible)
                setItems((prev) => [b, ...prev].slice(0, 50));
                setUnread((u) => u + 1);
              }
            }
          } catch {}
        };

        const onNotification = (ev: MessageEvent) => {
          try {
            const n: Notif = JSON.parse(ev.data);
            const k = keyOf(n);
            if (seen.has(k)) return;
            seen.add(k);

            if (n.id === undefined) {
              // ephemeral broadcast
              pushToast(n);
              setItems((prev) => [n, ...prev].slice(0, 50));
              setUnread((u) => u + 1);
              return;
            }
            setItems((prev) => [n, ...prev].slice(0, 50));
            setUnread((x) => x + 1);
          } catch {}
        };

        es.addEventListener("bootstrap", onBootstrap);
        es.addEventListener("notification", onNotification);
        return () => {
          es.removeEventListener("bootstrap", onBootstrap as any);
          es.removeEventListener("notification", onNotification as any);
        };
      } catch {}
    })();
  }, [api, seen]);

  const pushToast = (n: Partial<Notif>) => {
    const link = n.linkPath || (n.projectId ? `/projects/${n.projectId}` : "#");
    const key = keyOf(n);
    setToasts((prev) => {
      if (prev.find((t) => t.key === key)) return prev;
      const t = {
        key,
        message: n.message || "Notification",
        link,
        createdAt: n.createdAt || new Date().toISOString(),
      };
      const next = [...prev, t].slice(-4);
      setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.key !== key));
      }, 5000);
      return next;
    });
  };

  // Click-through: mark read (optimistic), drop from list, decrement badge once
  const onNotifClick =
    (n: Notif) => async (_e: React.MouseEvent<HTMLAnchorElement>) => {
      const wasUnread = !n.readAt; // only decrement if it was unread
      // optimistic UI
      if (wasUnread) setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.filter((x) => keyOf(x) !== keyOf(n)));
      try {
        if (n.id !== undefined) {
          await api.post(`/api/notifications/${n.id}/read`);
        }
      } catch {
        // If server call fails, we could restore, but keeping UI snappy is fine;
        // next poll/SSE/refresh will resync.
      }
    };

  return (
    <div className="relative">
      <button
        className="relative px-3 py-2 rounded-md hover:bg-white/5"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className="ml-1 inline-flex items-center justify-center text-xs bg-red-600 text-white rounded-full px-1.5">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg p-2 z-50">
          <div className="flex items-center justify-between px-2 py-1">
            <div className="text-sm text-zinc-400">Notifications</div>
            {/* (Intentionally no "Mark all" per your previous direction) */}
            <div />
          </div>
          <ul className="max-h-96 overflow-auto">
            {items.length === 0 ? (
              <li className="px-3 py-4 text-sm text-zinc-400">
                No notifications yet.
              </li>
            ) : (
              items.map((n, i) => (
                <li
                  key={n.id ?? `${keyOf(n)}#${i}`}
                  className="px-3 py-2 hover:bg-white/5 rounded-lg"
                >
                  <Link
                    href={
                      n.linkPath ||
                      (n.projectId ? `/projects/${n.projectId}` : "#")
                    }
                    className="block"
                    onClick={onNotifClick(n)}
                  >
                    <div className="text-sm">{n.message}</div>
                    <div className="text-xs text-zinc-500">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-[60]">
        {toasts.map((t) => (
          <Link
            key={t.key}
            href={t.link}
            className="block bg-zinc-900/95 border border-zinc-800 rounded-lg px-4 py-3 shadow-lg hover:bg-zinc-900"
            onClick={() => {
              // ephemerals also decrement since we incremented on receive
              setUnread((u) => Math.max(0, u - 1));
            }}
          >
            <div className="text-sm">{t.message}</div>
            <div className="text-xs text-zinc-500">
              {new Date(t.createdAt).toLocaleTimeString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function keyOf(n: Partial<Notif>) {
  return `${n.type}|${n.projectId ?? ""}|${n.message ?? ""}|${
    n.createdAt ?? ""
  }`;
}

function mergeUnique(a: Notif[], b: Notif[], seen: Set<string>) {
  const out: Notif[] = [];
  for (const n of [...a, ...b]) {
    const k = keyOf(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out.slice(0, 50);
}
