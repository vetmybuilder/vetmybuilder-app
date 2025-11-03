// import { useEffect, useRef, useState } from "react";
// import { useAuth } from "@/utils/auth";
// import { useApi } from "@/utils/api";
// import { chatService, type ChatMessage } from "@/services/chat/service";

// type Props = {
//   open: boolean;
//   onClose: () => void;
//   projectId: number | null;
//   withUid: string; // the other participant (owner uid if you’re tradesman)
//   origin?: "cta" | "notif";
// };

// export default function ChatModal({ open, onClose, projectId, withUid }: Props) {
//   const { user, loading: authLoading } = useAuth();
//   const api = useApi();

//   const [chatId, setChatId] = useState<string>("");
//   const [pending, setPending] = useState(false);
//   const [err, setErr] = useState<string | null>(null);
//   const [input, setInput] = useState("");
//   const [items, setItems] = useState<ChatMessage[]>([]);

//   const subStopRef = useRef<() => void>(() => {});

//   // Start (or resume) a chat once we have auth AND props
//   useEffect(() => {
//     if (!open) return;
//     if (authLoading || !user?.uid || !projectId || !withUid) return;

//     let cancelled = false;
//     (async () => {
//       try {
//         setErr(null);
//         setPending(true);

//         // Ensure chat
//         const id = await chatService.ensureChat(api as any, {
//           projectId: projectId!,
//           withUid,
//         });
//         if (cancelled) return;
//         setChatId(id);

//         // Load history (auth’d)
//         const history = await chatService.listMessages(api as any, id, {
//           limit: 100,
//         });
//         if (cancelled) return;
//         setItems(history);
//       } catch (e: any) {
//         setErr(
//           e?.response?.data?.error || e?.message || "Unable to start chat"
//         );
//       } finally {
//         setPending(false);
//       }
//     })();

//     return () => {
//       cancelled = true;
//     };
//   }, [open, authLoading, user?.uid, projectId, withUid, api]);

//   // Subscribe to new messages (start only when we have chatId & auth)
//   useEffect(() => {
//     if (!open || !chatId || !user?.uid) return;

//     // stop previous subscription if any
//     try {
//       subStopRef.current?.();
//     } catch {}
//     subStopRef.current = () => {};

//     let cancelled = false;
//     (async () => {
//       try {
//         // Try to get an ID token for SSE (server also accepts polling via useApi)
//         let token: string | undefined;
//         try {
//           token = (await (user as any)?.getIdToken?.()) as string | undefined;
//         } catch {
//           token = undefined;
//         }

//         const unsub = chatService.subscribe(
//           api as any,
//           chatId,
//           {
//             onMessage: (m) =>
//               setItems((prev) => {
//                 if (prev.some((x) => x.id === m.id)) return prev;
//                 return [...prev, m];
//               }),
//             onError: () => {
//               // ignore; provider handles retry/fallback
//             },
//           },
//           token ? { sseToken: token } : { disableSSE: true } // ← pass token for SSE, otherwise force polling
//         );

//         if (!cancelled) subStopRef.current = unsub;
//       } catch {
//         // If anything throws here, leave without a subscriber (send still works)
//       }
//     })();

//     return () => {
//       cancelled = true;
//       try {
//         subStopRef.current?.();
//       } catch {}
//       subStopRef.current = () => {};
//     };
//   }, [open, chatId, user?.uid, api, user]);

//   async function onSend() {
//     const body = input.trim();
//     if (!body || !chatId) return;
//     setInput("");
//     try {
//       await chatService.sendMessage(api as any, chatId, body);
//       // optimistic append; subscriber will also deliver the persisted copy
//       const nowIso = new Date().toISOString();
//       setItems((prev) => [
//         ...prev,
//         {
//           id: "local-" + nowIso,
//           chatId,
//           senderUid: user!.uid,
//           body,
//           createdAt: nowIso,
//           readAt: null,
//         },
//       ]);
//     } catch (e: any) {
//       setErr(e?.response?.data?.error || e?.message || "Failed to send");
//     }
//   }

//   // --- UI ---
//   if (!open) return null;
//   return (
//     <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
//       <div className="w-[min(640px,92vw)] rounded-2xl bg-white p-4 shadow-2xl">
//         {err && (
//           <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
//             {err}
//           </div>
//         )}

//         <div className="h-64 overflow-y-auto rounded-lg bg-slate-50 p-3">
//           {items.length === 0 ? (
//             <div className="grid h-full place-items-center text-slate-500 text-sm">
//               Start the conversation.
//             </div>
//           ) : (
//             <ul className="space-y-2">
//               {items.map((m) => {
//                 const mine = m.senderUid === user?.uid;
//                 return (
//                   <li
//                     key={m.id}
//                     className={`flex ${mine ? "justify-end" : "justify-start"}`}
//                   >
//                     <div
//                       className={`rounded-xl px-3 py-2 text-sm ${
//                         mine ? "bg-slate-800 text-white" : "bg-white border"
//                       }`}
//                     >
//                       <div>{m.body}</div>
//                       <div className="mt-1 text-[10px] opacity-70">
//                         {new Date(m.createdAt).toLocaleString()}
//                       </div>
//                     </div>
//                   </li>
//                 );
//               })}
//             </ul>
//           )}
//         </div>

//         <div className="mt-3 flex gap-2">
//           <input
//             value={input}
//             onChange={(e) => setInput(e.target.value)}
//             placeholder="Your message"
//             className="flex-1 rounded-lg border px-3 py-2"
//             disabled={pending || !chatId}
//           />
//           <button className="btn" onClick={onSend} disabled={pending || !chatId}>
//             Send
//           </button>
//           <button className="btn-outline" onClick={onClose}>
//             Close
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }
