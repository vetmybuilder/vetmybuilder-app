// web/pages/contact.tsx
import Head from "next/head";
import { useAuth } from "@/utils/auth";
import ContactForm from "@/components/forms/ContactForm";

function IconArrowRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Contact() {
  const { user } = useAuth();

  return (
    <>
      <Head>
        <title>Contact Us - VetMyBuilder</title>
        <meta name="description" content="Get in touch with the VetMyBuilder team." />
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">

        {/* HERO - cream wash with Sora display + Caveat indigo accent */}
        <section className="relative bg-[#fef6e9] pt-24 pb-12 sm:pt-28 sm:pb-16">
          <div className="relative mx-auto max-w-6xl px-5 sm:px-8 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-100/80 border border-amber-200 px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-amber-800 mb-5">
                  We'd love to hear from you
                </div>
                <h1
                  className="text-[40px] sm:text-[56px] lg:text-[64px] font-black tracking-[-0.025em] text-slate-900 leading-[0.95]"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  Get in{" "}
                  <span
                    className="text-indigo-600"
                    style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
                  >
                    touch
                  </span>
                </h1>
                <p className="mt-5 text-[16px] sm:text-lg text-slate-700 leading-relaxed max-w-xl">
                  Questions, feedback, or just want to say hello? Drop us a message and
                  we&apos;ll get back to you within one working day.
                </p>
              </div>

              {/* Brand illustration. Same image used by the homepage
                  contact section. */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="relative w-full max-w-md aspect-[4/3] rounded-3xl overflow-hidden shadow-md ring-1 ring-amber-200/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/contact-us.png"
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CONTENT */}
        <section className="bg-[#fef6e9] pb-16 sm:pb-20">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">

              {/* Contact details */}
              <div className="lg:col-span-2 space-y-5">
                <div className="bg-white rounded-3xl p-7 border border-amber-100 shadow-sm">
                  <h2
                    className="text-xl font-extrabold text-slate-900 mb-5"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    Contact info
                  </h2>
                  <div className="space-y-5">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-1">Based in</div>
                      <p className="text-slate-700 font-medium">London, United Kingdom</p>
                    </div>
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-1">Response time</div>
                      <p className="text-slate-700 font-medium">Within 1 working day</p>
                    </div>
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-1">Email</div>
                      <a
                        href="mailto:hello@vetmybuilder.com"
                        className="text-indigo-700 font-bold hover:underline"
                      >
                        hello@vetmybuilder.com
                      </a>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-7 border border-amber-100 shadow-sm">
                  <h3
                    className="text-lg font-extrabold text-slate-900 mb-2"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    Found a bug?
                  </h3>
                  <p className="text-slate-600 text-[14px] leading-relaxed">
                    If you&apos;ve spotted something broken, please include the page URL and what you
                    were doing when it happened. Screenshots always help.
                  </p>
                </div>

                {!user && (
                  <div className="bg-white rounded-3xl p-7 border border-emerald-200 shadow-sm">
                    <h3
                      className="text-lg font-extrabold text-slate-900 mb-2"
                      style={{ fontFamily: "'Sora', sans-serif" }}
                    >
                      Are you a tradesperson?
                    </h3>
                    <p className="text-slate-600 text-[14px] leading-relaxed mb-4">
                      Interested in getting listed or have questions about your profile?
                    </p>
                    <a
                      href="/tradesman/register-tradesmen"
                      className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-800 transition-colors"
                    >
                      Register your business <IconArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>

              {/* Form - shared with the homepage HomeContactSection so
                  any field/UX change happens in one place. */}
              <div className="lg:col-span-3">
                <ContactForm />
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
