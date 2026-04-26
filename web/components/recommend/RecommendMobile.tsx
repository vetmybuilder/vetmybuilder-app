// web/components/recommend/RecommendMobile.tsx
//
// Mobile redesign of /projects/[id]/recommend. Two-step wizard:
//   Step 1 - "How did they do?" (5 category star ratings + optional comment)
//   Step 2 - "Almost done"      (Tradesperson, Photos, Your details, Send)
//
// All form state, validation, and submit logic remain owned by the page
// (web/pages/projects/[id]/recommend.tsx) - this component is purely the
// mobile presentation layer. Auth-prefill (name/email locked when signed
// in) and the existing payload all flow through unchanged.

import { useState } from "react";
import { useRouter } from "next/router";
import { CheckCircle2, Star, X } from "lucide-react";

import FileGridUploader from "@/components/fileUpload/FileGridUploader";

type Form = {
  name: string;
  email: string;
  phone: string;
  company: string;
  companyEmail: string;
  comment: string;
};

type FieldKey =
  | "name"
  | "email"
  | "phone"
  | "company"
  | "companyEmail"
  | "comment";

type FieldErrors = Partial<Record<FieldKey, string>>;

export type Ratings = {
  quality: number;
  reliability: number;
  communication: number;
  trust: number;
  value: number;
};

type Props = {
  projectName: string;
  authed: boolean;
  form: Form;
  fieldErrors: FieldErrors;
  formError: string | null;
  notice: string | null;
  submitting: boolean;
  photos: File[];
  photoConsent: boolean;
  lockIdentity: boolean;
  ratings: Ratings;
  setRating: (k: keyof Ratings, value: number) => void;
  set: (key: FieldKey, value: string) => void;
  setPhotos: (files: File[]) => void;
  setPhotoConsent: (consent: boolean) => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
};

const CATEGORIES: Array<{ key: keyof Ratings; label: string }> = [
  { key: "quality", label: "Quality of work" },
  { key: "reliability", label: "Reliability" },
  { key: "communication", label: "Communication" },
  { key: "trust", label: "Trust" },
  { key: "value", label: "Value for money" },
];

export default function RecommendMobile({
  projectName,
  authed,
  form,
  fieldErrors,
  formError,
  notice,
  submitting,
  photos,
  photoConsent,
  lockIdentity,
  ratings,
  setRating,
  set,
  setPhotos,
  setPhotoConsent,
  onSubmit,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  const submitDisabled = submitting || (photos.length > 0 && !photoConsent);
  const anyRated = CATEGORIES.some((c) => ratings[c.key] > 0);

  // Page sets `notice` immediately after a successful POST, before it kicks
  // off the redirect (~2.5s later). Take over the screen with a celebration
  // state so the user actually sees confirmation.
  if (notice) {
    return (
      <main
        className="fixed inset-0 bg-white flex flex-col items-center justify-center px-6"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
        data-testid="recommend-mobile-success"
      >
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
          style={{
            background: "linear-gradient(135deg, #d1fae5, #6ee7b7)",
            boxShadow: "0 12px 36px rgba(16,185,129,0.35)",
          }}
        >
          <CheckCircle2 className="w-10 h-10 text-emerald-700" />
        </div>
        <h1 className="text-[24px] font-extrabold tracking-tight text-gray-900 text-center">
          Recommendation sent
        </h1>
        <p className="mt-2 text-[13px] text-gray-500 leading-relaxed text-center max-w-xs">
          {notice}
        </p>
        <div className="mt-6 flex items-center gap-2 text-[11.5px] font-semibold text-gray-400">
          <span>Redirecting</span>
          <span
            className="inline-block w-1 h-1 rounded-full bg-indigo-500 animate-pulse"
            style={{ animationDelay: "0s" }}
          />
          <span
            className="inline-block w-1 h-1 rounded-full bg-indigo-500 animate-pulse"
            style={{ animationDelay: "0.2s" }}
          />
          <span
            className="inline-block w-1 h-1 rounded-full bg-indigo-500 animate-pulse"
            style={{ animationDelay: "0.4s" }}
          />
        </div>
      </main>
    );
  }

  return (
    <main
      className="fixed inset-0 bg-white flex flex-col"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="recommend-mobile"
    >
      <div className="h-[env(safe-area-inset-top)]" />

      {/* Top bar - X + indigo progress + step counter (mirrors post-job wizard) */}
      <div className="flex items-center gap-3 px-4 pt-2 pb-2 flex-shrink-0">
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
          data-testid="recommend-mobile-cancel"
        >
          <X className="w-4 h-4 text-gray-900" />
        </button>
        <div className="flex-1 h-1 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: step === 1 ? "50%" : "100%",
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
            }}
          />
        </div>
        <div className="text-[11.5px] font-extrabold text-gray-500">
          {step} of 2
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto pb-3">
        {step === 1 ? (
          <Step1
            projectName={projectName}
            ratings={ratings}
            setRating={setRating}
            comment={form.comment}
            commentError={fieldErrors.comment}
            setComment={(v) => set("comment", v)}
          />
        ) : (
          <Step2
            authed={authed}
            form={form}
            fieldErrors={fieldErrors}
            lockIdentity={lockIdentity}
            photos={photos}
            setPhotos={setPhotos}
            setPhotoConsent={setPhotoConsent}
            set={set}
            formError={formError}
            notice={notice}
          />
        )}
      </form>

      {/* Sticky footer */}
      <div
        className="px-4 pt-3 border-t border-gray-100 bg-white flex-shrink-0 flex gap-2"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        {step === 2 && (
          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={submitting}
            className="px-5 py-3.5 rounded-2xl bg-white border-[1.5px] border-gray-200 text-gray-600 font-bold text-[14px] disabled:opacity-60"
            data-testid="recommend-mobile-back"
          >
            Back
          </button>
        )}
        {step === 1 ? (
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!anyRated}
            data-testid="recommend-mobile-continue"
            className="flex-1 py-3.5 rounded-2xl text-white font-extrabold text-[14px] shadow-lg disabled:opacity-50 disabled:shadow-none"
            style={{
              background: anyRated
                ? "linear-gradient(135deg, #6366f1, #4f46e5)"
                : "#6366f1",
              boxShadow: anyRated ? "0 8px 22px rgba(99,102,241,0.3)" : undefined,
            }}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => onSubmit(e as any)}
            disabled={submitDisabled}
            aria-busy={submitting}
            data-testid="recommend-mobile-submit"
            className="flex-1 py-3.5 rounded-2xl text-white font-extrabold text-[14px] shadow-lg disabled:opacity-50 disabled:shadow-none"
            style={{
              background: submitDisabled
                ? "#6366f1"
                : "linear-gradient(135deg, #6366f1, #4f46e5)",
              boxShadow: submitDisabled
                ? undefined
                : "0 8px 22px rgba(99,102,241,0.3)",
            }}
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        )}
      </div>
    </main>
  );
}

