// web/components/header/MessagesIconButton.tsx
//
// Shared messages-icon trigger + dropdown shell used by both the
// homeowner and trade headers in SiteHeader. Owns:
//   - the toggle (click to open / click again to close)
//   - the unread badge
//   - the ref wiring required by SiteHeader's outside-click handler
//
// The actual dropdown body is supplied by the caller via
// `renderDropdown` because the homeowner uses InboxDropdown (indigo +
// /api/matches) and the trade uses TradesmanInboxDropdown (emerald +
// /api/tradesman/matches). Keeping the body separate avoids coupling
// this shell to either data source.
//
// `popDockOnOpen` mirrors the homeowner's existing behaviour where
// tapping the icon also pops the bottom-right MessagingDock open via
// the shared `vmb:openDock` window event. Off by default; the trade
// side leaves the dock collapsed until a thread is explicitly tapped.

import type { MutableRefObject } from "react";
import { MessageSquare } from "lucide-react";

interface Props {
  buttonRef: MutableRefObject<HTMLButtonElement | null>;
  menuRef: MutableRefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onToggle: () => void;
  unread: number;
  tone: "indigo" | "emerald";
  testId: string;
  popDockOnOpen?: boolean;
  renderDropdown: () => React.ReactNode;
}

export default function MessagesIconButton({
  buttonRef,
  menuRef,
  isOpen,
  onToggle,
  unread,
  tone,
  testId,
  popDockOnOpen = false,
  renderDropdown,
}: Props) {
  // Tuned for the dark slate-950 navbar (2026-05): the hover bg is now a
  // darker slate so it's visible on the dark chrome (previously the
  // light amber/emerald hovers disappeared into the navbar), and the
  // badge ring matches the navbar so the unread pip reads as a clean
  // counter rather than a cream donut.
  const palette =
    tone === "emerald"
      ? { hoverBg: "hover:bg-emerald-900/40", badgeBg: "bg-emerald-500" }
      : { hoverBg: "hover:bg-indigo-900/40", badgeBg: "bg-indigo-500" };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Messages"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          onToggle();
          if (popDockOnOpen && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("vmb:openDock"));
          }
        }}
        data-testid={testId}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full ${palette.hoverBg} transition-colors`}
      >
        <MessageSquare className="h-6 w-6 text-slate-200" />
        {unread > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full ${palette.badgeBg} text-white text-[10px] font-bold px-1 ring-2 ring-slate-950`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {isOpen && <div ref={menuRef}>{renderDropdown()}</div>}
    </div>
  );
}
