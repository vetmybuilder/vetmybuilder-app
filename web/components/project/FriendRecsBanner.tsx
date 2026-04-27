// web/components/project/FriendRecsBanner.tsx
//
// Conditional banner shown above the swipe-deck "all caught up" CTAs.
// Renders only when the project has off-platform recommendations
// (count > 0). Tapping navigates to the friend-recs page.

import { useRouter } from "next/router";
import { Users } from "lucide-react";

type Props = {
  projectId: string;
  count: number;
};

export default function FriendRecsBanner({ projectId, count }: Props) {
  const router = useRouter();
  if (!count || count <= 0) return null;

  return (
    <button
      type="button"
      onClick={() => router.push(`/projects/${projectId}/friend-recs`)}
      className="w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl border-[1.5px] border-amber-300"
      style={{
        background: "linear-gradient(135deg, #fef3c7, #fde68a)",
      }}
      data-testid="friend-recs-banner"
    >
      <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0">
        <Users className="w-[18px] h-[18px] text-amber-700" />
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-[12.5px] font-extrabold text-amber-900">
          {count} friend rec{count === 1 ? "" : "s"} - pending claim
        </span>
        <span className="block text-[11px] text-amber-800 mt-0.5 truncate">
          Tap to view
        </span>
      </span>
      <span className="text-amber-900 text-[16px] font-extrabold">›</span>
    </button>
  );
}
