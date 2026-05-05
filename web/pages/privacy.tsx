// web/pages/privacy.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

// ---------------------------------------------------------------------------
// Privacy Policy - UK GDPR / Data Protection Act 2018 compliant.
//
// This document should still be reviewed by a UK solicitor before launch -
// templates and rewrites can only take you so far. The legal risk lives in
// the specific wording around the Verified badge, photo / chat content, and
// deletion / anonymisation of recommendations.
// ---------------------------------------------------------------------------

const CONTACT = "hello@vetmybuilder.com";

const sections: LegalSection[] = [
  {
    title: "Who we are",
    content: `VetMyBuilder Ltd ("we", "us", "our") operates the website at vetmybuilder.com (the "Platform"). We are a company registered in England and Wales (Company No. 1627511).

This Privacy Policy explains how we collect, use, store, and protect your personal information when you use VetMyBuilder. It applies to homeowners, tradespeople, and anyone else who interacts with us.

**Contact for data protection matters:** ${CONTACT}

**Company number:** 1627511`,
  },
  {
    title: "What personal data we collect",
    content: `**Information you give us directly:**
- Account registration: name, email address, a password (hashed - we never see the plain text), Firebase user identifier
- Profile information: your postcode or outward area, phone number (optional)
- Homeowner project data: job descriptions, category, photos, property type, budget range, timeframe
- Tradesperson profile: company name, contact name, trade types, service areas, website, social links, offered discounts, warranty terms, photos of your work
- Recommendations: tradesperson company name, written feedback, photos (optional)
- Recommendation invites: when you recommend a tradesperson who isn't on the Platform yet, the name and email address you supply for that person
- Swipe decisions: which tradespeople you express interest in (homeowners) and which projects you express interest in (tradespeople)
- Chat messages: the text and any images you send to a matched homeowner or tradesperson
- Payment metadata: when you buy an unlock or pass, our payment processor returns a customer reference, the last four digits of the card, and the payment status. We never see the full card number.
- Push notification subscription: if you opt in, the browser-issued endpoint and keys we need to deliver push messages to your device
- Communications with us: support emails, bug reports, feedback

**Information collected automatically:**
- Log data: IP address, browser type, pages visited, timestamps, requested URLs, referrer
- Essential cookies and local-storage keys used to keep you signed in and route you to the correct area (see our <a href="/cookies">Cookie Policy</a>)
- Device information: operating system, user agent

**Information from third-party sources:**
- Google Firebase: authentication events, identity tokens
- UK public business registers: company name, number, status, registered address, business activity codes - looked up only when a tradesperson supplies a company name we can match to a record. We use this to power our Verified badge.
- Google Places / Maps: the business listing associated with a tradesperson's company name (place ID, rating, number of reviews, website) - only when the name matches a real-world listing with sufficient confidence

We do not collect special category data (health, ethnicity, biometric, political or religious data). If you post such information in a free-text field, chat message, or photo, we may delete it on discovery.`,
  },
  {
    title: "How we use your data (and the lawful basis)",
    content: `Under UK GDPR we must have a "lawful basis" for each thing we do with your data. Here is the mapping:

**Operate your account and provide the Platform** - lawful basis: contract (Art 6(1)(b)). Without this data we cannot create or run your account.

**Match homeowners with tradespeople** - lawful basis: contract. We use project details and tradesperson service areas / trade types to surface relevant tradespeople, and to rank them in a sensible order (see "Smart ranking" below).

**Display tradesperson profiles publicly** - lawful basis: contract (for the tradesperson) and legitimate interest (for visitors browsing). Tradespeople choose what to publish.

**Run our Verified badge** - lawful basis: legitimate interest. We cross-check tradesperson businesses against UK public business records to reduce fraud and help homeowners trust the directory. Only public information is used.

**Enrich profiles with Google Places data** - lawful basis: legitimate interest. Adds useful context (rating, review count, website).

**Run bilateral chat between matched users** - lawful basis: contract. Once a homeowner and tradesperson are matched (either through swipe-matching or after a paid unlock), we route messages and uploaded images between them.

**Process payments and grant access passes** - lawful basis: contract. We use Stripe to take payment for one-off unlocks and access passes. We store the payment reference, the amount, and the resulting entitlement.

**Send recommendation invites to tradespeople you nominate** - lawful basis: legitimate interest. When you (a homeowner) recommend a tradesperson by name and email, we email that tradesperson once to let them know they've been recommended and invite them to claim their profile. The recipient can opt out at any time and we will add their address to a suppression list.

**Send transactional emails and push notifications** - lawful basis: contract (account activity, security, project updates) for email; consent (Art 6(1)(a) and PECR) for push notifications, since you must explicitly opt in via your browser.

**Send marketing emails** - lawful basis: consent. You can withdraw consent at any time using the unsubscribe link or by emailing us.

**Detect and prevent abuse, spam, fake recommendations, harmful chat content** - lawful basis: legitimate interest. We log activity and may use automated tooling to flag risky content for human review.

**Comply with legal obligations** - lawful basis: legal obligation. For example, responding to court orders or retaining tax-relevant records.`,
  },
  {
    title: "Smart ranking and automated decisions",
    content: `When we surface tradespeople to a homeowner (and projects to a tradesperson), we rank the results in an order that takes into account:

- Whether the tradesperson covers the homeowner's location and trade type
- Verified status (badge held against UK public business records)
- Community recommendations and ratings
- Profile completeness (photos, service areas, warranty)
- Recent platform activity

The ranking is generated by automated software (we sometimes call it "smart-ranked"). It is not a "solely automated decision with legal or similarly significant effect" under Article 22 of UK GDPR - it just orders results, and a homeowner is always free to scroll past the top suggestion or pick a different tradesperson. If at any point we introduce automated decisions that DO have legal or significant effect on you, we will tell you, give you a way to ask for human review, and the right to contest the decision.

We use Anthropic Claude to support some of this ranking and to generate short project summaries from the text you write. Only the content you post is processed. The model does not retain your data for its own training under our contract.`,
  },
  {
    title: "Messages and chat",
    content: `Once you and another user are matched - either by both swiping right, or after a tradesperson pays to unlock contact for a project - you can chat in the app and share photos.

**Who can see your messages:**
- You and the other party in the conversation.
- Our trust and safety team, but only if a message is reported, flagged by abuse-detection tooling, or required by law.
- We do not share chat content with third parties for marketing or analytics.

**Automated content checks:** chat messages and images may be scanned by automated tooling to detect things like attempted off-platform contact (which our Terms prohibit), payment scams, abusive content, or images that appear to violate our Photo rules. Detection is fast and lossy - false positives are reviewed by a human before any action is taken.

**Retention:** chat messages and any attached images are retained for up to 24 months after the last message in a conversation, then deleted. If either party closes their account sooner, we delete or anonymise as set out in "How long we keep your data" below.

**Your rights:** you can ask for a copy of your messages, ask us to correct any factual error in them, or ask us to delete them - subject to the legitimate interests of the other party in the conversation and to our retention obligations.`,
  },
  {
    title: "Payments and passes",
    content: `Payments for one-off unlocks and access passes are handled by Stripe Payments Europe Ltd, a payment service provider. Stripe is a separate data controller for the card transaction itself.

**What Stripe sees:** card number, name on card, billing address (if provided). This information goes directly to Stripe and is never seen by us.

**What we store:** a Stripe customer / payment reference, the last four digits of the card, the amount paid, the status (succeeded / refunded), and the entitlement that was granted (e.g. "30-day pass" or "one-off unlock for project X").

**Refunds:** see our <a href="/terms">Terms of Service</a> for the refund policy. Where we issue a refund, the underlying card transaction is reversed by Stripe.

**Records retention:** financial records are retained for 6 years to meet HMRC obligations.`,
  },
  {
    title: "Recommendation invites",
    content: `When a homeowner recommends a tradesperson who isn't on VetMyBuilder yet, we ask for that tradesperson's name and email address so we can send them one invite email.

**The invite email contains:** who recommended them, a link to claim their profile, and a clear unsubscribe link. We do not message that email address again unless they create an account.

**If they don't claim:** we keep the nomination for up to 6 months (so a future homeowner can find the same tradesperson without you having to nominate them again), then anonymise it. The original recommender's data is unaffected.

**Opt out:** if you receive an invite and don't want to be on the Platform, click the unsubscribe link or email us at ${CONTACT}. We will add your address to a permanent suppression list and delete any pending nominations.

**Your responsibility:** by submitting a tradesperson's email you confirm you reasonably believe they would expect to hear from us in this context. Don't use the recommendation form to invite people you don't actually have a working relationship with.`,
  },
  {
    title: "Photos you upload",
    content: `Photos you upload to projects, recommendations, your profile, or chat messages are a special category of content because they can contain personal data about people other than the uploader.

When you upload a photo you confirm that:
- You have the right to share it (you took it or have permission from the person who did)
- Anyone clearly identifiable in the photo has agreed to their image being used on the Platform
- The photo does **not** contain children
- The photo does not reveal someone else's home address or other private information they would not expect to be shared

We automatically strip location metadata (EXIF GPS coordinates) from uploads so your home address isn't exposed.

We may remove any photo that we reasonably believe breaches these rules. See our <a href="/moderation">Content Moderation Policy</a> for how we handle reports.`,
  },
  {
    title: "Push notifications",
    content: `If you grant your browser permission, we can send push notifications for things like new matches, new chat messages, and project updates.

**What we store:** the browser-issued push subscription (an endpoint URL and a pair of public keys). We don't get your phone number or device identifier.

**What pushes contain:** typically the title of the event ("New message from a tradesperson"), a short preview, and a link back into the Platform. Sensitive personal data is not included.

**Turn it off:** revoke notification permission in your browser, or sign out. We delete subscriptions that fail to deliver for an extended period, or that haven't been used in 12 months.`,
  },
  {
    title: "Who we share your data with",
    content: `We do not sell your personal data.

We share it only with the following categories of recipient:

**Service providers** (processors acting on our instructions, under contract):
- Google Firebase (authentication, identity)
- Google Places API (company enrichment)
- Anthropic (AI inference for project classification, summarisation, and content moderation)
- Stripe Payments Europe Ltd (payments - acting as a separate controller for card data)
- Cloudflare R2 (storage of images attached to projects, recommendations, profiles, and chat messages)
- Web push delivery (Apple Push Notification Service / Firebase Cloud Messaging - browser-issued endpoints we cannot avoid using)
- Our email delivery provider (transactional and recommendation-invite emails)
- Our hosting provider

A full up-to-date list is published at <a href="/sub-processors">our Sub-processors page</a>.

**Other users of the Platform:**
- When you submit a recommendation, your display name and feedback are visible to the homeowner who requested it and (if the tradesperson is active) may appear on the tradesperson's public profile.
- When a homeowner posts a project, tradespeople matched to that project can see basic job details relevant to deciding whether to express interest.
- Once two users are matched, the chat between them is visible to both parties, and to our trust and safety team only when a message is reported, flagged, or required by law.

**Public sources:**
- UK public business registers - we query their public API to power our Verified badge. We only send company numbers or names; no personal data about our users leaves our systems when we do this.

**Law enforcement and regulators** - only where required by law, court order, or to protect the vital interests of users.

**In the event of a business transfer** - if VetMyBuilder Ltd is ever acquired or reorganised, user data may transfer as part of that transaction, subject to the same protections described here.`,
  },
  {
    title: "International transfers",
    content: `Some of our processors (notably Firebase, Anthropic, Stripe and Cloudflare R2) are headquartered in or operate from the United States. Where your data is transferred outside the UK / EEA, we rely on:
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
- **Chat messages and chat photos:** up to 24 months after the last message in a conversation.
- **Photos elsewhere on the Platform:** deleted when the parent project, recommendation, or profile is deleted.
- **Recommendation invites:** up to 6 months after sending, then anonymised.
- **Push notification subscriptions:** until revoked or 12 months of non-delivery.
- **Support emails:** up to 2 years.
- **Activity log (for abuse prevention):** up to 24 months.
- **Financial records:** 6 years, as required by HMRC.

You can always ask us to delete your data sooner (see "Your rights" below).`,
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
- **Withdraw consent** - for anything we do based on consent (e.g. push notifications, marketing emails)
- **Not be subject to solely automated decisions that have legal or similarly significant effect** - we don't currently make any such decisions. Our smart-ranking system orders results but does not deny anyone a service. If that changes we will tell you and give you the right to ask for human review.

To exercise any right, email ${CONTACT}. We will respond within one calendar month. In complex cases we may extend by up to two further months and will tell you if we need to.

You also have the right to lodge a complaint with the UK Information Commissioner's Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a> or by calling 0303 123 1113.`,
  },
  {
    title: "Cookies and similar technologies",
    content: `We use a small number of strictly-necessary cookies and local-storage / session-storage keys to keep you signed in, route you between homeowner and tradesperson areas, and remember your consent choices.

We do not currently use analytics or advertising cookies. If that changes, we will add a consent banner that asks for your permission before any non-essential cookie is set.

Push notifications use a browser-issued subscription rather than a cookie, but they do require your explicit consent and you can revoke it at any time.

Full list: see our <a href="/cookies">Cookie Policy</a>.`,
  },
  {
    title: "Security",
    content: `We take security seriously:
- All traffic is encrypted in transit (HTTPS).
- Passwords are never stored by us - authentication is handled by Google Firebase, which stores only a salted hash.
- Card data is never stored by us - it goes directly to Stripe.
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
    content: `VetMyBuilder is not intended for anyone under 18. Trade work is regulated commercial activity and we don't want to contract with minors. By creating an account you confirm you are at least 18 years old.

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
      lastUpdated="29 April 2026"
      metaDescription="How VetMyBuilder collects, uses and protects your personal information under UK GDPR."
      sections={sections}
    />
  );
}
