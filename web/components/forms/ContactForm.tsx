// web/components/forms/ContactForm.tsx
//
// Shared "Get in touch" form. Used by /contact and the inline section
// at the bottom of the homepage. Single source of truth for fields,
// validation, copy and POST behaviour - any restyle/UX change happens
// here and both surfaces pick it up.
//
// POSTs to /api/contact with { name, email, subject, message }.

import { useState } from "react";
import { useApi } from "@/utils/api";
import Select from "@/components/forms/Select";

const SUBJECT_OPTIONS = [
  { label: "General enquiry", value: "general" },
  { label: "Bug report", value: "bug" },
  { label: "Tradesperson enquiry", value: "tradesperson" },
  { label: "Billing or refund query", value: "billing" },
  { label: "Partnership", value: "partnership" },
  { label: "Press / media", value: "press" },
  { label: "Something else", value: "other" },
];

function IconArrowRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  /** Pre-fill subject when this form is embedded in a known context. */
  defaultSubject?: string;
  /** Hide the subject field entirely. Defaults to false. */
  hideSubject?: boolean;
};

export default function ContactForm({
  defaultSubject = "",
  hideSubject = false,
}: Props) {
  const api = useApi();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: defaultSubject,
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setErr(null);
    try {
      await api.post("/api/contact", {
        ...form,
        subject: form.subject || defaultSubject || "General enquiry",
      });
      setSubmitted(true);
    } catch {
      setErr("Something went wrong - please try again or email us directly.");
    } finally {
      setSending(false);
    }
  }

  if (submitted) {
    return (
      <div
        className="bg-white rounded-3xl border border-emerald-200 shadow-sm p-10 text-center flex flex-col items-center justify-center"
        data-testid="contact-success"
      >
        <div className="h-14 w-14 rounded-full bg-emerald-500 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-white" aria-hidden>
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2
          className="text-[22px] font-extrabold text-slate-900 mb-2"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Message sent
        </h2>
        <p className="text-slate-600 text-[14px]">
          Thanks - we&apos;ll get back to you within one working day.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-3xl border border-amber-100 shadow-sm p-6 sm:p-7 space-y-5"
      data-testid="contact-form"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-extrabold uppercase tracking-wide text-slate-700 mb-2" htmlFor="contact-name">
            Your name
          </label>
          <input
            id="contact-name"
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Jane Smith"
            className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[12px] font-extrabold uppercase tracking-wide text-slate-700 mb-2" htmlFor="contact-email">
            Email address
          </label>
          <input
            id="contact-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
            className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 transition-colors"
          />
        </div>
      </div>

      {!hideSubject && (
        <div>
          <label className="block text-[12px] font-extrabold uppercase tracking-wide text-slate-700 mb-2" htmlFor="contact-subject">
            Subject
          </label>
          <Select
            id="contact-subject"
            value={form.subject || null}
            onChange={(v) => setForm({ ...form, subject: v })}
            options={SUBJECT_OPTIONS}
            placeholder="Select a topic..."
            ariaLabel="Subject"
            testIdBase="contact-subject"
          />
        </div>
      )}

      <div>
        <label className="block text-[12px] font-extrabold uppercase tracking-wide text-slate-700 mb-2" htmlFor="contact-message">
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={4}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Tell us what's on your mind..."
          className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 transition-colors resize-none"
        />
      </div>

      {err && <p className="text-sm text-red-600 font-medium">{err}</p>}

      <button
        type="submit"
        disabled={sending}
        data-testid="contact-submit"
        className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-[14px] font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
        style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
      >
        {sending ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
            </svg>
            Sending...
          </>
        ) : (
          <>
            Send message
            <IconArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
