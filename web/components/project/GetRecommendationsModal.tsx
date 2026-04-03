import * as React from "react";
import { XCircle } from "lucide-react";

export type GetRecommendationsChannel = "whatsapp" | "sms" | "email" | null;

export interface GetRecommendationsModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm?: (opts: {
    neighbourhood: boolean;
    channel: GetRecommendationsChannel;
  }) => void;
  /** When true, neighbourhood sharing is disabled (already used) */
  neighbourhoodLocked?: boolean;
  /** If project is already live, primary button should just say "Share" */
  alreadyLive?: boolean;
}

// Simple brand-style icons (SVG) -------------------------

function WhatsappIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]">
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
    <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[#34C759]">
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
    <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[#2563EB]">
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
  neighbourhoodLocked = false,
  alreadyLive = false,
}: GetRecommendationsModalProps) {
  const [neighbourhoodEnabled, setNeighbourhoodEnabled] = React.useState(true);
  const [selectedChannel, setSelectedChannel] =
    React.useState<GetRecommendationsChannel>(null);

  // Reset state whenever the modal is reopened
  React.useEffect(() => {
    if (open) {
      // If locked, force neighbourhood off and disabled
      setNeighbourhoodEnabled(!neighbourhoodLocked);
      setSelectedChannel(null);
    }
  }, [open, neighbourhoodLocked]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm?.({
      neighbourhood: !neighbourhoodLocked && neighbourhoodEnabled,
      channel: selectedChannel,
    });
  };

  const primaryLabel = alreadyLive ? "Share" : "Share & Publish";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-labelledby="get-recs-title"
      data-testid="get-recs-modal"
    >
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="get-recs-title"
              className="text-lg font-semibold tracking-tight text-slate-900"
            >
              Get recommendations
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose how you’d like to get recommendations for this project.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
            data-testid="get-recs-close"
          >
            <XCircle size={18} />
          </button>
        </div>

        {/* Neighbourhood toggle */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">
                Neighbourhood
              </p>
              <p className="text-xs text-slate-500">
                Ask trusted neighbours and local contacts to recommend
                tradespeople.
              </p>
              {neighbourhoodLocked && (
                <p
                  className="mt-1 text-xs text-amber-600"
                  data-testid="neighbourhood-locked-message"
                >
                  You’ve already shared this project with your neighbourhood.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (neighbourhoodLocked) return;
                setNeighbourhoodEnabled((prev) => !prev);
              }}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition ${
                neighbourhoodEnabled && !neighbourhoodLocked
                  ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                  : "border-slate-300 bg-white text-slate-500"
              } ${
                neighbourhoodLocked
                  ? "opacity-60 cursor-not-allowed"
                  : "cursor-pointer"
              }`}
              data-testid="toggle-neighbourhood"
              aria-pressed={neighbourhoodEnabled && !neighbourhoodLocked}
              disabled={neighbourhoodLocked}
            >
              <span
                className={`mr-1 inline-block h-2 w-2 rounded-full ${
                  neighbourhoodEnabled && !neighbourhoodLocked
                    ? "bg-emerald-500"
                    : "bg-slate-300"
                }`}
              />
              {neighbourhoodLocked
                ? "Disabled"
                : neighbourhoodEnabled
                ? "Enabled"
                : "Disabled"}
            </button>
          </div>
        </div>

        {/* Channels */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Share via
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSelectedChannel("whatsapp")}
              className={`flex flex-col items-center justify-center rounded-xl border px-3 py-3 text-xs font-medium transition ${
                selectedChannel === "whatsapp"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              data-testid="channel-whatsapp"
            >
              <WhatsappIcon />
              <span className="mt-1">WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedChannel("sms")}
              className={`flex flex-col items-center justify-center rounded-xl border px-3 py-3 text-xs font-medium transition ${
                selectedChannel === "sms"
                  ? "border-sky-500 bg-sky-50 text-sky-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              data-testid="channel-sms"
            >
              <AppleSmsIcon />
              <span className="mt-1">SMS</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedChannel("email")}
              className={`flex flex-col items-center justify-center rounded-xl border px-3 py-3 text-xs font-medium transition ${
                selectedChannel === "email"
                  ? "border-red-400 bg-red-50 text-red-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
              data-testid="channel-email"
            >
              <EmailIcon />
              <span className="mt-1">Email</span>
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            data-testid="btn-cancel-get-recs"
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-600 disabled:opacity-60"
            disabled={false}
            data-testid="btn-confirm-get-recs"
            onClick={handleConfirm}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
