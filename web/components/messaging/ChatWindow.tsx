// web/components/messaging/ChatWindow.tsx
//
// Floating chat panel anchored to the bottom-right of the viewport, sized
// to ~320x460. Multiple ChatWindows stack horizontally to the left of the
// MessagingDock. Reuses /api/chat/:matchId/messages + the chat_message SSE
// event for real-time delivery. Photo attachments + lightbox supported.

import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useSseEvent } from "@/utils/useSseEvent";
import PhotoLightbox from "@/components/PhotoLightbox";
import TradesmanProfileModal from "@/components/project/TradesmanProfileModal";

interface ChatMessage {
  id: number;
  senderUid: string;
  senderRole: "homeowner" | "tradesman";
  senderName: string;
  body: string;
  attachments?: string[];
  createdAt: string;
}

interface ChatData {
  matchId: number;
  projectId: number;
  projectName: string;
  otherParty: {
    role: string;
    uid: string;
    name: string;
    firstName: string | null;
    avatarUrl?: string | null;
  };
  me: { role: string; uid: string };
  messages: ChatMessage[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatWindow({
  matchId,
  rightOffset,
  onClose,
  onMinimize,
  minimized,
  variant = "floating",
}: {
  matchId: number;
  /** Distance from the right edge of the viewport, in pixels. Only used
   *  by the floating variant. The parent dock host computes this so
   *  multiple windows stack cleanly. */
  rightOffset?: number;
  onClose?: () => void;
  onMinimize?: () => void;
  minimized?: boolean;
  /** "floating" (default) - fixed bottom-right pill the dock pops open.
   *  "inline" - fills the parent container, no positioning of its own,
   *  no close/minimize chrome. Used by /tradesman/matches to embed
   *  the chat directly in the right pane of the split view. */
  variant?: "floating" | "inline";
}) {
  const api = useApi();
  const { user } = useAuth();
  const [data, setData] = useState<ChatData | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [lightboxPhotos, setLightboxPhotos] = useState<{
    photos: string[];
    index: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: d } = await api.get<ChatData>(
          `/api/chat/${matchId}/messages`,
        );
        if (alive) setData(d);
      } catch {
        if (alive) setData(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [matchId, api]);

  useSseEvent<{ matchId: number; message: ChatMessage }>(
    "chat_message",
    (payload) => {
      if (!payload || Number(payload.matchId) !== Number(matchId)) return;
      setData((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === payload.message.id)) return prev;
        return { ...prev, messages: [...prev.messages, payload.message] };
      });
    },
  );

