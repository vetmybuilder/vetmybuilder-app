// // web/services/chat/service.ts
// export type ApiClient = {
//   get: (url: string, config?: any) => Promise<{ data: any }>;
//   post: (url: string, body?: any, config?: any) => Promise<{ data: any }>;
// };

// export type ChatId = string;

// export type ChatSummary = {
//   id: ChatId;
//   projectId: number;
//   ownerUid: string;
//   tradesmanUid: string;
//   lastMessageAt?: string | null;
//   createdAt?: string | null;
// };

// export type ChatMessage = {
//   id: string;
//   chatId: ChatId;
//   senderUid: string;
//   body: string;
//   createdAt: string; // ISO
//   readAt?: string | null;
// };

// export type SubscribeHandlers = {
//   onMessage: (m: ChatMessage) => void;
//   onError?: (err: unknown) => void;
// };

// export interface ChatService {
//   ensureChat(
//     api: ApiClient,
//     args: { projectId: number; withUid: string }
//   ): Promise<ChatId>;
//   sendMessage(api: ApiClient, chatId: ChatId, body: string): Promise<void>;
//   listMessages(
//     api: ApiClient,
//     chatId: ChatId,
//     opts?: { limit?: number; before?: string }
//   ): Promise<ChatMessage[]>;
//   listChats(api: ApiClient): Promise<ChatSummary[]>;
//   subscribe(
//     api: ApiClient,
//     chatId: ChatId,
//     handlers: SubscribeHandlers
//   ): () => void;
// }

// /* ------------------------------ REST provider ------------------------------ */

// // service.ts  (only these four lines need to change)
// const PATHS = {
//   start: "/api/chats/start",
//   msgs: (id: string) => `/api/chats/${encodeURIComponent(id)}/messages`,
//   stream: (id: string) => `/api/chats/stream?chatId=${encodeURIComponent(id)}`,
//   list: "/api/chats",
// };

// const restProvider: ChatService = {
//   async ensureChat(api, { projectId, withUid }) {
//     const { data } = await api.post(PATHS.start, { projectId, withUid });
//     // axios shape: { data: {...} }
//     const payload = (data as any) ?? {};
//     const id: ChatId =
//       payload.chatId ??
//       payload.chat?.id ??
//       payload.data?.chatId ??
//       payload.data?.chat?.id ??
//       "";
//     if (!id) throw new Error("Chat API returned no id");
//     return String(id);
//   },

//   async sendMessage(api, chatId, body) {
//     await api.post(PATHS.msgs(chatId), { body });
//   },

//   async listMessages(api, chatId, opts) {
//     const { data } = await api.get(PATHS.msgs(chatId), {
//       params: { limit: opts?.limit, before: opts?.before },
//     });
//     const payload = (data as any) ?? {};
//     return Array.isArray(payload.items) ? (payload.items as ChatMessage[]) : [];
//   },

//   async listChats(api) {
//     const { data } = await api.get(PATHS.list);
//     const payload = (data as any) ?? {};
//     return Array.isArray(payload.items) ? (payload.items as ChatSummary[]) : [];
//   },

//   // subscribe(api, chatId, handlers, opts?)
//   subscribe(
//     api,
//     chatId,
//     { onMessage, onError },
//     opts?: { sseToken?: string; disableSSE?: boolean }
//   ) {
//     const startPolling = () => {
//       let stop = false;
//       let timer: any;
//       let lastSeen: string | null = null;

//       const tick = async () => {
//         if (stop) return;
//         try {
//           const { data } = await api.get(
//             `/api/chats/${encodeURIComponent(chatId)}/messages`,
//             { params: { limit: 50 } }
//           );
//           const items: ChatMessage[] = Array.isArray(data?.items)
//             ? data.items
//             : [];
//           const newOnes = items.filter((m) =>
//             lastSeen ? m.createdAt > lastSeen : true
//           );
//           if (newOnes.length) {
//             newOnes.forEach(onMessage);
//             lastSeen = newOnes[newOnes.length - 1].createdAt;
//           }
//         } catch (e) {
//           onError?.(e);
//         } finally {
//           if (!stop) timer = setTimeout(tick, 4000);
//         }
//       };

//       tick();
//       return () => {
//         stop = true;
//         if (timer) clearTimeout(timer);
//       };
//     };

//     if (
//       !opts?.disableSSE &&
//       typeof window !== "undefined" &&
//       "EventSource" in window
//     ) {
//       try {
//         const base = `/api/chats/stream?chatId=${encodeURIComponent(chatId)}`;
//         const url = opts?.sseToken
//           ? `${base}&token=${encodeURIComponent(opts.sseToken)}`
//           : base;
//         const es = new EventSource(url);

//         const onMsg = (e: MessageEvent) => {
//           try {
//             const payload = JSON.parse(e.data);
//             const m: ChatMessage = payload?.message;
//             if (m?.id) onMessage(m);
//           } catch {}
//         };

//         es.addEventListener("message", onMsg as any);
//         es.addEventListener("error", (e: any) => {
//           try {
//             es.close();
//           } catch {}
//           onError?.(e);
//         });

//         return () => {
//           try {
//             es.removeEventListener("message", onMsg as any);
//             es.close();
//           } catch {}
//         };
//       } catch (e) {
//         onError?.(e);
//       }
//     }
//     return startPolling();
//   },
// };

// const firebaseProvider: ChatService = {
//   async ensureChat() {
//     throw new Error("[chat/firebase] Not configured.");
//   },
//   async sendMessage() {
//     throw new Error("[chat/firebase] Not configured.");
//   },
//   async listMessages() {
//     throw new Error("[chat/firebase] Not configured.");
//   },
//   async listChats() {
//     throw new Error("[chat/firebase] Not Configured.");
//   },
//   subscribe() {
//     throw new Error("[chat/firebase] Not configured.");
//   },
// };

// const supabaseProvider: ChatService = {
//   async ensureChat() {
//     throw new Error("[chat/supabase] Not configured.");
//   },
//   async sendMessage() {
//     throw new Error("[chat/supabase] Not configured.");
//   },
//   async listMessages() {
//     throw new Error("[chat/supabase] Not configured.");
//   },
//   async listChats() {
//     throw new Error("[chat/supabase] Not configured.");
//   },
//   subscribe() {
//     throw new Error("[chat/supabase] Not configured.");
//   },
// };

// const providerName = (
//   process.env.NEXT_PUBLIC_CHAT_PROVIDER || "rest"
// ).toLowerCase();
// const providers: Record<string, ChatService> = {
//   rest: restProvider,
//   firebase: firebaseProvider,
//   supabase: supabaseProvider,
// };

// export const chatService: ChatService = providers[providerName] ?? restProvider;
// export const CHAT_PROVIDER = providerName;
