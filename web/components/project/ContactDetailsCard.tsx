// web/components/project/ContactDetailsCard.tsx
import * as React from "react";

type Contact = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type ContactStatus =
  | "unknown"
  | "not_unlocked"
  | "pending_admin_review"
  | "loaded"
  | "error";

type Props = {
  locked: boolean; // legacy hint – we’ll combine this with the actual data
  loading?: boolean;
  contact?: Contact | null;
  title?: string;
  onUpgrade?: () => void;
  /** Optional detailed status so we can show pending-review vs not-unlocked copy */
  status?: ContactStatus;
};

export default function ContactDetailsCard({
  locked,
  loading = false,
  contact,
  title = "Owner contact",
  onUpgrade,
  status = "unknown",
}: Props) {
  const name =
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || null;

  const hasEmail = !!contact?.email;

  // 🔑 TRUE lock state for the UI:
  // - if parent says "locked"
  // - OR we simply don't have an email
  const effectiveLocked = locked || !hasEmail;

  const isPendingReview = status === "pending_admin_review";
  const hasError = status === "error";

  const handleUpgradeClick = () => {
    if (onUpgrade) onUpgrade();
  };

  // Show the CTA whenever the card is effectively locked and not loading
  const shouldShowUpgradeButton = effectiveLocked && !loading && !!onUpgrade;

  return (
    <aside
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      data-testid="owner-contact-card"
    >
      <h2 className="text-sm sm:text-base font-semibold text-slate-900 mb-3">
        {title}
      </h2>

      {/* Loading state */}
      {loading && (
        <div className="space-y-2 text-sm text-slate-500">
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
        </div>
      )}

      {!loading && (
        <>
          {/* Unlocked and loaded: we only treat as unlocked if we actually have an email */}
          {!effectiveLocked && hasEmail ? (
            <div className="space-y-3 text-sm text-slate-800">
              {name && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Name
                  </div>
                  <div className="mt-0.5">{name}</div>
                </div>
              )}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Email
                </div>
                <a
                  href={`mailto:${contact!.email}`}
                  className="mt-0.5 inline-flex items-center text-sm font-medium text-emerald-700 hover:underline break-all"
                >
                  {contact!.email}
                </a>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Use this contact respectfully and only for this project.
              </p>
            </div>
          ) : (
            // Locked states (no contact visible)
            <div className="space-y-3 text-sm text-slate-700">
              {/* Pending admin review */}
              {isPendingReview && (
                <div
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
                  data-testid="owner-contact-pending-review"
                >
                  <p className="font-medium">
                    Your plan is being reviewed by VetMyBuilder.
                  </p>
                  <p className="mt-1 text-xs">
                    Once it&apos;s approved, you&apos;ll automatically see this
                    homeowner&apos;s contact details for eligible projects.
                  </p>
                </div>
              )}

              {/* Not unlocked / generic locked */}
              {!isPendingReview && (
                <div
                  className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] text-slate-700"
                  data-testid="owner-contact-locked"
                >
                  <p className="font-medium">Contact details are locked.</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Upgrade or purchase an unlock to see this homeowner&apos;s
                    email once your plan is approved.
                  </p>
                </div>
              )}

              {/* Error hint if something went wrong */}
              {hasError && (
                <p className="text-xs text-rose-600">
                  We couldn&apos;t check your entitlement just now. Try
                  refreshing the page or contact support if this keeps
                  happening.
                </p>
              )}

              {/* Upgrade CTA – always show when effectively locked */}
              {shouldShowUpgradeButton && (
                <button
                  type="button"
                  onClick={handleUpgradeClick}
                  className="mt-1 inline-flex h-9 items-center justify-center rounded-full bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-900/90"
                  data-testid="btn-upgrade-plan"
                >
                  View plans &amp; unlock contact
                </button>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
