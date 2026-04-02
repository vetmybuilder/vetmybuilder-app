// web/pages/terms.tsx
import Head from "next/head";
import Link from "next/link";

const sections = [
  {
    title: "Acceptance of terms",
    content: `By accessing or using VetMyBuilder (the "Platform") at vetmybuilder.com, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Platform.

These Terms form a legally binding agreement between you and VetMyBuilder Ltd, a company registered in England and Wales. We may update these Terms from time to time; continued use of the Platform constitutes acceptance of any changes.`,
  },
  {
    title: "What VetMyBuilder does",
    content: `VetMyBuilder is a community platform that connects UK homeowners with tradespeople through community-sourced recommendations. We allow homeowners to:
- Post job listings and generate shareable invite links
- Collect recommendations from their personal and community network
- View tradesperson profiles and verification status
- Build shortlists of preferred tradespeople

We are a technology platform, not a builder-finding or contracting service. We do not employ tradespeople, guarantee their work, or take any commission on jobs arranged through the platform.`,
  },
  {
    title: "Eligibility",
    content: `You must be at least 18 years old and a resident of the United Kingdom to use VetMyBuilder as a homeowner. Tradespeople must be operating legally in the United Kingdom.

By using the Platform, you represent and warrant that you meet these requirements and that the information you provide is accurate and complete.`,
  },
  {
    title: "Your account",
    content: `You are responsible for maintaining the security of your account credentials and for all activity that occurs under your account. You must notify us immediately at hello@vetmybuilder.com of any unauthorised access.

You must not create an account using false information, impersonate another person, or create multiple accounts for abusive purposes. We reserve the right to suspend or terminate accounts that violate these Terms.`,
  },
  {
    title: "User content",
    content: `You retain ownership of any content you submit to the Platform ("User Content"), including job descriptions, recommendations, ratings, and profile information.

By submitting User Content, you grant VetMyBuilder a non-exclusive, royalty-free, worldwide licence to use, store, display, and distribute that content as necessary to operate the Platform.

You are solely responsible for your User Content. You must not submit content that is:
- False, misleading, or fraudulent
- Defamatory, abusive, or harassing
- In breach of any third party's rights
- Related to services you did not personally receive or witness
- Incentivised or paid for by a tradesperson`,
  },
  {
    title: "Prohibited uses",
    content: `You must not use VetMyBuilder to:
- Scrape, crawl, or systematically extract data
- Attempt to reverse engineer or compromise our systems
- Post fake or misleading recommendations
- Solicit other users for services outside the Platform
- Circumvent any access controls or security measures
- Use the Platform in any way that violates applicable law`,
  },
  {
    title: "Tradespeople and verification",
    content: `Companies House verification indicates only that a company is registered with Companies House and its filing status. It is not an endorsement of a tradesperson's skill, reliability, insurance status, or suitability for any job.

VetMyBuilder does not carry out background checks, qualification checks, or insurance verification. Homeowners are responsible for conducting their own due diligence before engaging any tradesperson.`,
  },
  {
    title: "Disclaimers",
    content: `The Platform is provided on an "as is" and "as available" basis. We make no warranties, express or implied, including fitness for a particular purpose or uninterrupted availability.

We do not warrant the accuracy, completeness, or reliability of any recommendations, ratings, or other User Content submitted by third parties.

VetMyBuilder is not a party to any agreement between a homeowner and a tradesperson. We are not responsible for the quality of work performed, disputes, damages, or losses arising from any such engagement.`,
  },
  {
    title: "Limitation of liability",
    content: `To the fullest extent permitted by law, VetMyBuilder Ltd's liability to you for any claim arising from these Terms or your use of the Platform shall not exceed £100.

We shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising from your use of or inability to use the Platform.

Nothing in these Terms limits our liability for death or personal injury caused by our negligence, fraud, or any liability that cannot be excluded by English law.`,
  },
  {
    title: "Intellectual property",
    content: `All content, design, code, and materials on the Platform (excluding User Content) are owned by or licensed to VetMyBuilder Ltd and are protected by copyright, trademark, and other intellectual property laws.

You may not copy, reproduce, distribute, or create derivative works from our materials without our express written permission.`,
  },
  {
    title: "Governing law",
    content: `These Terms are governed by English law. Any disputes arising from these Terms or your use of the Platform shall be subject to the exclusive jurisdiction of the courts of England and Wales.`,
  },
  {
    title: "Contact",
    content: `If you have questions about these Terms, please contact us at hello@vetmybuilder.com or write to: VetMyBuilder Ltd, London, United Kingdom.`,
  },
];

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Service — VetMyBuilder</title>
        <meta name="description" content="VetMyBuilder terms of service — the rules for using our platform." />
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14">

        {/* HERO */}
        <section className="relative pt-24 pb-12 sm:pt-28 overflow-hidden bg-stone-50">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          </div>
          <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-zinc-800 mb-6">
              Last updated: 2 April 2026
            </div>
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-zinc-900 leading-[0.95]">
              Terms of <span className="text-red-500">Service</span>
            </h1>
            <p className="mt-6 text-xl text-zinc-600 leading-relaxed font-medium max-w-2xl">
              Please read these terms carefully. They govern your use of VetMyBuilder and set out your rights and obligations.
            </p>
          </div>
        </section>

        {/* CONTENT */}
        <section className="bg-white py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">

            {/* Quick summary banner */}
            <div className="bg-emerald-50 rounded-3xl p-6 mb-10 border border-emerald-100">
              <h2 className="text-lg font-black text-zinc-900 mb-2">The plain English summary</h2>
              <p className="text-zinc-600 text-sm leading-relaxed">
                VetMyBuilder is a free platform that helps you collect trusted recommendations. We&apos;re not responsible for
                the quality of any builder&apos;s work. Please be honest when submitting recommendations — fake reviews
                are not allowed. You keep ownership of your content, but we need to be able to show it on the platform.
              </p>
            </div>

            <div className="space-y-10">
              {sections.map((section, i) => (
                <div key={i} className="border-b border-zinc-100 pb-10 last:border-0 last:pb-0">
                  <h2 className="text-2xl font-black text-zinc-900 mb-4">{i + 1}. {section.title}</h2>
                  <div className="text-zinc-600 leading-relaxed space-y-3">
                    {section.content.split("\n\n").map((para, j) => (
                      <div key={j}>
                        {para.startsWith("- ") ? (
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            {para.split("\n").map((line, k) => (
                              <li key={k}>{line.replace(/^- /, "")}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>{para}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-14 bg-stone-50 rounded-3xl p-8 text-center">
              <h3 className="text-xl font-black text-zinc-900 mb-3">Questions about these terms?</h3>
              <p className="text-zinc-600 mb-4">We&apos;re always happy to clarify.</p>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white hover:scale-[1.02] transition-all"
              >
                Contact us
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
