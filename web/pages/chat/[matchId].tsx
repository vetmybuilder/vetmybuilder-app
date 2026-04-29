// web/pages/chat/[matchId].tsx
//
// Bilateral chat thread between a matched homeowner and tradesman.
// Bare mobile layout (no site chrome).
// Real-time delivery via SSE "chat_message" event; 30-second safety poll for
// missed events.
//
// Supports:
//   - Photo attachments on outgoing messages (multipart upload, max 6, 10MB)
//   - Inline thumbnail strip + 3-up photo grid on incoming messages
//   - PhotoLightbox for tap-to-view + swipe-between
//   - Paid-unlock badge (homeowner-side only)

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { ChevronLeft, Send, Camera, X } from "lucide-react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import AuthedOnly from "@/components/AuthedOnly";
import FileGridUploader from "@/components/fileUpload/FileGridUploader";
import PhotoLightbox from "@/components/PhotoLightbox";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: number;
  senderUid: string;
  senderRole: "homeowner" | "tradesman";
  senderName: string;
  body: string;
  createdAt: string;
  attachments?: string[];
}

interface OtherParty {
  role: "homeowner" | "tradesman";
  uid: string;
  name: string;
  firstName: string | null;
}

interface Me {
  role: "homeowner" | "tradesman";
  uid: string;
}

interface ChatData {
  matchId: number;
  projectId: number;
  projectName: string;
  otherParty: OtherParty;
  me: Me;
  messages: ChatMessage[];
  source?: string;
}

// ─── Inline spinner SVG (matches ReportModal / PushPrompt pattern) ───────────

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
    </svg>
  );
}

// ─── Timestamp helpers ────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  const hhmm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return hhmm;
  if (isYesterday) return `yesterday ${hhmm}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${hhmm}`;
}

