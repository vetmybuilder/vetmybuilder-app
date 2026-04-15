// web/pages/acceptable-use.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

// ---------------------------------------------------------------------------
// Acceptable Use Policy - required by:
// - Online Safety Act 2023 (reporting + moderation framework)
// - DMCC 2024 (fake review prohibition)
// - Consumer Protection from Unfair Trading Regulations
//
// This page consolidates prohibited-content rules and the photo-upload
// consent language so that a single URL can be referenced from:
// - the homeowner and tradesperson sign-up flows (age + photo checkboxes)
// - upload UI components
// - the in-product report flow
// ---------------------------------------------------------------------------

const sections: LegalSection[] = [
  {
    title: "Who this applies to",
    content: `This Acceptable Use Policy ("AUP") applies to everyone who uses VetMyBuilder - homeowners, tradespeople, and anyone else who creates an account or posts content.

It forms part of our <a href="/terms">Terms of Service</a>. Breaching this AUP can result in content removal, account suspension, or account termination.`,
  },
  {
    title: "Content you must not post",
    content: `You must not post, upload, or share any content that:

- **Is illegal** under UK law - this includes hate speech, incitement to violence, defamation, obscenity, and anything involving the sexual exploitation of minors
- **Threatens or harasses** another person
- **Contains personal data of third parties** without their consent - full names of neighbours, private addresses, contact details, photos of identifiable people who haven't agreed, etc.
- **Identifies or depicts children** - no photos of children, no job descriptions that name a child, no content that could be used to identify a child
- **Infringes intellectual property** - no photos, text, or other material you don't have the rights to share
- **Is a fake, paid-for, or incentivised recommendation** - see the section below
- **Is misleading or fraudulent** - false trade claims, inflated qualifications, sham company names
- **Is nudity, sexual content, or violent imagery**
- **Is malware, phishing, spam**, or contains links designed to harm other users
- **Advertises or promotes a service unrelated to VetMyBuilder**`,
  },
  {
    title: "Fake and incentivised recommendations",
    content: `Recommendations on VetMyBuilder must be genuine, based on a real experience, and written by the person whose name appears on them.

You must not:
- Write a recommendation for a tradesperson you have never worked with or seen work directly
- Write a recommendation in exchange for money, discounts, gifts, or any other benefit
- Ask someone else to write a recommendation for a tradesperson they don't know
- Write a recommendation for your own company (or one you have a financial interest in)
- Coordinate recommendations with other users to boost a specific tradesperson artificially

We take active steps to detect and remove fake recommendations. Where we find patterns of abuse we will remove the recommendations and may suspend the accounts involved.

Fake review schemes are also **illegal** under the Digital Markets, Competition and Consumers Act 2024 - the Competition and Markets Authority can take action directly against those involved.`,
  },
  {
    title: "Photo uploads",
    content: `When you upload photos to VetMyBuilder - whether as a tradesperson showcasing your work or as a homeowner describing a project - you confirm that:

- **You have the right to share the photo.** You took it, or the person who took it has given you permission to use it.
- **Anyone clearly identifiable has agreed.** If a person's face, name badge, or other identifying detail is visible, they have agreed to the photo appearing on the Platform.
- **No children are visible.** Photos must not contain identifiable children under 18.
- **No private information is visible.** Door numbers combined with street names, licence plates, or other details that could identify someone's home address should be removed or obscured before upload.

We automatically strip location metadata (GPS coordinates embedded in the image file) from uploaded photos so your home address isn't leaked.

If you see a photo that breaches these rules, use the **Report** button or email us - see "Reporting and takedown" below.`,
  },
  {
    title: "Tradesperson obligations",
    content: `If you use the Platform as a tradesperson, you additionally agree to:

- Only list trades you are actually qualified and equipped to perform
- Keep your company information, service areas, and contact details accurate
- Respond to project interest promptly or mark yourself as unavailable
- Carry appropriate insurance for the work you undertake (we do not verify this; it's your responsibility)
- Honour any quotes, pricing, or warranty terms you publish on your profile
- Not solicit users to transact outside the Platform in order to evade moderation or artificially suppress recommendations`,
  },
  {
    title: "Technical abuse",
    content: `You must not:
- Scrape, crawl, or systematically extract data from the Platform, including via automated agents
- Reverse engineer, decompile, or attempt to find vulnerabilities in our systems (except via a responsible-disclosure report to hello@vetmybuilder.com)
- Overload the Platform with excessive requests
- Circumvent rate limits, access controls, or account restrictions
- Use the Platform to distribute malware or execute a phishing attack`,
  },
  {
    title: "Reporting and takedown",
    content: `If you see content that breaks this AUP, please report it:

- Use the **Report** button next to the content (available on profiles, recommendations, and photos where supported)
- Or email hello@vetmybuilder.com with a link to the content and a short explanation

We aim to review reports within **48 hours**. Where content is clearly illegal (for example, images of children, threats of violence) we will remove it immediately.

Our full moderation process - categories of action, appeal rights, timeframes - is on the <a href="/moderation">Content Moderation Policy</a> page.`,
  },
  {
    title: "Consequences of breaking this policy",
    content: `Depending on the severity and pattern of the breach, we may:
- **Remove** the offending content with no further action
- **Warn** you and ask you to change your behaviour
- **Restrict** what you can do on the Platform (for example, preventing further posts for a period)
- **Suspend** your account
- **Terminate** your account, delete your content, and (where necessary) prevent you from signing up again
- **Report** to law enforcement if we believe a criminal offence has taken place

For illegal content involving children we will always report to the relevant authorities and retain any information required by law.`,
  },
  {
    title: "Appeals",
    content: `If you believe your content was removed or your account was restricted in error, email hello@vetmybuilder.com within 30 days of the action. Include:
- Your account email
- A link to the content (if applicable)
- The reason you believe the decision was wrong

A member of our team (not the one who made the original decision, where practical) will review and reply within 10 working days.`,
  },
  {
    title: "Changes",
    content: `We may update this AUP as the Platform evolves. Material changes will be notified by email or by a banner. The "Last updated" date above tells you when the current version took effect.`,
  },
];

export default function AcceptableUse() {
  return (
    <LegalPageLayout
      title="Acceptable"
      titleAccent="Use Policy"
      subtitle="The rules for what you can and can't post on VetMyBuilder. Keeping the Platform honest and safe is a shared job."
      lastUpdated="15 April 2026"
      metaDescription="What content is allowed on VetMyBuilder, how to report problems, and what happens if the rules are broken."
      sections={sections}
    />
  );
}
