// web/pages/terms.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

// ---------------------------------------------------------------------------
// Terms of Service - UK-law-governed. Operating entity: VetMyBuilder Ltd
// (trading as VetMyBuilder).
//
// [REVIEW] items before launch:
// - Registered office address
// - Company number
// - Confirm £250 liability cap (or raise) - £100 may be unenforceable as
//   "unfair" under the Consumer Rights Act 2015 for a paid homeowner
//   service. For a currently-free service, £250 is a defensible figure;
//   revisit when paid features launch.
// - Confirm ADR / ODR stance if/when payments are added.
//
// Must be solicitor-reviewed before publishing, especially:
// - Section 7 (Tradesperson verification) - DMCC exposure
// - Section 9 (Limitation of liability) - CRA 2015 fairness test
// - Section 6 (User content licence) - scope and sublicensing
// ---------------------------------------------------------------------------

const sections: LegalSection[] = [
  {
    title: "Acceptance of these Terms",
    content: `By accessing or using VetMyBuilder (the "Platform") at vetmybuilder.com, you agree to be bound by these Terms of Service ("Terms"). If you do not agree, please do not use the Platform.

These Terms form a legally binding agreement between you and VetMyBuilder Ltd ("we", "us", "our"), a company registered in England and Wales (Company No. 1627511).

We may update these Terms from time to time. Where changes materially affect your rights, we will notify you by email or by a banner on the Platform. The "Last updated" date at the top of this page tells you when the current version took effect.`,
  },
  {
    title: "Who can use the Platform",
    content: `You must be at least 18 years old and a resident of the United Kingdom to use VetMyBuilder as a homeowner.

Tradespeople must be operating legally in the United Kingdom (sole trader, partnership, LLP or limited company) and must hold any licences or registrations required for the trades they offer.

By using the Platform you confirm you meet these requirements and that the information you give us is accurate, current, and complete. If any of that changes, update your profile promptly.`,
  },
  {
    title: "What VetMyBuilder is (and isn't)",
    content: `VetMyBuilder is a **technology platform** that connects UK homeowners with tradespeople through community-sourced recommendations. We let homeowners:
- Post jobs and generate shareable invite links for their personal network
- Collect recommendations from neighbours and community contacts
- View tradesperson profiles, verification status, and ranking
- Build shortlists and express interest in working together

**We are an intermediary only.** We are not a party to any contract between you and a tradesperson (or between you and a homeowner). We do not:
- Employ tradespeople
- Guarantee the quality, timeliness, or safety of any work
- Provide construction, building, or home improvement services ourselves
- Hold your money or act as your agent in the contract
- Take responsibility for disputes between users

You are responsible for evaluating any tradesperson before engaging them, including your own due diligence on insurance, qualifications, and references.`,
  },
  {
    title: "Your account",
    content: `You are responsible for:
- The accuracy of the information in your account
- Keeping your credentials secure
- All activity that happens through your account

Notify us immediately at hello@vetmybuilder.com if you suspect unauthorised access.

You must not:
- Create an account using false information, a pseudonym intended to deceive, or someone else's identity
- Create multiple accounts to evade bans, inflate recommendations, or otherwise abuse the Platform
- Share your credentials with anyone else

We may suspend or terminate accounts that breach these Terms or our <a href="/acceptable-use">Acceptable Use Policy</a>.`,
  },
  {
    title: "Your content",
    content: `You keep ownership of anything you upload or submit to the Platform - job descriptions, recommendations, profile info, photos ("User Content").

By submitting User Content, you grant VetMyBuilder Ltd a non-exclusive, royalty-free, worldwide licence to host, store, display, reproduce, and distribute that content **as necessary to operate the Platform** and to describe or promote the Platform in our own marketing (for example, anonymised examples of the service in action).

You agree that:
- Your User Content is accurate, honest, and your own work (or that you have the rights to share it)
- You will not submit recommendations about tradespeople you have no personal or community-sourced experience of
- You will not accept payment, discounts, or benefits in exchange for leaving a recommendation
- You will not upload photos containing identifiable children
- Photos you upload do not contain anyone who hasn't agreed to appear in them, and do not reveal someone else's home address or other private information

We may remove User Content that we reasonably believe breaches these rules or our <a href="/acceptable-use">Acceptable Use Policy</a>, without notice.`,
  },
  {
    title: "Acceptable use",
    content: `You must not use the Platform to:
- Scrape, crawl, or systematically extract data (including via automated agents)
- Reverse engineer, decompile, or otherwise attempt to compromise our systems
- Post fake, paid-for, or otherwise dishonest recommendations
- Solicit users to transact outside the Platform for the purpose of evading our moderation or fee structure
- Circumvent any access controls, rate limits, or security measures
- Use the Platform in a way that breaks the law or infringes on anyone's rights

Our full <a href="/acceptable-use">Acceptable Use Policy</a> has the detail. Breaches can result in content removal, account suspension, or account termination.`,
  },
  {
    title: "Tradespeople: Verified badge and Companies House data",
    content: `We show a "Verified" badge on tradesperson profiles that match a real Companies House record and a real Google Places business listing with sufficient confidence. We also display their Google rating and review count where available.

**What Verified means:**
- A company of that name exists on the UK Companies House register and is at least in an "active" filing state at the time of the last check
- A business listing on Google Maps matches the same company name and location

**What Verified does NOT mean:**
- That the tradesperson is insured, qualified, or suitable for any specific job
- That their work is of any particular quality
- That VetMyBuilder endorses them

We have a dedicated <a href="/verified">What does Verified mean?</a> page explaining this in more detail.

We do not carry out background checks, DBS checks, qualification checks, or insurance verification. Homeowners are expected to carry out their own due diligence before engaging any tradesperson.`,
  },
  {
    title: "Recommendations and ranking",
    content: `Our recommendation system is community-sourced. Recommendations are submitted by real users. We take active steps to detect and remove fake or paid-for recommendations, but we cannot guarantee the honesty of every entry.

Where we order tradespeople or recommendations on a page, we disclose the main parameters that determine that order. See our <a href="/ranking">Ranking Transparency</a> page.

We do not currently accept payment for ranking or promotion. If that changes, any sponsored or promoted placement will be clearly labelled as such.`,
  },
  {
    title: "Disclaimers",
    content: `The Platform is provided on an "as is" and "as available" basis. We don't promise it will always be available, error-free, or uninterrupted.

We make no warranties about:
- The accuracy or completeness of any User Content, including recommendations, ratings, or profile data
- The suitability, availability, or honesty of any tradesperson or homeowner
- The outcome of any job arranged via the Platform

Nothing in this section limits your rights as a consumer under the Consumer Rights Act 2015 or any other law that cannot be excluded by contract.`,
  },
  {
    title: "Limitation of liability",
    content: `To the fullest extent permitted by law, VetMyBuilder Ltd's total liability to you, arising out of or in connection with these Terms or the Platform, shall not exceed £250 in aggregate.

We are not liable for any:
- Indirect, incidental, special, or consequential losses
- Loss of profit, business, opportunity, or goodwill
- Loss or corruption of data (beyond our obligation to take reasonable security measures)
- Damages arising from the acts or omissions of other users, including any tradesperson engaged via the Platform

Nothing in these Terms limits our liability for:
- Death or personal injury caused by our negligence
- Fraud or fraudulent misrepresentation
- Any other liability that cannot lawfully be limited under English law
- Breach of any of your non-excludable rights under the Consumer Rights Act 2015`,
  },
  {
    title: "Reporting and takedown",
    content: `If you see content on the Platform that you believe breaches these Terms, our <a href="/acceptable-use">Acceptable Use Policy</a>, or the law, use the in-product "Report" button or email us at hello@vetmybuilder.com.

We aim to review reports within 48 hours. Our full process is described on the <a href="/moderation">Content Moderation Policy</a> page.`,
  },
  {
    title: "Intellectual property",
    content: `All code, design, branding, text and other materials on the Platform (excluding User Content) are owned by or licensed to VetMyBuilder Ltd and are protected by UK and international intellectual property laws.

You may not copy, modify, distribute, republish, or create derivative works from our materials without our prior written permission, except as strictly necessary to view and use the Platform as intended.

Some data is displayed under licence from third parties:
- Companies House data is Crown copyright, reused under the Companies House Open Government Licence.
- Google Maps / Places data is shown subject to Google's own terms and attribution requirements.`,
  },
  {
    title: "Termination",
    content: `You can close your account at any time. Email us at hello@vetmybuilder.com and we will process it within 14 days (see our <a href="/privacy">Privacy Policy</a> for what happens to your data after closure).

We may suspend or terminate your access, with or without notice, if:
- You breach these Terms
- We are required to do so by law
- Your account is inactive for an extended period (12+ months) and we have notified you

On termination, sections of these Terms that by their nature should survive (for example, intellectual property, limitation of liability, and governing law) continue to apply.`,
  },
  {
    title: "Governing law and jurisdiction",
    content: `These Terms and any dispute arising out of or in connection with them are governed by the laws of England and Wales.

The courts of England and Wales have exclusive jurisdiction over any such dispute, except that if you are a consumer you may have the right to bring a claim in the courts of the country in which you reside.`,
  },
  {
    title: "Contact",
    content: `Questions about these Terms? Contact us:
- Email: hello@vetmybuilder.com

Company number: 1627511`,
  },
];

const summary = (
  <>
    <h2 className="text-lg font-black text-zinc-900 mb-2">
      The plain English summary
    </h2>
    <p className="text-zinc-600 text-sm leading-relaxed">
      VetMyBuilder is a free platform that helps you find trusted tradespeople
      through community recommendations. We&apos;re the introducer - we&apos;re
      not the builder, we&apos;re not a party to the contract you make with the
      tradesperson, and we&apos;re not responsible for the quality of their
      work. Please be honest when leaving recommendations. You keep ownership
      of what you upload, but we need a licence to display it. UK law
      governs.
    </p>
  </>
);

export default function Terms() {
  return (
    <LegalPageLayout
      title="Terms of"
      titleAccent="Service"
      subtitle="The rules for using VetMyBuilder. Please read carefully - they form a legal agreement between you and us."
      lastUpdated="15 April 2026"
      metaDescription="VetMyBuilder terms of service under UK law - your rights, our obligations, and how the platform works."
      sections={sections}
      summary={summary}
      numbered
      footerCtaHref="/contact"
      footerCtaLabel="Contact us"
    />
  );
}
