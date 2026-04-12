// web/pages/privacy.tsx
import Head from "next/head";

const sections = [
  {
    title: "Who we are",
    content: `Connect2Find Ltd (trading as VetMyBuilder, "we", "us", "our") operates the website at vetmybuilder.com. We are registered in England and Wales. This Privacy Policy explains how we collect, use, disclose, and safeguard your personal information when you use our platform.

If you have questions about this policy, contact us at hello@vetmybuilder.com.`,
  },
  {
    title: "What information we collect",
    content: `**Information you provide directly:**
- Account registration: name, email address, password
- Profile information: location, phone number (optional)
- Project details: job descriptions, property information
- Recommendations: ratings, written feedback about tradespeople
- Communications: messages you send us

**Information collected automatically:**
- Log data: IP address, browser type, pages visited, time spent
- Cookies and similar tracking technologies (see our Cookie section below)
- Device information: operating system, device identifiers

**Information from third parties:**
- Firebase Authentication: we use Google Firebase to manage sign-in securely
- Companies House public register: to verify tradesperson company details`,
  },
  {
    title: "How we use your information",
    content: `We use your personal data to:
- Provide, operate, and improve the VetMyBuilder platform
- Create and manage your account
- Match homeowners with community recommendations
- Send transactional emails (project updates, new recommendations)
- Verify tradesperson credentials against Companies House
- Respond to your enquiries and support requests
- Detect and prevent fraud or abuse
- Comply with our legal obligations

**Legal basis (UK GDPR):** We process your data under the following lawful bases: contract performance (to provide our service), legitimate interests (improving the platform, preventing fraud), consent (marketing emails), and legal obligation.`,
  },
  {
    title: "Sharing your information",
    content: `We do not sell your personal data. We share it only with:

**Service providers** who help us operate the platform (cloud hosting, email delivery, analytics). These providers process data only on our instructions and under strict data protection agreements.

**Other users** — when you submit a recommendation, your name and feedback are visible to the homeowner who requested it. When you create a project, your invite link allows others to see basic job details.

**Companies House** — we query their public API; no personal data is sent, only company numbers.

**Law enforcement** — only where required by law, court order, or to protect the safety of our users.`,
  },
  {
    title: "Data retention",
    content: `We keep your account data for as long as your account is active. If you delete your account, we will delete or anonymise your personal data within 30 days, except where we are legally required to retain it longer (e.g. financial records for 6 years).

Recommendation data may be retained in anonymised form for analytical purposes.`,
  },
  {
    title: "Your rights",
    content: `Under UK GDPR, you have the right to:
- **Access** — request a copy of the personal data we hold about you
- **Rectification** — ask us to correct inaccurate data
- **Erasure** — ask us to delete your data (subject to legal obligations)
- **Restriction** — ask us to limit how we process your data
- **Portability** — receive your data in a structured, machine-readable format
- **Object** — object to processing based on legitimate interests

To exercise any of these rights, email hello@vetmybuilder.com. We will respond within 30 days.

You also have the right to lodge a complaint with the Information Commissioner's Office (ICO) at ico.org.uk.`,
  },
  {
    title: "Cookies",
    content: `We use cookies and similar technologies to:
- Keep you logged in (essential session cookies)
- Remember your preferences
- Understand how the platform is used (analytics)

We use Firebase Authentication cookies (essential) and may use Google Analytics (analytics, opt-out available). You can control cookies through your browser settings. Disabling essential cookies may prevent you from using parts of the platform.`,
  },
  {
    title: "Security",
    content: `We take security seriously. Your password is never stored in plain text. All data is transmitted over encrypted connections (HTTPS). Access to production systems is restricted to authorised team members.

No system is completely secure. If you discover a security vulnerability, please email hello@vetmybuilder.com responsibly.`,
  },
  {
    title: "Children",
    content: `VetMyBuilder is not intended for anyone under the age of 18. We do not knowingly collect personal data from children. If you believe a child has provided us with personal information, please contact us and we will delete it promptly.`,
  },
  {
    title: "Changes to this policy",
    content: `We may update this Privacy Policy from time to time. We will notify you of significant changes by email or by posting a notice on the platform. The date of the latest revision is shown at the top of this page. Continued use of VetMyBuilder after changes constitutes acceptance of the updated policy.`,
  },
];

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — VetMyBuilder</title>
        <meta name="description" content="How VetMyBuilder collects, uses and protects your personal information." />
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">

        {/* HERO */}
        <section className="relative pt-6 pb-12 sm:pt-28 overflow-hidden bg-stone-50">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          </div>
          <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-zinc-800 mb-6">
              Last updated: 2 April 2026
            </div>
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-zinc-900 leading-[0.95]">
              Privacy <span className="text-red-500">Policy</span>
            </h1>
            <p className="mt-6 text-xl text-zinc-600 leading-relaxed font-medium max-w-2xl">
              We believe in being honest about how we handle your data. Here&apos;s everything you need to know.
            </p>
          </div>
        </section>

        {/* CONTENT */}
        <section className="bg-white py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="space-y-10">
              {sections.map((section, i) => (
                <div key={i} className="border-b border-zinc-100 pb-10 last:border-0 last:pb-0">
                  <h2 className="text-2xl font-black text-zinc-900 mb-4">{section.title}</h2>
                  <div className="text-zinc-600 leading-relaxed space-y-3">
                    {section.content.split("\n\n").map((para, j) => (
                      <p key={j} className={para.startsWith("**") && para.includes(":**") ? "font-semibold text-zinc-800 mt-4 mb-1" : ""}>
                        {para.startsWith("- ") ? (
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            {para.split("\n").map((line, k) => (
                              <li key={k}>{line.replace(/^- /, "").replace(/\*\*/g, "")}</li>
                            ))}
                          </ul>
                        ) : (
                          <span dangerouslySetInnerHTML={{
                            __html: para
                              .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                              .replace(/\n/g, "<br/>"),
                          }} />
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-14 bg-stone-50 rounded-3xl p-8 text-center">
              <h3 className="text-xl font-black text-zinc-900 mb-3">Questions about your privacy?</h3>
              <p className="text-zinc-600 mb-4">We&apos;re happy to help. Reach us anytime.</p>
              <a
                href="mailto:hello@vetmybuilder.com"
                className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white hover:scale-[1.02] transition-all"
              >
                hello@vetmybuilder.com
              </a>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
