// web/components/home/HomeContactSection.tsx
//
// Inline contact form section that lives at the bottom of the homepage,
// just above the footer. Uses the shared <ContactForm /> component (the
// same one /pages/contact.tsx renders) so any field/UX change happens
// in one place. 2-column layout on desktop: placeholder image left,
// form right. Stacks to single-column on mobile.

import Image from "next/image";
import { MessageCircle } from "lucide-react";
import ContactForm from "@/components/forms/ContactForm";

export default function HomeContactSection() {
  return (
    <section
      className="px-5 sm:px-8 py-10 sm:py-12 bg-indigo-50/60"
      data-testid="home-contact-section"
    >
      <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        {/* Left column - placeholder image + brand intro */}
        <div className="order-1 lg:order-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 border border-indigo-200 text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-3">
            <MessageCircle className="w-3 h-3" />
            Get in touch
          </div>
          <h2
            className="text-[26px] sm:text-[32px] font-black tracking-tight text-slate-900 leading-tight"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            Got a question?{" "}
            <span
              className="text-indigo-700"
              style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
            >
              We&apos;re all ears.
            </span>
          </h2>
          <p className="mt-2 text-[13.5px] sm:text-[14px] text-slate-600 leading-relaxed max-w-md">
            Drop us a line and we&apos;ll get back to you within a working day.
          </p>

          {/* Brand illustration. Hidden on mobile to keep the section
              tight; the form goes straight under the heading there. */}
          <div className="hidden lg:block mt-6 aspect-[4/3] rounded-3xl overflow-hidden shadow-md ring-1 ring-indigo-200/60 max-w-md">
            <Image
              src="/contact-us.png"
              alt=""
              width={600}
              height={450}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Right column - shared contact form */}
        <div className="order-2 lg:order-2">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