/** Returns true if a timestamp break should be shown between two messages. */
function shouldShowTimestamp(prev: ChatMessage | null, curr: ChatMessage): boolean {
  if (!prev) return true;
  const gap = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return gap > 5 * 60 * 1000; // 5 minutes
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────

/** Compute the SSE base URL (dev bypasses Next.js proxy). */
function getSseBase(): string {
  if (typeof window === "undefined") return "";
  const loc = window.location;
  if (loc.hostname === "localhost" && loc.port === "3000") {
    return `${loc.protocol}//localhost:3100`;
  }
  return loc.origin;
}

export default function ChatPage() {
  // AuthedOnly handles the unauth -> /login redirect and renders its own
  // loading state until Firebase has restored the user. Wrapping at the
  // top means ChatPageInner never mounts without a user, so on hard
  // reload we never get stuck on a bare "Loading…" with no fetch firing.
  return (
    <AuthedOnly>
      <ChatPageInner />
    </AuthedOnly>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const api = useApi();
  const { user, token: authToken, loading: authLoading } = useAuth();
  const matchId = router.query.matchId as string | undefined;

  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);

  // Photo upload state.
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [photoPopoverOpen, setPhotoPopoverOpen] = useState(false);

  // Lightbox state.
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latestMsgId = useRef<number>(0);
  // SSE connection ref
  const esRef = useRef<EventSource | null>(null);
  // Safety-poll ref (30-second interval)
  const safetyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Object URLs for the local thumbnail strip preview.
  const photoPreviews = useMemo(
    () => photos.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
    [photos],
  );
  useEffect(() => {
    return () => {
      photoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [photoPreviews]);

  // ── Fetch / merge messages ──────────────────────────────────────────────────

  const fetchMessages = useCallback(
    async (initial = false) => {
      if (!matchId) return;
      try {
        const res = await api.get(`/api/chat/${matchId}/messages`);
        const data: ChatData = res.data;
        setChatData((prev) => {
          if (!prev) return data;
          // Merge: append any messages with id > latestMsgId
          const existingIds = new Set(prev.messages.map((m) => m.id));
          const newMsgs = data.messages.filter((m) => !existingIds.has(m.id));
          if (newMsgs.length === 0) {
            // Still propagate top-level fields like `source` if they shifted.
            return { ...prev, source: data.source ?? prev.source };
          }
          return {
            ...prev,
            source: data.source ?? prev.source,
            messages: [...prev.messages, ...newMsgs],
          };
        });
        const maxId = Math.max(0, ...data.messages.map((m) => m.id));
        if (maxId > latestMsgId.current) {
          latestMsgId.current = maxId;
          if (!initial) scrollToBottom();
        }
        if (initial) {
          setLoading(false);
          setTimeout(() => scrollToBottom("instant"), 50);
        }
      } catch (err: any) {
        if (err?.response?.status === 403) {
          setForbidden(true);
        }
        if (initial) setLoading(false);
      }
    },
    [matchId, api, scrollToBottom],
  );

  // Initial load. Wait for Firebase to restore the user on hard reload
  // - the api interceptor needs `auth.currentUser` to attach a Bearer
  // token, otherwise the server 401s and we'd fall into "forbidden" /
  // permanent loading.
  useEffect(() => {
    if (!matchId) return;
    if (authLoading) return;
    if (!user) return;
    fetchMessages(true);
  }, [matchId, authLoading, user, fetchMessages]);

  // ── SSE real-time delivery + 30-second safety poll ─────────────────────────
  useEffect(() => {
    if (!matchId || !user) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // Safety poll - reconciles any missed SSE events
    safetyPollRef.current = setInterval(() => {
      if (!document.hidden) fetchMessages();
    }, 30000);

    async function connectSse() {
      if (cancelled) return;
      try {
        const fbAuth = (window as any).firebaseAuth;
        const freshToken = fbAuth?.currentUser
          ? await fbAuth.currentUser.getIdToken()
          : null;
        const token = freshToken || authToken;
        if (!token || cancelled) return;

        const sseBase = getSseBase();
        const url = `${sseBase}/api/notifications/stream?token=${encodeURIComponent(token)}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.addEventListener("chat_message", (ev: MessageEvent) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse(ev.data) as { matchId: number; message: ChatMessage };
            // Only apply if the event is for THIS conversation
            if (String(payload.matchId) !== String(matchId)) return;
            const newMsg = payload.message;
            setChatData((prev) => {
              if (!prev) return prev;
              const alreadyPresent = prev.messages.some((m) => m.id === newMsg.id);
              if (alreadyPresent) return prev;
              return { ...prev, messages: [...prev.messages, newMsg] };
            });
            if (newMsg.id > latestMsgId.current) {
              latestMsgId.current = newMsg.id;
              scrollToBottom();
            }
          } catch {
            /* ignore */
          }
        });

        es.onerror = () => {
          if (es) {
            es.close();
            esRef.current = null;
          }
          // One reconnect after 2 s
          if (!cancelled) {
            reconnectTimer = setTimeout(() => {
              if (!cancelled) connectSse();
            }, 2000);
          }
        };
      } catch {
        /* ignore token errors */
      }
    }

    connectSse();

    // Refetch on tab re-focus (catches missed events while hidden)
    const handleVisibility = () => {
      if (!document.hidden) fetchMessages();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      cancelled = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (safetyPollRef.current) clearInterval(safetyPollRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [matchId, user, authToken, fetchMessages, scrollToBottom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-grow textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  // Send message
  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (sending || !matchId || !chatData) return;
    if (trimmed.length === 0 && photos.length === 0) return;
    if (photos.length > 0 && !photoConsent) return;

    setSending(true);
    try {
      let res;
      if (photos.length > 0) {
        const fd = new FormData();
        fd.append("body", trimmed);
        for (const f of photos) fd.append("photos", f);
        res = await api.post(`/api/chat/${matchId}/messages`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        res = await api.post(`/api/chat/${matchId}/messages`, { body: trimmed });
      }
      const newMsg: ChatMessage = res.data;
      setChatData((prev) =>
        prev ? { ...prev, messages: [...prev.messages, newMsg] } : prev,
      );
      latestMsgId.current = Math.max(latestMsgId.current, newMsg.id);
      // Clear inputs on success.
      setInputValue("");
      setPhotos([]);
      setPhotoConsent(false);
      setPhotoPopoverOpen(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = "40px";
      }
      setTimeout(() => scrollToBottom(), 50);
    } catch {
      // Leave inputs in place so the user can retry.
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Lightbox: pool of every attachment in the thread (newest last) ─────────
  const allThreadPhotos = useMemo<string[]>(() => {
    if (!chatData) return [];
    const out: string[] = [];
    for (const m of chatData.messages) {
      if (m.attachments && m.attachments.length > 0) {
        for (const url of m.attachments) out.push(url);
      }
    }
    return out;
  }, [chatData]);

  function openLightboxFor(url: string) {
    const idx = allThreadPhotos.indexOf(url);
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxOpen(true);
  }

  // ── Render states ───────────────────────────────────────────────────────────

  if (forbidden) {
    return (
      <main
        className="fixed inset-0 bg-white flex flex-col items-center justify-center px-6 text-center"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
        }}
      >
        <div className="text-[40px] mb-4" aria-hidden>
          💬
        </div>
        <h1 className="text-[20px] font-extrabold text-gray-900">
          Conversation unavailable
        </h1>
        <p className="mt-2 text-[14px] text-gray-500 max-w-xs">
          This conversation is no longer available.
        </p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-6 px-6 py-3 rounded-2xl bg-gray-100 text-gray-800 font-bold text-[14px]"
        >
          Go back
        </button>
      </main>
    );
  }

  if (loading || !chatData) {
    return (
      <main
        className="fixed inset-0 bg-white flex items-center justify-center text-gray-400"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
        }}
      >
        Loading…
      </main>
    );
  }

  const { messages, otherParty, projectName, me, source } = chatData;
  const showPaidUnlockBadge =
    source === "paid_unlock" && me.role === "homeowner";

  const hasBody = inputValue.trim().length > 0;
  const hasPhotos = photos.length > 0;
  const sendDisabled =
    sending ||
    (!hasBody && !hasPhotos) ||
    (hasPhotos && !photoConsent);

  return (
    <>
      <main
        className="fixed inset-0 flex flex-col bg-white"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
        }}
      >
        {/* Safe-area top */}
        <div style={{ height: "env(safe-area-inset-top)" }} />

        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-extrabold text-gray-900 truncate">
              {otherParty.name}
            </div>
            <div className="text-[11px] text-gray-400 font-medium truncate">
              {projectName}
            </div>
          </div>
        </div>

        {/* Paid-unlock badge (homeowner only) */}
        {showPaidUnlockBadge && (
          <div
            className="px-4 pt-2 flex items-center gap-2 shrink-0"
            data-testid="paid-unlock-badge"
          >
            <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              ⚡ Paid unlock
            </span>
            <span className="text-[10px] text-slate-500">
              Builder paid to message you
            </span>
          </div>
        )}

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="text-center text-[13px] text-gray-400 mt-8">
              No messages yet. Say hello!
            </div>
          )}
          {messages.map((msg, i) => {
            const prev = i > 0 ? messages[i - 1]! : null;
            const showTs = shouldShowTimestamp(prev, msg);
            const isMine = msg.senderUid === me.uid;
            const atts = msg.attachments || [];
            const hasBodyText = msg.body && msg.body.length > 0;

            // Choose grid layout based on attachment count.
            let gridClass = "grid grid-cols-3 gap-1";
            let imgClass = "aspect-square object-cover w-full rounded-xl";
            if (atts.length === 1) {
              gridClass = "grid grid-cols-1";
              imgClass =
                "object-cover rounded-xl max-w-[200px] max-h-[260px]";
            } else if (atts.length === 2) {
              gridClass = "grid grid-cols-2 gap-1";
            }

            return (
              <div key={msg.id}>
                {showTs && (
                  <div className="text-center text-[10.5px] text-gray-400 font-medium my-3">
                    {formatTimestamp(msg.createdAt)}
                  </div>
                )}
                <div
                  className={`flex mb-1.5 ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex flex-col gap-1 max-w-[78%] ${
                      isMine ? "items-end" : "items-start"
                    }`}
                  >
                    {hasBodyText && (
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-[14px] leading-[1.45] whitespace-pre-wrap break-words ${
                          isMine
                            ? "bg-emerald-100 text-emerald-900 rounded-br-sm"
                            : "bg-gray-100 text-gray-900 rounded-bl-sm"
                        }`}
                      >
                        {msg.body}
                      </div>
                    )}
                    {atts.length > 0 && (
                      <div
                        className={gridClass}
                        data-testid={`chat-msg-attachments-${msg.id}`}
                      >
                        {atts.map((url, ai) => (
                          <button
                            key={`${msg.id}-${ai}`}
                            type="button"
                            onClick={() => openLightboxFor(url)}
                            className="block focus:outline-none"
                            aria-label={`Open photo ${ai + 1}`}
                          >
                            <img
                              src={url}
                              alt=""
                              className={imgClass}
                              draggable={false}
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input area (popover sits ABOVE the textarea row when open) */}
        <div
          className="shrink-0 border-t border-gray-100 bg-white"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        >
          {photoPopoverOpen && (
            <div
              className="px-4 pt-3 pb-2"
              data-testid="chat-photo-popover"
            >
              <div className="rounded-2xl border border-slate-200 bg-white shadow-lg p-3">
                <FileGridUploader
                  files={photos}
                  onChange={setPhotos}
                  maxFiles={6}
                  maxSizeMB={10}
                  tone="emerald"
                  emeraldLabel="Add photos to your message"
                  onConsentChange={setPhotoConsent}
                />
              </div>
            </div>
          )}

          {/* Pre-send thumbnail strip (visible whenever photos > 0,
              regardless of popover open state) */}
          {hasPhotos && (
            <div
              className="px-4 pt-3 flex gap-2 overflow-x-auto"
              data-testid="chat-photo-strip"
            >
              {photoPreviews.map((p, i) => (
                <div
                  key={`${p.url}-${i}`}
                  className="relative shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-slate-200"
                >
                  <img
                    src={p.url}
                    alt={p.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => {
                      const next = photos.filter((_, idx) => idx !== i);
                      setPhotos(next);
                      if (next.length === 0) {
                        setPhotoConsent(false);
                      }
                    }}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className="px-4 pt-3 flex items-end gap-2">
            <button
              type="button"
              onClick={() => setPhotoPopoverOpen((v) => !v)}
              aria-label={
                photoPopoverOpen ? "Close photo picker" : "Add photos"
              }
              aria-pressed={photoPopoverOpen}
              data-testid="chat-photo-toggle"
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                photoPopoverOpen
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <Camera size={18} />
            </button>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[16px] text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-0 transition-colors overflow-hidden"
              style={{ minHeight: "40px", maxHeight: "120px" }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sendDisabled}
              aria-label="Send message"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                !sendDisabled
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-300"
              }`}
            >
              {sending ? <Spinner className="h-4 w-4" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </main>

      <PhotoLightbox
        open={lightboxOpen}
        photos={allThreadPhotos}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
