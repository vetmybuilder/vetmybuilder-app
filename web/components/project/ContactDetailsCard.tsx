// web/components/project/ContactDetailsCard.tsx
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
  title = "Homeowner contact",
  className = "",
  footer,
}: Props) {
  const shellCls =
    "rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm";

  return (
    <section
      className={[shellCls, className].join(" ")}
      aria-labelledby="contact-details-title"
      data-testid="contact-details-card"
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3
          id="contact-details-title"
          className="text-lg font-semibold text-slate-900"
        >
          {title}
        </h3>

        {locked && typeof onUpgrade === "function" && (
          <button
            type="button"
            onClick={onUpgrade}
            className="rounded-full bg-indigo-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            data-testid="btn-upgrade"
          >
            Upgrade
          </button>
        )}
      </div>

      {/* Body */}
      {locked ? (
        <p
          className="text-sm leading-relaxed text-slate-600"
          data-testid="locked-msg"
        >
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
        <>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Contact details
          </div>

          <dl
            className="grid grid-cols-1 gap-4 text-sm"
            data-testid="contact-data"
          >
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                First name
              </dt>
              <dd className="mt-0.5 text-base font-semibold text-emerald-700">
                {safe(contact?.firstName)}
              </dd>
            </div>

            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                Last name
              </dt>
              <dd className="mt-0.5 text-base font-semibold text-emerald-700">
                {safe(contact?.lastName)}
              </dd>
            </div>

            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                Email
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-emerald-700 break-all">
                {safe(contact?.email)}
              </dd>
            </div>
          </dl>
        </>
      )}

      {footer ? <div className="mt-5">{footer}</div> : null}
    </section>
  );
}

function safe(v?: string | null) {
  return v && String(v).trim() ? v : "—";
}