/* ----- Step 1 ----- */

function Step1({
  projectName,
  ratings,
  setRating,
  comment,
  commentError,
  setComment,
}: {
  projectName: string;
  ratings: Ratings;
  setRating: (k: keyof Ratings, value: number) => void;
  comment: string;
  commentError?: string;
  setComment: (v: string) => void;
}) {
  return (
    <>
      <div className="px-5 pt-1 pb-3">
        <h1 className="text-[24px] font-extrabold tracking-tight text-gray-900 leading-tight">
          How did they do?
        </h1>
        <p className="mt-1.5 text-[12.5px] text-gray-500 leading-snug">
          Tap a star for each. Tap the same star again to clear it.
        </p>
        {projectName && (
          <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11.5px] font-extrabold">
            For "{projectName}"
          </span>
        )}
      </div>

      <div className="px-5 space-y-2">
        {CATEGORIES.map((cat) => (
          <StarRow
            key={cat.key}
            label={cat.label}
            value={ratings[cat.key]}
            onChange={(n) => setRating(cat.key, n)}
          />
        ))}
      </div>

      <SectionDivider>A short comment</SectionDivider>
      <div className="px-5">
        <p className="text-[11.5px] text-gray-500 mb-2">
          Optional - one or two sentences in your own words.
        </p>
        <textarea
          id="recommend-comment"
          data-testid="recommend-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="They did our bathroom last year. Tidy team, communicated well, came in under quote."
          className={`w-full bg-gray-50 border-[1.5px] rounded-2xl px-3.5 py-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none transition-colors resize-none ${
            commentError
              ? "border-rose-400"
              : "border-gray-200 focus:border-indigo-500"
          }`}
        />
        {commentError && (
          <p className="mt-1 text-[11.5px] text-rose-600 font-semibold">
            {commentError}
          </p>
        )}
      </div>
    </>
  );
}

/* ----- Step 2 ----- */

