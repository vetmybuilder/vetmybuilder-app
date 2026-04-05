import * as React from "react";
import { User, Mail, ShieldCheck, Lock, AlertTriangle, Clock, XCircle } from "lucide-react";

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
      className="rounded-2xl border border-zinc-200 bg-white shadow-md overflow-hidden"
      data-testid="owner-contact-card"
    >
      {/* Coloured header band */}
      <div className="bg-gradient-to-r from-red-500 to-red-600 px-5 py-4">
        <h2 className="text-sm font-black tracking-wide text-white">{title}</h2>
        <p className="mt-0.5 text-xs text-red-100">
          {effectiveLocked ? "Unlock to view contact details" : "Contact unlocked"}
        </p>
      </div>

      <div className="p-5">
        {loading && (
          <div className="space-y-3">
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-zinc-200" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-zinc-200" />
          </div>
        )}

        {!loading && (
          <>
            {/* UNLOCKED */}
            {!effectiveLocked && hasEmail ? (
              <div className="space-y-4">
                {name && (
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100">
                      <User className="h-4 w-4 text-zinc-500" />
                    </span>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Name</div>
                      <div className="mt-0.5 font-semibold text-zinc-800">{name}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50">
                    <Mail className="h-4 w-4 text-emerald-600" />
                  </span>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Email</div>
                    <a
                      href={`mailto:${contact!.email}`}
                      className="mt-0.5 block text-sm font-semibold text-emerald-600 hover:underline break-all"
                    >
                      {contact!.email}
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                  <ShieldCheck className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                  <p className="text-xs text-emerald-700">Use this contact respectfully and only for this project.</p>
                </div>
              </div>
            ) : (
              // LOCKED STATES
              <div className="space-y-3">
                {(isVerificationRequired || isVerificationPending || isVerificationRejected) && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3" data-testid="owner-contact-verification-state">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div className="text-sm">
                      {isVerificationRequired && (
                        <>
                          <p className="font-semibold text-amber-900">Verification required</p>
                          <p className="mt-1 text-xs text-amber-700">Upload your insurance and supporting documents to complete verification before unlocking contacts.</p>
                        </>
                      )}
                      {isVerificationPending && (
                        <>
                          <p className="font-semibold text-amber-900">Verification in review</p>
                          <p className="mt-1 text-xs text-amber-700">Our team is checking your documents. You'll be notified once approved.</p>
                        </>
                      )}
                      {isVerificationRejected && (
                        <>
                          <p className="font-semibold text-amber-900">Verification needs attention</p>
                          <p className="mt-1 text-xs text-amber-700">Please review and re-submit your insurance or supporting documents.</p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {isPaymentRequired && (
                  <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3" data-testid="owner-contact-payment-required">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                    <div className="text-sm">
                      <p className="font-semibold text-zinc-900">Verification approved</p>
                      <p className="mt-1 text-xs text-zinc-500">Select a plan to unlock this homeowner's contact details.</p>
                    </div>
                  </div>
                )}

                {isPendingReview && !isPaymentRequired && !isVerificationPending && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3" data-testid="owner-contact-pending-review">
                    <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-900">Request under review</p>
                      <p className="mt-1 text-xs text-amber-700">Once approved, contact details will appear here automatically.</p>
                    </div>
                  </div>
                )}

                {isUnlockRejected && (
                  <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3" data-testid="owner-contact-unlock-rejected">
                    <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
                    <div className="text-sm">
                      <p className="font-semibold text-rose-900">Request not approved</p>
                      <p className="mt-1 text-xs text-rose-700">Check your details and try again, or contact support.</p>
                    </div>
                  </div>
                )}

                {isNotUnlocked && !isVerificationRequired && !isVerificationPending && !isVerificationRejected && !isPaymentRequired && !isUnlockRejected && !isPendingReview && (
                  <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3" data-testid="owner-contact-locked">
                    <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400" />
                    <div className="text-sm">
                      <p className="font-semibold text-zinc-700">Contact details locked</p>
                      <p className="mt-1 text-xs text-zinc-500">Complete verification and choose an unlock option to see this homeowner's email.</p>
                    </div>
                  </div>
                )}

                {hasError && (
                  <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
                    <XCircle className="h-4 w-4 flex-shrink-0 text-rose-500" />
                    <p className="text-xs text-rose-600">Couldn't check entitlement. Try refreshing.</p>
                  </div>
                )}

                {shouldShowUpgradeButton && (
                  <button
                    type="button"
                    onClick={onUpgrade}
                    className="mt-1 w-full inline-flex items-center justify-center rounded-full bg-red-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-red-500/30 hover:bg-red-600 transition-colors"
                    data-testid="btn-upgrade-plan"
                  >
                    {primaryCtaLabel}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
