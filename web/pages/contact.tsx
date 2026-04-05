// web/pages/contact.tsx
import Head from "next/head";
import { useState } from "react";
import { useAuth } from "@/utils/auth";
import api from "@/utils/api";

function IconArrowRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Contact() {
  const { user } = useAuth();

  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setErr(null);
    try {
      await api.post("/api/contact", form);
      setSubmitted(true);
    } catch {
      setErr("Something went wrong — please try again or email us directly.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Head>
        <title>Contact Us — VetMyBuilder</title>
        <meta name="description" content="Get in touch with the VetMyBuilder team." />
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">

        {/* HERO */}
        <section className="relative pt-24 pb-16 sm:pt-28 sm:pb-20 overflow-hidden bg-stone-50">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          </div>
          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-zinc-800 mb-6">
                  <span>We&apos;d love to hear from you</span>
                </div>
                <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-[0.95] text-zinc-900">
                  Get in <span className="text-red-500">touch</span>
                </h1>
                <p className="mt-6 text-xl text-zinc-600 leading-relaxed font-medium">
                  Questions, feedback, or just want to say hello? Drop us a message and
                  we&apos;ll get back to you within one working day.
                </p>
              </div>

              {/* Illustration */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="relative w-full max-w-sm">
                  {/* Main message card */}
                  <div className="bg-white rounded-3xl shadow-2xl shadow-zinc-300/50 p-5 border border-zinc-100">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-red-500" aria-hidden>
                          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                          <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-black text-zinc-900">New message</div>
                        <div className="text-xs text-zinc-400">From your website</div>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 my-3" />

                    <div className="space-y-3">
                      {[
                        { label: "Name", value: "Jane Smith", bg: "bg-red-500" },
                        { label: "Subject", value: "General enquiry" },
                        { label: "Message", value: "Hi, I'd love to find out more about listing my business…" },
                      ].map((row) => (
                        <div key={row.label} className="flex items-start gap-3 bg-zinc-50 rounded-2xl px-3 py-2.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 w-16 shrink-0 pt-0.5">{row.label}</div>
                          <div className="text-xs font-medium text-zinc-700">{row.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Floating reply badge */}
                  <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-xl shadow-zinc-200/70 px-4 py-3 flex items-center gap-2.5 border border-zinc-100">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-emerald-600" aria-hidden>
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-black text-zinc-900">Reply within 1 day</div>
                      <div className="text-xs text-zinc-400">Guaranteed response</div>
                    </div>
                  </div>

                  {/* Floating sent badge */}
                  <div className="absolute -top-4 -left-4 bg-white rounded-2xl shadow-xl shadow-zinc-200/70 px-4 py-3 flex items-center gap-2.5 border border-zinc-100">
                    <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-red-500" aria-hidden>
                        <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-black text-zinc-900">Message sent</div>
                      <div className="text-xs text-zinc-400">Just now</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CONTENT */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">

              {/* Contact details */}
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-stone-50 rounded-3xl p-8">
                  <h2 className="text-2xl font-black text-zinc-900 mb-6">Contact info</h2>
                  <div className="space-y-5">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-red-500 mb-1">Based in</div>
                      <p className="text-zinc-700 font-medium">London, United Kingdom</p>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-red-500 mb-1">Response time</div>
                      <p className="text-zinc-700 font-medium">Within 1 working day</p>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50 rounded-3xl p-8">
                  <h3 className="text-lg font-black text-zinc-900 mb-3">Found a bug?</h3>
                  <p className="text-zinc-600 text-sm leading-relaxed">
                    If you&apos;ve spotted something broken, please include the page URL and what you
                    were doing when it happened. Screenshots always help!
                  </p>
                </div>

                {!user && (
                  <div className="bg-amber-50 rounded-3xl p-8">
                    <h3 className="text-lg font-black text-zinc-900 mb-3">Are you a tradesperson?</h3>
                    <p className="text-zinc-600 text-sm leading-relaxed mb-4">
                      Interested in getting listed or have questions about your profile?
                    </p>
                    <a
                      href="/tradesman/register-tradesmen"
                      className="inline-flex items-center gap-2 text-sm font-bold text-amber-700 hover:text-amber-800 transition-colors"
                    >
                      Register as a tradesperson <IconArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>

              {/* Form */}
              <div className="lg:col-span-3">
                {submitted ? (
                  <div className="bg-emerald-50 rounded-3xl p-12 text-center h-full flex flex-col items-center justify-center">
                    <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-6">
                      <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-white" aria-hidden>
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-black text-zinc-900 mb-3">Message sent!</h2>
                    <p className="text-zinc-600 text-lg">
                      Thanks for reaching out. We&apos;ll get back to you within one working day.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-bold text-zinc-900 mb-2" htmlFor="name">
                          Your name
                        </label>
                        <input
                          id="name"
                          type="text"
                          required
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          placeholder="Jane Smith"
                          className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-zinc-900 mb-2" htmlFor="email">
                          Email address
                        </label>
                        <input
                          id="email"
                          type="email"
                          required
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="you@example.com"
                          className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-zinc-900 mb-2" htmlFor="subject">
                        Subject
                      </label>
                      <select
                        id="subject"
                        required
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 focus:border-red-400 focus:outline-none transition-colors bg-white"
                      >
                        <option value="">Select a topic…</option>
                        <option value="general">General enquiry</option>
                        <option value="bug">Bug report</option>
                        <option value="tradesperson">Tradesperson enquiry</option>
                        <option value="partnership">Partnership</option>
                        <option value="press">Press / media</option>
                        <option value="other">Something else</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-zinc-900 mb-2" htmlFor="message">
                        Message
                      </label>
                      <textarea
                        id="message"
                        required
                        rows={6}
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder="Tell us what's on your mind…"
                        className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors resize-none"
                      />
                    </div>
                    {err && (
                      <p className="text-sm text-red-600 font-medium">{err}</p>
                    )}
                    <button
                      type="submit"
                      disabled={sending}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {sending ? "Sending…" : "Send message"}
                      {!sending && <IconArrowRight className="h-5 w-5" />}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
