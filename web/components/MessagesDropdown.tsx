// Placeholder messages dropdown rendered from SiteHeader.
//
// Visual chrome only - no thread data wired up yet. When the real
// /api/matches integration lands, replace the empty state with the
// fetched thread list and update placeholderUnreadCount to return the
// live unread count for the header badge.
import Link from "next/link";
import { MessageSquare } from "lucide-react";

export default function MessagesDropdown({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute right-0 top-12 z-50 w-[360px] max-w-[calc(100vw-32px)] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      role="menu"
      aria-label="Messages"
    >
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <span className="font-extrabold text-slate-900">Messages</span>
        <Link
          href="/matches"
          onClick={onClose}
          className="text-[12px] font-semibold text-indigo-600 hover:underline"
        >
          View all
        </Link>
      </div>
      <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <MessageSquare className="h-5 w-5 text-amber-600" />
        </span>
        <p className="text-[13.5px] font-extrabold text-slate-900">No messages yet</p>
        <p className="text-[12.5px] text-slate-500">
          When tradespeople reply to your jobs, your conversations will appear here.
        </p>
      </div>
    </div>
  );
}

// Exposed so SiteHeader can render the count badge from the same source
// of truth. Returns 0 until real data is wired in.
export function placeholderUnreadCount(): number {
  return 0;
}
