import * as React from "react";

type Contact = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type Props = {
  /** When true, card appears dimmed and shows Upgrade CTA */
  locked?: boolean;
  /** Loading state for when the contact details are being fetched */
  loading?: boolean;
  /** Contact data to display (ignored while loading) */
  contact?: Contact | null;

  /** Called when the “Upgrade” button is pressed (in locked state) */
  onUpgrade?: () => void;

  /** Optional visual tweaks */
  title?: string;
  className?: string;
  /** Allow extra content at the bottom if needed */
  footer?: React.ReactNode;
};

export default function ContactDetailsCard({
  locked = false,
  loading = false,
  contact,
  onUpgrade,
  title = "Contact details",
  className = "",
  footer,
}: Props) {
  const shellCls = "rounded-xl border bg-white shadow-sm px-5 py-4 transition";

  return (
    <section
      className={[shellCls, locked ? "opacity-60" : "", className].join(" ")}
      aria-labelledby="contact-details-title"
      data-testid="contact-details-card"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3
          id="contact-details-title"
          className="text-base font-semibold text-slate-900"
        >
          {title}
        </h3>

        {locked && typeof onUpgrade === "function" && (
          <button
            type="button"
            onClick={onUpgrade}
            className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-500"
            data-testid="btn-upgrade"
          >
            Upgrade
          </button>
        )}
      </div>

      {/* Body */}
      {locked ? (
        <p className="text-sm text-slate-600" data-testid="locked-msg">
          Upgrade your plan to view the project owner’s contact details. One-off
          unlock is available in the plan picker.
        </p>
      ) : loading ? (
        <div className="space-y-3" data-testid="loading-skeleton">
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-3" data-testid="contact-data">
          <div>
            <dt className="text-xs font-medium text-slate-500">First name</dt>
            <dd className="text-sm font-semibold text-slate-900">
              {safe(contact?.firstName)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Last name</dt>
            <dd className="text-sm font-semibold text-slate-900">
              {safe(contact?.lastName)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Email</dt>
            <dd className="text-sm font-mono text-slate-900 break-all">
              {safe(contact?.email)}
            </dd>
          </div>
        </dl>
      )}

      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}

function safe(v?: string | null) {
  return v && String(v).trim() ? v : "—";
}
