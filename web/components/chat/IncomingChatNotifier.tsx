// import { useEffect, useRef, useState } from "react";
// import { useAuth } from "@/utils/auth";
// import { useApi } from "@/utils/api";
// import ChatModal from "@/components/chat/ChatModal";

// type ChatMessageNotif = {
//   chatId: string;
//   projectId: number;
//   fromUid: string;
//   body: string;
//   createdAt: string; // ISO
// };

// type Toast = {
//   id: string;
//   title: string;
//   body: string;
//   action: () => void;
// };

// const NOTIF_KIND = "chat_message";
// const USE_SSE = (process.env.NEXT_PUBLIC_NOTIF_USE_SSE || "true") !== "false";

// export default function IncomingChatNotifier() {
//   const { user } = useAuth();
//   const api = useApi();

//   const [toasts, setToasts] = useState<Toast[]>([]);
//   const [modalOpen, setModalOpen] = useState(false);
//   const [modalProjectId, setModalProjectId] = useState<number | null>(null);
//   const [modalWithUid, setModalWithUid] = useState<string>("");

//   const dedupe = useRef<Set<string>>(new Set());
//   const pollTimer = useRef<any>(null);
//   const lastSeenIsoRef = useRef<string>(new Date().toISOString()); // skip old notifs on first mount

//   const loggedIn = !!user?.uid;

//   function addToast(n: ChatMessageNotif) {
//     const key = `${n.chatId}|${n.createdAt}|${n.fromUid}|${(n.body || "").slice(
//       0,
//       40
//     )}`;
//     if (dedupe.current.has(key)) return;
//     dedupe.current.add(key);

//     setToasts((prev) => [
//       ...prev,
//       {
//         id: key,
//         title: "New message",
//         body: String(n.body || "").slice(0, 140),
//         action: () => {
//           setModalProjectId(n.projectId);
//           setModalWithUid(n.fromUid);
//           setModalOpen(true);
//         },
//       },
//     ]);
//   }

//   function parseNotif(raw: any): ChatMessageNotif | null {
//     try {
//       const kind = raw?.kind || raw?.type || "";
//       const payload =
//         raw?.payload && (raw?.kind || raw?.type)
//           ? raw.payload
//           : raw?.message?.payload
//           ? raw.message.payload
//           : raw;

//       if (
//         (raw?.type === "notification" && raw?.kind === NOTIF_KIND) ||
//         kind === NOTIF_KIND
//       ) {
//         const n = payload as ChatMessageNotif;
//         if (n?.chatId && n?.projectId && n?.fromUid) return n;
//       }
//     } catch {}
//     return null;
//   }

//   // --- Poll fallback using Authorization via useApi (works even if SSE 401s) ---
//   function startPolling() {
//     stopPolling();
//     const tick = async () => {
//       try {
//         const { data } = await api.get("/api/notifications");
//         const items: any[] = Array.isArray(data?.items) ? data.items : [];

//         for (const it of items) {
//           const n = parseNotif(it);
//           if (!n) continue;
//           // only new notifications since mounting (and then moving forward)
//           if (n.createdAt && n.createdAt <= lastSeenIsoRef.current) continue;
//           addToast(n);
//           if (n.createdAt && n.createdAt > lastSeenIsoRef.current) {
//             lastSeenIsoRef.current = n.createdAt;
//           }
//         }
//       } catch {
//         // ignore; try again later
//       } finally {
//         pollTimer.current = setTimeout(tick, 5000);
//       }
//     };
//     tick();
//   }
//   function stopPolling() {
//     if (pollTimer.current) {
//       clearTimeout(pollTimer.current);
//       pollTimer.current = null;
//     }
//   }

//   // --- Primary: SSE (uses cookies). Fallback to polling on any error. ---
//   useEffect(() => {
//     if (!loggedIn) return;

//     // start from "now" to avoid old notifs
//     lastSeenIsoRef.current = new Date().toISOString();

//     let es: EventSource | null = null;
//     let usingSSE = false;

//     if (USE_SSE && typeof window !== "undefined" && "EventSource" in window) {
//       try {
//         es = new EventSource("/api/notifications/stream", {
//           withCredentials: true,
//         });
//         usingSSE = true;

//         const onMessage = (e: MessageEvent) => {
//           try {
//             const raw = JSON.parse(e.data);
//             const n = parseNotif(raw);
//             if (!n) return;
//             addToast(n);
//             if (n.createdAt && n.createdAt > lastSeenIsoRef.current) {
//               lastSeenIsoRef.current = n.createdAt;
//             }
//           } catch {
//             // ignore malformed
//           }
//         };
//         const onError = () => {
//           // Switch to polling if SSE errors (401/close/etc.)
//           if (usingSSE) {
//             usingSSE = false;
//             try {
//               es?.close();
//             } catch {}
//             startPolling();
//           }
//         };

//         es.addEventListener("message", onMessage);
//         es.addEventListener("error", onError);

//         // If the connection doesn’t open quickly, we’ll also fall back after 2s
//         const openTimeout = setTimeout(() => {
//           if (usingSSE && (es as any)?.readyState !== 1 /* OPEN */) {
//             usingSSE = false;
//             try {
//               es?.close();
//             } catch {}
//             startPolling();
//           }
//         }, 2000);

//         return () => {
//           clearTimeout(openTimeout);
//           es?.removeEventListener("message", onMessage);
//           es?.removeEventListener("error", onError);
//           es?.close();
//           stopPolling();
//         };
//       } catch {
//         // Fall back immediately if EventSource throws
//         startPolling();
//         return () => stopPolling();
//       }
//     }

//     // If SSE is disabled or unavailable, just poll
//     startPolling();
//     return () => stopPolling();
//   }, [loggedIn, api]);

//   // auto-dismiss after 12s
//   useEffect(() => {
//     if (toasts.length === 0) return;
//     const timers = toasts.map((t) =>
//       setTimeout(() => {
//         setToasts((prev) => prev.filter((x) => x.id !== t.id));
//       }, 12000)
//     );
//     return () => {
//       timers.forEach(clearTimeout);
//     };
//   }, [toasts]);

//   if (!loggedIn) return null;

//   return (
//     <>
//       <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
//         {toasts.map((t) => (
//           <div
//             key={t.id}
//             className="pointer-events-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
//             data-testid="incoming-chat-toast"
//           >
//             <div className="mb-1 text-sm font-semibold">{t.title}</div>
//             <div className="mb-3 text-sm text-slate-700">{t.body}</div>
//             <div className="flex justify-end gap-2">
//               <button
//                 className="btn-outline"
//                 onClick={() =>
//                   setToasts((prev) => prev.filter((x) => x.id !== t.id))
//                 }
//               >
//                 Dismiss
//               </button>
//               <button
//                 className="btn"
//                 onClick={() => {
//                   t.action();
//                   setToasts((prev) => prev.filter((x) => x.id !== t.id));
//                 }}
//                 data-testid="btn-open-chat"
//               >
//                 Open chat
//               </button>
//             </div>
//           </div>
//         ))}
//       </div>

//       <ChatModal
//         open={modalOpen}
//         onClose={() => setModalOpen(false)}
//         projectId={modalProjectId}
//         withUid={modalWithUid}
//         origin="notif"
//       />
//     </>
//   );
// }
