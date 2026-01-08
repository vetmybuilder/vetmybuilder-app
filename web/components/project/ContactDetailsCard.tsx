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
  | "error"
  // new, for verification + payment flow
  | "verification_required"
  | "verification_pending"
  | "verification_rejected"
  | "payment_required"
  | "unlock_rejected";

type Props = {
  locked: boolean;
  loading?: boolean;
  contact?: Contact | null;
  title?: string;
  onUpgrade?: () => void;
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

  const effectiveLocked = locked || !hasEmail;

  const isPendingReview = status === "pending_admin_review";
  const hasError = status === "error";

  const isVerificationRequired = status === "verification_required";
  const isVerificationPending = status === "verification_pending";
  const isVerificationRejected = status === "verification_rejected";

  const isPaymentRequired = status === "payment_required";
  const isUnlockRejected = status === "unlock_rejected";

  const isNotUnlocked = status === "not_unlocked" || status === "unknown";

  const shouldShowUpgradeButton = effectiveLocked && !loading && !!onUpgrade;

  // Label + copy for the main CTA button depending on state
  let primaryCtaLabel = "View plans & unlock contact";
  if (isVerificationRequired || isVerificationRejected) {
    primaryCtaLabel = "Start verification & request access";
  } else if (isVerificationPending) {
    primaryCtaLabel = "View my verification status";
  } else if (isPaymentRequired) {
    primaryCtaLabel = "Choose a plan & unlock contact";
  }

  return (
    <aside
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      data-testid="owner-contact-card"
    >
      <h2 className="text-sm sm:text-base font-semibold text-slate-900 mb-3">
        {title}
      </h2>

      {loading && (
        <div className="space-y-2 text-sm text-slate-500">
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
        </div>
      )}

      {!loading && (
        <>
          {/* UNLOCKED: show full contact */}
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
            // LOCKED STATES
            <div className="space-y-3 text-sm text-slate-700">
              {/* VERIFICATION REQUIRED / PENDING / REJECTED */}
              {(isVerificationRequired ||
                isVerificationPending ||
                isVerificationRejected) && (
                <div
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
                  data-testid="owner-contact-verification-state"
                >
                  {isVerificationRequired && (
                    <>
                      <p className="font-medium">
                        We need to verify your account before sharing contacts.
                      </p>
                      <p className="mt-1 text-xs">
                        Upload your insurance and supporting documents so we can
                        complete your VetMyBuilder verification. Once approved,
                        you&apos;ll be able to unlock homeowner contact details.
                      </p>
                    </>
                  )}

                  {isVerificationPending && (
                    <>
                      <p className="font-medium">
                        Your verification is being reviewed.
                      </p>
                      <p className="mt-1 text-xs">
                        Our team is checking your documents. You&apos;ll be able
                        to choose a plan and unlock contact details once
                        verification is approved.
                      </p>
                    </>
                  )}

                  {isVerificationRejected && (
                    <>
                      <p className="font-medium">
                        Your verification needs attention.
                      </p>
                      <p className="mt-1 text-xs">
                        Something wasn&apos;t right with the documents we
                        received. Please review and re-submit updated insurance
                        or supporting documents to continue.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* PAYMENT REQUIRED (verification approved, but no unlock yet) */}
              {isPaymentRequired && (
                <div
                  className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] text-slate-700"
                  data-testid="owner-contact-payment-required"
                >
                  <p className="font-medium">
                    Verification approved – choose a plan to unlock contact.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Your documents are approved. Select a one-off unlock or
                    subscription plan to see this homeowner&apos;s contact
                    details.
                  </p>
                </div>
              )}

              {/* UNLOCK PENDING ADMIN REVIEW (for a one-off unlock or plan approval) */}
              {isPendingReview &&
                !isPaymentRequired &&
                !isVerificationPending && (
                  <div
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
                    data-testid="owner-contact-pending-review"
                  >
                    <p className="font-medium">
                      Your request is being reviewed by VetMyBuilder.
                    </p>
                    <p className="mt-1 text-xs">
                      Once it&apos;s approved, you&apos;ll automatically see
                      this homeowner&apos;s contact details for eligible
                      projects.
                    </p>
                  </div>
                )}

              {/* UNLOCK REJECTED OR GENERIC NOT UNLOCKED */}
              {isUnlockRejected && (
                <div
                  className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[13px] text-rose-900"
                  data-testid="owner-contact-unlock-rejected"
                >
                  <p className="font-medium">
                    Your unlock request was not approved.
                  </p>
                  <p className="mt-1 text-xs">
                    If you think this is a mistake, check your details and try
                    again or contact support.
                  </p>
                </div>
              )}

              {isNotUnlocked &&
                !isVerificationRequired &&
                !isVerificationPending &&
                !isVerificationRejected &&
                !isPaymentRequired &&
                !isUnlockRejected &&
                !isPendingReview && (
                  <div
                    className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] text-slate-700"
                    data-testid="owner-contact-locked"
                  >
                    <p className="font-medium">Contact details are locked.</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Complete verification and choose an unlock option to see
                      this homeowner&apos;s email for the project.
                    </p>
                  </div>
                )}

              {/* GENERIC ERROR */}
              {hasError && (
                <p className="text-xs text-rose-600">
                  We couldn&apos;t check your entitlement just now. Try
                  refreshing the page or contact support if this keeps
                  happening.
                </p>
              )}

              {/* CTA BUTTON */}
              {shouldShowUpgradeButton && (
                <button
                  type="button"
                  onClick={onUpgrade}
                  className="mt-1 inline-flex h-9 items-center justify-center rounded-full bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-900/90"
                  data-testid="btn-upgrade-plan"
                >
                  {primaryCtaLabel}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
