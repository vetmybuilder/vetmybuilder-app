// web/components/project/InlineChatPanel.tsx
//
// Compact chat thread embedded in the homeowner's /projects/:id desktop
// right rail. Activates when a match forms on the swipe deck so the user
// can start chatting without leaving the page.
//
// Scope: text only for v1. Photo attachments + the rich timestamp / role
// rendering live in /chat/:matchId.tsx; this panel keeps the surface
// small enough to fit alongside the deck.

import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/utils/api";
import { useSseEvent } from "@/utils/useSseEvent";
import TradesmanProfileModal from "./TradesmanProfileModal";
import PhotoLightbox from "@/components/PhotoLightbox";

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
  otherParty: { role: string; uid: string; name: string; firstName: string | null };
  me: { role: string; uid: string };
  messages: ChatMessage[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function InlineChatPanel({ matchId }: { matchId: number }) {
  const api = useApi();
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

  // Real-time: a new chat message arrived
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

  // Auto-scroll to the newest message
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [data?.messages?.length]);

  const myUid = data?.me?.uid;
  const otherFirst = data?.otherParty?.firstName || data?.otherParty?.name || "them";

  async function send() {
    const body = draft.trim();
    const hasPhotos = photos.length > 0;
    if ((!body && !hasPhotos) || sending || !data) return;
    setSending(true);
    try {
      let posted: ChatMessage;
      if (hasPhotos) {
        // Multipart upload mirrors /chat/[matchId].tsx - server accepts
        // 'body' string + 'photos' file array, max 6.
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

  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const next = [...photos, ...Array.from(list)].slice(0, 6);
    setPhotos(next);
    // Reset input so the same file can be re-picked after a remove
    e.target.value = "";
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const messages = useMemo(() => data?.messages || [], [data?.messages]);

  return (
    <div
      className="bg-white border border-amber-100 rounded-3xl shadow-sm flex flex-col overflow-hidden"
      style={{ height: "clamp(380px, 58vh, 520px)" }}
    >
      {/* Header - clickable, opens the tradesperson profile modal */}
      <button
        type="button"
        onClick={() => data?.otherParty?.uid && setProfileOpen(true)}
        disabled={!data?.otherParty?.uid}
        className="px-5 pt-5 pb-3 border-b border-amber-100 text-left hover:bg-indigo-50/30 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
        aria-label="Open tradesperson profile"
      >
        <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-0.5">
          Matched
        </div>
        <div className="flex items-center gap-1.5">
          <h3
            className="text-[15px] font-black tracking-tight text-slate-900 truncate"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            {data?.otherParty?.name || "Loading..."}
          </h3>
          {data?.otherParty?.uid && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-400 shrink-0"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
        </div>
      </button>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
      >
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
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-snug shadow-sm ${
                    mine
                      ? "text-white"
                      : "bg-amber-50/80 border border-amber-100 text-slate-800"
                  }`}
                  style={
                    mine
                      ? {
                          backgroundImage:
                            "linear-gradient(135deg, #6366f1, #4f46e5)",
                        }
                      : undefined
                  }
                >
                  {atts.length > 0 && (
                    <div className="grid grid-cols-3 gap-1 mb-1.5">
                      {atts.map((url, i) => (
                        <button
                          key={`${m.id}-att-${i}`}
                          type="button"
                          onClick={() =>
                            setLightboxPhotos({ photos: atts, index: i })
                          }
                          className="aspect-square rounded-md overflow-hidden bg-slate-200/40"
                          aria-label={`Open photo ${i + 1}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  {m.body && (
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  )}
                  <div
                    className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-slate-400"}`}
                  >
                    {formatTime(m.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="px-3 pb-3 pt-2 border-t border-amber-100 bg-amber-50/40">
        {/* Selected-photo previews above the input. Capped at 6 by send(). */}
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-1">
            {photos.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-100 border border-amber-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(file)}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  aria-label="Remove photo"
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900/70 text-white flex items-center justify-center text-[9px] hover:bg-slate-900"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFilesPicked}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || !data || photos.length >= 6}
            aria-label="Attach photos"
            className="w-9 h-9 shrink-0 rounded-full bg-white border border-amber-100 flex items-center justify-center text-slate-500 hover:text-indigo-700 hover:border-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
            className="flex-1 rounded-full bg-white border border-amber-100 px-3.5 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 disabled:bg-slate-50 focus:outline-none focus:border-indigo-400"
          />
          <button
            type="button"
            onClick={send}
            disabled={(!draft.trim() && photos.length === 0) || sending || !data}
            aria-label="Send"
            className="w-9 h-9 shrink-0 rounded-full text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition"
            style={{
              backgroundImage: "linear-gradient(135deg, #6366f1, #4f46e5)",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
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
    </div>
  );
}
