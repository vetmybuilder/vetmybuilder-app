// web/pages/terms.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

// ---------------------------------------------------------------------------
// Terms of Service - UK-law-governed. Operating entity: VetMyBuilder Ltd
// (trading as VetMyBuilder).
//
// Must be solicitor-reviewed before publishing, especially:
// - Section "Tradespeople: Verified badge" - DMCC exposure
// - Section "Limitation of liability" - CRA 2015 fairness test
// - Section "Your content" - scope and sublicensing
// - Section "Payments and access passes" - refund policy alignment with
//   Consumer Contracts (Information, Cancellation and Additional Charges)
//   Regulations 2013, especially the digital-content immediate-supply
//   waiver.
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
    content: `VetMyBuilder is a **technology platform** that connects UK homeowners with tradespeople. We let homeowners:
- Post jobs and share an invite link with their personal community
- Collect recommendations from people in their community
- View tradesperson profiles, Verified status, and smart-ranked matches
- Express interest by swiping through a deck of suggested tradespeople
- Chat directly with a tradesperson once both parties have shown interest, or after the tradesperson has paid to unlock contact

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
    content: `You keep ownership of anything you upload or submit to the Platform - job descriptions, recommendations, profile info, photos, chat messages and chat attachments ("User Content").

By submitting User Content, you grant VetMyBuilder Ltd a non-exclusive, royalty-free, worldwide licence to host, store, display, reproduce, and distribute that content **as necessary to operate the Platform** and to describe or promote the Platform in our own marketing (for example, anonymised examples of the service in action). The marketing licence does not extend to chat content.

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
- Solicit users to transact outside the Platform for the purpose of evading our moderation, fee structure, or trust and safety controls
- Circumvent any access controls, rate limits, or security measures
- Use the Platform in a way that breaks the law or infringes on anyone's rights

Our full <a href="/acceptable-use">Acceptable Use Policy</a> has the detail. Breaches can result in content removal, account suspension, or account termination.`,
  },
  {
    title: "Tradespeople: Verified badge",
    content: `We show a **Verified** badge on tradesperson profiles where we have been able to confirm a real UK-registered business and a matching public business listing.

**What Verified means:**
- A registered UK business of that name exists on a public register and is in an active filing state at the time of the last check
- A public business listing matches the same name and trading location

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

Where we order tradespeople or recommendations on a page (we sometimes call this "smart-ranked"), we disclose the main parameters that determine that order. See our <a href="/ranking">Ranking Transparency</a> page.

We do not currently accept payment for ranking or promotion. If that changes, any sponsored or promoted placement will be clearly labelled as such.`,
  },
  {
    title: "Recommendation invites",
    content: `When a homeowner recommends a tradesperson who is not yet on the Platform, we send that tradesperson one invite email letting them know they have been recommended and giving them a way to claim their profile.

By submitting a tradesperson's name and email through the recommendation form, you confirm that:
- You have a genuine working relationship with the tradesperson
- You reasonably believe they would expect to be contacted in this context
- You are not using the form to invite people you do not actually know

The invitee can opt out at any time. Misuse of the recommendation form may result in your account being suspended.`,
  },
  {
    title: "Chat between matched users",
    content: `Once a homeowner and a tradesperson are matched - either through swipe-matching, or after the tradesperson has paid to unlock contact for a specific project - the Platform provides an in-app chat with image upload.

When using chat you must:
- Treat the other user with basic respect
- Stay on-topic for the project at hand
- Not solicit personal contact details (phone number, email, address) before either party is ready to share them, and never as a way to take the conversation off the Platform to evade payment or moderation
- Not send unsolicited marketing, spam, or repeat messages
- Not send sexual, threatening, or harassing content
- Not send links to malware, phishing, or scam pages

We log chat content in encrypted storage. Messages and attached images are accessed by our trust and safety team only when reported, flagged, or required by law (for example, court order). Automated tooling may scan for breaches of these rules; flagged messages are reviewed by a human before any action is taken.

Repeated breaches of the chat rules can result in restricted chat access, account suspension, or termination.`,
  },
  {
    title: "Payments and access passes",
    content: `**Homeowners do not pay us.** Posting a job, receiving recommendations, swiping through tradespeople, and chatting with a matched tradesperson are free for homeowners.

Tradespeople may purchase:
- A **one-off unlock** that allows them to send a first message to a homeowner whose project they did not match with through the deck
- A **time-limited access pass** (e.g. 7-day, 14-day, 30-day) that allows them to send first messages without unlocking each project individually

Payments are processed by **Stripe Payments Europe Ltd**. We never see your full card number. We store the Stripe payment reference, the last four digits of the card, the amount, the status, and the entitlement granted (e.g. "30-day pass" or "one-off unlock for project X").

**No auto-renewal.** Access passes are one-off purchases that expire at the end of their term. We will not charge your card again without an explicit new purchase.

**Refunds.** Because access passes and one-off unlocks are digital services delivered immediately on payment, the statutory 14-day cancellation right under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 does not apply once you start using the entitlement. We will issue a refund where:
- The Platform was unavailable for a substantial part of the period through our fault
- The entitlement was charged to you in error
- We are otherwise required to refund by law

Email hello@vetmybuilder.com to request a refund.

VAT receipts are available on request.`,
  },
  {
    title: "Push notifications",
    content: `If you grant browser permission, we may send push notifications about new matches, chat messages, and project updates. You can revoke this permission at any time in your browser's site settings, or by signing out.

Push notifications are not used for marketing without your separate explicit consent.`,
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
    content: `To the fullest extent permitted by law, VetMyBuilder Ltd's total liability to you, arising out of or in connection with these Terms or the Platform, shall not exceed £250 in aggregate (or, if you are a tradesperson who has paid us in the previous 12 months, the greater of £250 or the total amount you have paid us in those 12 months).

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
- UK public business register data is Crown copyright, reused under the relevant Open Government Licence.
- Google Maps / Places data is shown subject to Google's own terms and attribution requirements.`,
  },
  {
    title: "Termination",
    content: `You can close your account at any time. Email us at hello@vetmybuilder.com and we will process it within 14 days (see our <a href="/privacy">Privacy Policy</a> for what happens to your data after closure).

Closing a tradesperson account ends any unused portion of an active access pass without entitlement to a refund of the unused days, except where required by law.

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
    <h2
      className="text-lg font-extrabold text-slate-900 mb-2"
      style={{ fontFamily: "'Sora', sans-serif" }}
    >
      The plain English summary
    </h2>
    <p className="text-slate-700 text-sm leading-relaxed">
      VetMyBuilder helps you find trusted tradespeople through community
      recommendations and smart-ranked matching. We&apos;re the introducer -
      we&apos;re not the tradesperson, we&apos;re not a party to the contract
      you make with them, and we&apos;re not responsible for the quality of
      their work. Homeowners do not pay us. Tradespeople can pay to unlock
      contact for projects, with no auto-renewal. Please be honest when
      leaving recommendations and respectful in chat. You keep ownership of
      what you upload, but we need a licence to display it. UK law governs.
    </p>
  </>
);

export default function Terms() {
  return (
    <LegalPageLayout
      title="Terms of"
      titleAccent="Service"
      subtitle="The rules for using VetMyBuilder. Please read carefully - they form a legal agreement between you and us."
      lastUpdated="29 April 2026"
      metaDescription="VetMyBuilder terms of service under UK law - your rights, our obligations, and how the platform works."
      sections={sections}
      summary={summary}
      numbered
      footerCtaHref="/contact"
      footerCtaLabel="Contact us"
    />
  );
}