  useEffect(() => {
    if (minimized) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [data?.messages?.length, minimized]);

  const myUid = data?.me?.uid;
  const otherFirst =
    data?.otherParty?.firstName || data?.otherParty?.name || "them";
  const otherName = data?.otherParty?.name || "Loading...";

  async function send() {
    const body = draft.trim();
    const hasPhotos = photos.length > 0;
    if ((!body && !hasPhotos) || sending || !data) return;
    setSending(true);
    try {
      let posted: ChatMessage;
      if (hasPhotos) {
        const fd = new FormData();
        fd.append("body", body);
        for (const f of photos) fd.append("photos", f);
        const res = await api.post<ChatMessage>(
          `/api/chat/${matchId}/messages`,
          fd,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        posted = res.data;
      } else {
        const res = await api.post<ChatMessage>(
          `/api/chat/${matchId}/messages`,
          { body },
        );
        posted = res.data;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.some((m) => m.id === posted.id)
                ? prev.messages
                : [...prev.messages, posted],
            }
          : prev,
      );
      setDraft("");
      setPhotos([]);
    } catch {
      /* leave draft + photos for retry */
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const next = [...photos, ...Array.from(list)].slice(0, 6);
    setPhotos(next);
    e.target.value = "";
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  const messages = useMemo(() => data?.messages || [], [data?.messages]);

  // Tone follows the viewer's role: tradesmen see emerald (matches the
  // rest of their UI), homeowners see indigo (matches /projects/[id]
  // chrome). All gradient + accent-colour decisions reuse this so
  // there's a single switch instead of N conditional className strings.
  // Read role from the auth context first - it's known instantly so
  // there's no indigo-then-emerald flash on first paint while the
  // /api/chat/.../messages fetch is in flight. Fall back to the API's
  // me.role once it lands (defensive: same value, but cheap to keep).
  const isTradesViewer =
    !!user?.isTradesman || data?.me?.role === "tradesman";
  const tone = isTradesViewer
    ? {
        gradient: "linear-gradient(135deg, #10b981, #059669)",
        textOnLight: "text-emerald-700",
        borderHover: "hover:border-emerald-300",
        focusBorder: "focus:border-emerald-400",
        hoverText: "hover:text-emerald-700",
      }
    : {
        gradient: "linear-gradient(135deg, #6366f1, #4f46e5)",
        textOnLight: "text-indigo-700",
        borderHover: "hover:border-indigo-300",
        focusBorder: "focus:border-indigo-400",
        hoverText: "hover:text-indigo-700",
      };

  const isInline = variant === "inline";

  return (
    <>
      <div
        className={
          isInline
            ? "h-full w-full flex flex-col bg-white border border-amber-100 rounded-3xl shadow-sm overflow-hidden"
            : "fixed bottom-0 z-40 hidden md:flex flex-col bg-white border border-amber-100 rounded-t-2xl shadow-2xl overflow-hidden"
        }
        style={
          isInline
            ? undefined
            : {
                right: `${rightOffset ?? 0}px`,
                width: "320px",
                height: minimized ? "44px" : "460px",
                transition: "height 0.2s ease",
              }
        }
        role="dialog"
        aria-label={`Chat with ${otherName}`}
      >
        {/* Header - clickable to open profile (floating only). Inline
            variant doesn't minimize, so the header isn't clickable. */}
        <div
          className={`px-3 py-2.5 flex items-center justify-between gap-2 text-white shrink-0 ${isInline ? "" : "cursor-pointer"}`}
          style={{ backgroundImage: tone.gradient }}
          onClick={isInline ? undefined : onMinimize}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (data?.otherParty?.uid) setProfileOpen(true);
            }}
            disabled={!data?.otherParty?.uid}
            className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-90 disabled:cursor-default"
          >
            {data?.otherParty?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.otherParty.avatarUrl}
                alt=""
                className="w-7 h-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className={`w-7 h-7 shrink-0 rounded-full bg-white/95 ${tone.textOnLight} flex items-center justify-center text-[12px] font-black`}>
                {(otherName || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div
                className="text-[13px] font-extrabold tracking-tight truncate"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                {otherName}
              </div>
              {data?.projectName && (!minimized || isInline) && (
                <div className="text-[10.5px] opacity-80 truncate">
                  {data.projectName}
                </div>
              )}
            </div>
          </button>
          {/* Minimize + close are floating-only chrome - inline embed
              has no notion of either action. */}
          {!isInline && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMinimize?.();
              }}
              aria-label={minimized ? "Expand" : "Minimize"}
              className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                {minimized ? <polyline points="18 15 12 9 6 15" /> : <line x1="6" y1="12" x2="18" y2="12" />}
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
              aria-label="Close chat"
              className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          )}
        </div>

        {(!minimized || isInline) && (
          <>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {!data ? (
                <div className="h-full flex items-center justify-center text-[12px] text-slate-400">
                  Loading chat...
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-xl">
                    {"\u{1F389}"}
                  </div>
                  <p className="mt-3 text-[12.5px] text-slate-600 leading-relaxed">
                    You matched with {otherFirst}. Say hi to get the conversation started.
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.senderUid === myUid;
                  const atts = Array.isArray(m.attachments) ? m.attachments : [];
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-snug shadow-sm ${
                          mine ? "text-white" : "bg-amber-50/80 border border-amber-100 text-slate-800"
                        }`}
                        style={mine ? { backgroundImage: tone.gradient } : undefined}
                      >
                        {atts.length > 0 && (
                          <div className="grid grid-cols-3 gap-1 mb-1.5">
                            {atts.map((url, i) => (
                              <button
                                key={`${m.id}-att-${i}`}
                                type="button"
                                onClick={() => setLightboxPhotos({ photos: atts, index: i })}
                                className="aspect-square rounded-md overflow-hidden bg-slate-200/40"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        )}
                        {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                        <div className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-slate-400"}`}>
                          {formatTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Composer */}
            <div className="px-2.5 pb-2.5 pt-2 border-t border-amber-100 bg-amber-50/40 shrink-0">
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5 px-1">
                  {photos.map((file, i) => (
                    <div key={`${file.name}-${i}`} className="relative w-10 h-10 rounded-md overflow-hidden bg-slate-100 border border-amber-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        aria-label="Remove photo"
                        className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-slate-900/70 text-white flex items-center justify-center text-[8px] hover:bg-slate-900"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onFilesPicked} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || !data || photos.length >= 6}
                  aria-label="Attach photos"
                  className={`w-8 h-8 shrink-0 rounded-full bg-white border border-amber-100 flex items-center justify-center text-slate-500 ${tone.hoverText} ${tone.borderHover} disabled:opacity-50 disabled:cursor-not-allowed transition`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={`Message ${otherFirst}`}
                  disabled={sending || !data}
                  className={`flex-1 rounded-full bg-white border border-amber-100 px-3 py-1.5 text-[12.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none ${tone.focusBorder}`}
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={(!draft.trim() && photos.length === 0) || sending || !data}
                  aria-label="Send"
                  className="w-8 h-8 shrink-0 rounded-full text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition"
                  style={{ backgroundImage: tone.gradient }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <TradesmanProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        builderUid={data?.otherParty?.uid || null}
      />

      <PhotoLightbox
        open={lightboxPhotos !== null}
        photos={lightboxPhotos?.photos || []}
        initialIndex={lightboxPhotos?.index ?? 0}
        onClose={() => setLightboxPhotos(null)}
      />
    </>
  );
}
