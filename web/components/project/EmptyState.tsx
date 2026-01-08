// web/components/project/EmptyState.tsx
import * as React from "react";

export type EmptyStateProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  dataTestId?: string;
};

/** Reusable empty/error state card used across project pages */
export default function EmptyState({
  title,
  description,
  actions,
  dataTestId,
}: EmptyStateProps) {
  return (
    <div
      className="mx-auto max-w-3xl p-6"
      data-testid={dataTestId ?? "empty-state"}
      aria-live="polite"
      role="status"
    >
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <p
          className="text-red-600 font-semibold"
          data-testid="empty-state-title"
        >
          {title}
        </p>
        {description && (
          <p
            className="mt-2 text-slate-700"
            data-testid="empty-state-description"
          >
            {description}
          </p>
        )}
        {actions && <div className="mt-4">{actions}</div>}
      </div>
    </div>
  );
}
