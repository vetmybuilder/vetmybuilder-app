// web/components/tradesman/ContactLink.tsx
//
// Icon + value/empty-state row for the Contact details card on the
// /tradesman/[id] public profile. When the value is locked (phone /
// email are intentionally never returned by the public profile API
// pre-match), the empty state can be overridden via `emptyText` so
// the row reads e.g. "Available after a mutual match" instead of the
// misleading default "Not provided".

import type { ReactNode } from "react";

type ContactLinkProps = {
  icon: ReactNode;
  value?: string | null;
  href?: string;
  testId?: string;
  emptyText?: string;
};

export default function ContactLink({
  icon,
  value,
  href,
  testId,
  emptyText = "Not provided",
}: ContactLinkProps) {
  if (!value) {
    return (
      <div
        className="flex items-center gap-2.5 text-[13px] text-slate-400"
        data-testid={testId}
      >
        <span className="text-amber-500">{icon}</span>
        <span>{emptyText}</span>
      </div>
    );
  }
  if (!href) {
    return (
      <div
        className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-700"
        data-testid={testId}
      >
        <span className="text-amber-500">{icon}</span>
        <span className="truncate">{value}</span>
      </div>
    );
  }
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="flex items-center gap-2.5 text-[13px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
      data-testid={testId}
    >
      <span className="text-amber-500">{icon}</span>
      <span className="truncate">{value}</span>
    </a>
  );
}