function Step2({
  authed,
  form,
  fieldErrors,
  lockIdentity,
  photos,
  setPhotos,
  setPhotoConsent,
  set,
  formError,
  notice,
}: {
  authed: boolean;
  form: Form;
  fieldErrors: FieldErrors;
  lockIdentity: boolean;
  photos: File[];
  setPhotos: (files: File[]) => void;
  setPhotoConsent: (c: boolean) => void;
  set: (k: FieldKey, v: string) => void;
  formError: string | null;
  notice: string | null;
}) {
  return (
    <>
      <div className="px-5 pt-1 pb-3">
        <h1 className="text-[24px] font-extrabold tracking-tight text-gray-900 leading-tight">
          Almost done
        </h1>
        <p className="mt-1.5 text-[12.5px] text-gray-500 leading-snug">
          Who's the tradesperson, and who's recommending them.
        </p>
      </div>

      {!authed && (
        <div className="mx-5 mb-2 rounded-2xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-[12px] text-amber-900 leading-snug">
          You can submit without an account -{" "}
          <a href="/signup" className="font-extrabold underline">
            sign up
          </a>{" "}
          later to track your recommendations.
        </div>
      )}

      {formError && (
        <div className="mx-5 mb-2 rounded-2xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-[12.5px] font-semibold text-rose-700">
          {formError}
        </div>
      )}

      {notice && (
        <div className="mx-5 mb-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-3.5 py-3 text-[12.5px] font-semibold text-emerald-700">
          {notice}
        </div>
      )}

      <SectionDivider>Tradesperson's details</SectionDivider>
      <Field
        id="company"
        label="Tradesperson's name"
        value={form.company}
        onChange={(v) => set("company", v)}
        error={fieldErrors.company}
        placeholder="e.g. Sparkle Bathrooms Ltd"
      />
      <Field
        id="company-email"
        label="Tradesperson's email"
        optional
        value={form.companyEmail}
        onChange={(v) => set("companyEmail", v)}
        error={fieldErrors.companyEmail}
        type="email"
        placeholder="hello@company.co.uk"
        help={
          !fieldErrors.companyEmail
            ? "We may use this to contact them about jobs."
            : undefined
        }
      />
      <Field
        id="phone"
        label="Tradesperson's number"
        optional
        value={form.phone}
        onChange={(v) => set("phone", v)}
        error={fieldErrors.phone}
        inputMode="tel"
        placeholder="07700 900 000"
      />

      <SectionDivider>Photos of their work</SectionDivider>
      <div className="px-5">
        <p className="text-[11.5px] text-gray-500 leading-snug mb-2">
          Optional - add any recent work they did for you to help the homeowner
          see what they're capable of.
        </p>
        <FileGridUploader
          files={photos}
          onChange={setPhotos}
          maxFiles={8}
          maxSizeMB={10}
          onConsentChange={setPhotoConsent}
        />
      </div>

      <SectionDivider>Your details</SectionDivider>
      <Field
        id="name"
        label="Your name"
        value={form.name}
        onChange={(v) => set("name", v)}
        error={fieldErrors.name}
        disabled={lockIdentity}
        placeholder="e.g. Alex Chan"
      />
      <Field
        id="email"
        label="Your email"
        optional
        value={form.email}
        onChange={(v) => set("email", v)}
        error={fieldErrors.email}
        disabled={lockIdentity}
        type="email"
        placeholder="alex@example.com"
        help={
          !lockIdentity
            ? "Add this if you want to track your recommendation later."
            : undefined
        }
      />

      <div className="h-4" />
    </>
  );
}

/* ----- Subcomponents ----- */

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white border-[1.5px] border-gray-200 rounded-2xl px-3.5 py-3">
      <div className="text-[13px] font-extrabold tracking-tight text-gray-900">
        {label}
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value >= n;
          return (
            <button
              key={n}
              type="button"
              aria-label={`${label}: ${n} of 5 stars`}
              aria-pressed={value === n}
              onClick={() => onChange(value === n ? 0 : n)}
              className="p-0.5"
              data-testid={`recommend-star-${label.replace(/\s+/g, "-").toLowerCase()}-${n}`}
            >
              <Star
                className={`w-5 h-5 ${
                  on
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-gray-300"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 mt-5 mb-1 flex items-center gap-3">
      <span className="flex-1 h-px bg-gray-200" />
      <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-gray-700">
        {children}
      </span>
      <span className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  optional,
  help,
  placeholder,
  type,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  optional?: boolean;
  help?: string;
  placeholder?: string;
  type?: "text" | "email";
  inputMode?: "tel" | "text" | "email";
}) {
  return (
    <div className="px-5 pt-3">
      <label
        htmlFor={`recommend-${id}`}
        className="block text-[11px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-1.5"
      >
        {label}
        {optional && (
          <span className="ml-1.5 text-gray-400 normal-case">optional</span>
        )}
      </label>
      <input
        id={`recommend-${id}`}
        data-testid={`recommend-${id}`}
        type={type || "text"}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={`w-full bg-gray-50 border-[1.5px] rounded-2xl px-3.5 py-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none transition-colors ${
          error ? "border-rose-400" : "border-gray-200 focus:border-indigo-500"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      />
      {error ? (
        <p className="mt-1 text-[11.5px] text-rose-600 font-semibold">{error}</p>
      ) : help ? (
        <p className="mt-1 text-[11px] text-gray-500">{help}</p>
      ) : null}
    </div>
  );
}
