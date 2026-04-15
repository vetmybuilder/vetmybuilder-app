// web/pages/privacy.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

// ---------------------------------------------------------------------------
// Privacy Policy - UK GDPR / Data Protection Act 2018 compliant.
//
// Placeholders marked [REVIEW] still need to be confirmed by Connect2Find
// Ltd before this goes live:
// - Registered company number (Companies House)
// - Registered office address
// - ICO registration number (once registered - £40/year, legally required
//   for commercial processing of personal data)
// - Analytics tool in production (currently none; if GA4 / Meta Pixel is
//   added, this page must be updated AND the cookie banner rolled out)
//
// Also note: before publishing, this document should go through a UK
// solicitor for a sanity pass. Templates and rewrites can only take you so
// far - the specific wording around the Verified badge, photo uploads, and
// deletion / anonymisation of recommendations is where the legal risk lives.
// ---------------------------------------------------------------------------

const CONTACT = "hello@vetmybuilder.com";

const sections: LegalSection[] = [
  {
    title: "Who we are",
    content: `Connect2Find Ltd (trading as VetMyBuilder, "we", "us", "our") operates the website at vetmybuilder.com (the "Platform"). We are a company registered in England and Wales.

This Privacy Policy explains how we collect, use, store, and protect your personal information when you use VetMyBuilder. It applies to homeowners, tradespeople, and anyone else who interacts with us.

**Contact for data protection matters:** ${CONTACT}

**Postal address:** Connect2Find Ltd, London, United Kingdom. [REVIEW: add full registered office]

**ICO registration:** [REVIEW: add ICO registration number once registered]`,
  },
  {
    title: "What personal data we collect",
    content: `**Information you give us directly:**
- Account registration: name, email address, a password (hashed - we never see the plain text), Firebase user identifier
- Profile information: your postcode or outward area, phone number (optional)
- Homeowner project data: job descriptions, category, photos, property type, budget range, timeframe
- Tradesperson profile: company name, contact name, trade types, service areas, website, social links, offered discounts, warranty terms, photos of your work
- Recommendations: tradesperson company name, written feedback, photos (optional)
- Communications with us: support emails, bug reports

**Information collected automatically:**
- Log data: IP address, browser type, pages visited, timestamps, requested URLs, referrer
- Essential cookies and local storage keys used to keep you signed in and route you to the correct area (see our <a href="/cookies">Cookie Policy</a>)
- Device information: operating system, user agent

**Information from third-party sources:**
- Google Firebase: authentication events, identity tokens
- Companies House (UK public register): company name, number, status, registered address, SIC codes - only when a tradesperson has supplied a company name we can match to a record
- Google Places / Maps: the business listing associated with a tradesperson's company name (place ID, rating, number of reviews, website) - only when the name matches a real-world listing with sufficient confidence

We do not collect special category data (health, ethnicity, biometric, political or religious data). If you post such information in a free-text field or photo, we may delete it on discovery.`,
  },
  {
    title: "How we use your data (and the lawful basis)",
    content: `Under UK GDPR we must have a "lawful basis" for each thing we do with your data. Here is the mapping:

**Operate your account and provide the Platform** - lawful basis: contract (Art 6(1)(b)). Without this data we cannot create or run your account.

**Match homeowners with tradespeople** - lawful basis: contract. We use project details and tradesperson service areas / trade types to surface relevant recommendations.

**Display tradesperson profiles publicly** - lawful basis: contract (for the tradesperson) and legitimate interest (for visitors browsing). Tradespeople choose what to publish.

**Verify tradespeople against Companies House** - lawful basis: legitimate interest. Helps homeowners trust the directory and reduces fraud.

**Enrich profiles with Google Places data** - lawful basis: legitimate interest. Adds useful context (rating, review count, website).

**Send transactional emails** - lawful basis: contract (account activity, security, project updates).

**Send marketing emails** - lawful basis: consent (Art 6(1)(a) + PECR). You can withdraw consent at any time using the unsubscribe link or by emailing us.

**Detect and prevent abuse, spam, fake recommendations** - lawful basis: legitimate interest. We log activity and may review reports of suspicious behaviour.

**Ranking and ordering of recommendations** - lawful basis: legitimate interest. See our <a href="/ranking">Ranking Transparency</a> page for what feeds the order.

**AI-assisted project classification and summarisation** - lawful basis: legitimate interest. We use Anthropic Claude to categorise projects and generate short summaries. Only the content you post is processed. No decision with a legal or similarly significant effect on you is automated.

**Comply with legal obligations** - lawful basis: legal obligation. For example, responding to court orders or retaining tax-relevant records.`,
  },
  {
    title: "Who we share your data with",
    content: `We do not sell your personal data.

We share it only with the following categories of recipient:

**Service providers** (processors acting on our instructions, under contract):
- Google Firebase (authentication, hosting) - EU and US regions
- Google Places API (company enrichment)
- Our email delivery provider - [REVIEW: confirm final provider, e.g. Postmark, SendGrid]
- Our hosting provider
- Anthropic (AI inference for project classification / summarisation)

A full up-to-date list is published at <a href="/sub-processors">our Sub-processors page</a>.

**Other users of the Platform:**
- When you submit a recommendation, your display name and feedback are visible to the homeowner who requested the recommendation and (if the tradesperson is active) may appear on the tradesperson's public profile.
- When a homeowner posts a project, tradespeople matched to that project can see basic job details relevant to deciding whether to express interest.

**Public sources:**
- Companies House - we query their public API. We only send company numbers or names; no personal data about our users leaves our systems when we do this.

**Law enforcement and regulators** - only where required by law, court order, or to protect the vital interests of users.

**In the event of a business transfer** - if Connect2Find Ltd is ever acquired or reorganised, user data may transfer as part of that transaction, subject to the same protections described here.`,
  },
  {
    title: "International transfers",
    content: `Some of our processors (notably Firebase and Anthropic) are headquartered in the United States. Where your data is transferred outside the UK / EEA, we rely on:
- The UK Addendum to the EU Standard Contractual Clauses, or
- The UK Extension to the EU-US Data Privacy Framework, where the recipient is certified.

We do not transfer your data to jurisdictions that lack equivalent legal safeguards.`,
  },
  {
    title: "How long we keep your data",
    content: `We keep your data only for as long as we need it. Our default retention periods:

- **Active account:** while your account is open.
- **Closed account:** we hard-delete or anonymise personal data within 30 days of account closure, except where we must retain it longer (see below).
- **Recommendations you made about others:** retained in anonymised form. This is a legitimate interest - other users relied on those recommendations when making decisions.
- **Project records:** retained for up to 3 years after a project is closed, to support dispute resolution.
- **Photos:** deleted when the parent project, recommendation, or profile is deleted.
- **Support emails:** up to 2 years.
- **Activity log (for abuse prevention):** up to 24 months.
- **Financial records (once payments are added):** 6 years, as required by HMRC.

You can always ask us to delete your data sooner (see Your rights below).`,
  },
  {
    title: "Your rights",
    content: `Under UK GDPR you have the right to:
- **Access** - request a copy of the personal data we hold about you
- **Rectification** - ask us to correct inaccurate data
- **Erasure** - ask us to delete your data, subject to our lawful retention obligations
- **Restriction** - ask us to pause processing while we resolve a dispute
- **Portability** - receive a copy of the data you gave us in a structured, machine-readable format (JSON)
- **Object** - object to processing based on legitimate interests; we will stop unless we have compelling grounds
- **Withdraw consent** - for anything we do based on consent (e.g. marketing emails)
- **Not be subject to solely automated decisions** that have legal or similarly significant effects - we don't make any such decisions, but if that changes we'll tell you

To exercise any right, email ${CONTACT}. We will respond within one calendar month. In complex cases we may extend by up to two further months and will tell you if we need to.

You also have the right to lodge a complaint with the UK Information Commissioner's Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a> or by calling 0303 123 1113.`,
  },
  {
    title: "Photos you upload",
    content: `Photos are a special category of content because they can contain personal data about people other than the uploader.

When you upload a photo you confirm that:
- You have the right to share it (you took it or have permission from the person who did)
- Anyone clearly identifiable in the photo has agreed to their image being used on the Platform
- The photo does **not** contain children
- The photo does not reveal someone else's home address or other private information they would not expect to be shared

We automatically strip location metadata (EXIF GPS coordinates) from uploads so your home address isn't exposed.

We may remove any photo that we reasonably believe breaches these rules. See our <a href="/moderation">Content Moderation Policy</a> for how we handle reports.`,
  },
  {
    title: "Cookies and similar technologies",
    content: `We use a small number of strictly-necessary cookies and local-storage keys to keep you signed in, route you between homeowner and tradesperson areas, and remember your consent choices.

We do not currently use analytics or advertising cookies. If that changes, we will add a consent banner that asks for your permission before any non-essential cookie is set.

Full list: see our <a href="/cookies">Cookie Policy</a>.`,
  },
  {
    title: "Security",
    content: `We take security seriously:
- All traffic is encrypted in transit (HTTPS).
- Passwords are never stored by us - authentication is handled by Google Firebase, which stores only a salted hash.
- Access to production systems is restricted to authorised team members on a need-to-know basis.
- We keep an internal audit log of admin actions so misuse can be investigated.

No system is perfectly secure. If you discover a vulnerability, please report it to ${CONTACT} and give us a reasonable chance to fix it before public disclosure.`,
  },
  {
    title: "Data breaches",
    content: `If we become aware of a personal data breach that is likely to result in a risk to your rights and freedoms, we will:
- Notify the Information Commissioner's Office (ICO) within 72 hours of becoming aware, and
- Notify affected users without undue delay where the risk is high.

We keep an internal incident response playbook so we know who does what when this happens.`,
  },
  {
    title: "Children",
    content: `VetMyBuilder is not intended for anyone under 18. Building services are regulated commercial work and we don't want to contract with minors. By creating an account you confirm you are at least 18 years old.

If you believe a child has created an account, please tell us at ${CONTACT} and we will delete it and any associated data promptly.`,
  },
  {
    title: "Changes to this policy",
    content: `We may update this Privacy Policy from time to time. The "Last updated" date at the top of this page tells you when it last changed.

For significant changes (for example, adding a new processor category or a new purpose for data use) we will also notify you by email and / or by a banner on the Platform.

Continued use of VetMyBuilder after changes constitutes acceptance of the updated policy. If you don't agree with a change, please contact us and / or close your account.`,
  },
];

export default function Privacy() {
  return (
    <LegalPageLayout
      title="Privacy"
      titleAccent="Policy"
      subtitle="We believe in being honest about how we handle your data. Here's everything you need to know."
      lastUpdated="15 April 2026"
      metaDescription="How VetMyBuilder collects, uses and protects your personal information under UK GDPR."
      sections={sections}
    />
  );
}
