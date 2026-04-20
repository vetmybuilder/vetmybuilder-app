import * as React from "react";
import { XCircle } from "lucide-react";

export type GetRecommendationsChannel = "whatsapp" | "sms" | "email" | null;

export interface GetRecommendationsModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm?: (opts: {
    channel: GetRecommendationsChannel;
  }) => void;
}

// Simple brand-style icons (SVG) -------------------------

function WhatsappIcon() {
  return (
    <div className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-[#25D366]">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4 fill-white"
      >
        <path d="M16.7 14.4c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.9 1.1-.3.2-.6.1-1.1-.4-2.1-1.3c-.8-.7-1.3-1.6-1.4-1.9s0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5s.1-.3 0-.5c-.1-.1-.6-1.5-.8-2.1-.3-.6-.5-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.7 1.1 2.9c.1.2 2 3.1 4.7 4.3.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.6-.6 1.8-1.2.2-.6.2-1.1.2-1.2s-.3-.2-.6-.3z" />
      </svg>
    </div>
  );
}

function AppleSmsIcon() {
  return (
    <div className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-2xl bg-[#34C759]">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4 fill-white"
      >
        <path d="M6 5c-1.7 0-3 1.3-3 3v4c0 1.7 1.3 3 3 3h4.5L13 18.5c.3.3.8.1.8-.3V15h4.2c1.7 0 3-1.3 3-3V8c0-1.7-1.3-3-3-3H6z" />
      </svg>
    </div>
  );
}

function EmailIcon() {
  return (
    <div className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-2xl bg-[#2563EB]">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4 fill-white"
      >
        <path d="M4 6c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h16c.6 0 1-.4 1-1V7c0-.6-.4-1-1-1H4zm1.4 2h13.2L12 12.7 5.4 8zM5 10.3l6.6 4.2c.2.1.5.1.8 0L19 10.3V16H5v-5.7z" />
      </svg>
    </div>
  );
}

// Modal -------------------------------------------------

export default function GetRecommendationsModal({
  open,
  onClose,
  onConfirm,
}: GetRecommendationsModalProps) {
  const [selectedChannel, setSelectedChannel] =
    React.useState<GetRecommendationsChannel>(null);

  // Reset state whenever the modal is reopened
  React.useEffect(() => {
    if (open) {
      setSelectedChannel(null);
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm?.({
      channel: selectedChannel,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-labelledby="get-recs-title"
      data-testid="get-recs-modal"
    >
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl shadow-zinc-200/60 animate-modal-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 id="get-recs-title" className="text-lg font-bold tracking-tight">
                Share with someone you know
              </h2>
              <p className="mt-1 text-sm text-red-100">
                Know someone who might recommend a good tradesperson? Send them your job directly.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
              data-testid="get-recs-close"
            >
              <XCircle size={22} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          {/* Channels */}
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
            Choose how to share
          </p>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setSelectedChannel("whatsapp")}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 px-3 py-4 text-sm font-semibold transition-all ${
                selectedChannel === "whatsapp"
                  ? "border-[#25D366] bg-emerald-50 text-emerald-800 shadow-sm scale-[1.02]"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
              data-testid="channel-whatsapp"
            >
              <WhatsappIcon />
              <span className="mt-2">WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedChannel("sms")}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 px-3 py-4 text-sm font-semibold transition-all ${
                selectedChannel === "sms"
                  ? "border-[#34C759] bg-green-50 text-green-800 shadow-sm scale-[1.02]"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
              data-testid="channel-sms"
            >
              <AppleSmsIcon />
              <span className="mt-2">SMS</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedChannel("email")}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 px-3 py-4 text-sm font-semibold transition-all ${
                selectedChannel === "email"
                  ? "border-blue-500 bg-blue-50 text-blue-800 shadow-sm scale-[1.02]"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
              data-testid="channel-email"
            >
              <EmailIcon />
              <span className="mt-2">Email</span>
            </button>
          </div>

          {/* Footer actions */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border-2 border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-50 transition-colors"
              data-testid="btn-cancel-get-recs"
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex-1 rounded-full bg-red-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 hover:shadow-xl transition-all disabled:opacity-60"
              disabled={!selectedChannel}
              data-testid="btn-confirm-get-recs"
              onClick={handleConfirm}
            >
              Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
