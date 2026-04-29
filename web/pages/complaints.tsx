// web/pages/complaints.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

const sections: LegalSection[] = [
  {
    title: "We want to hear from you",
    content: `If something on VetMyBuilder doesn't feel right - whether it's a bug, a concern about a specific tradesperson, a recommendation you think is fake, a problem with a chat message, or a payment issue - we want to know.

This page explains how to complain, what we'll do with your complaint, and how long it will take.`,
  },
  {
    title: "How to complain",
    content: `**For problems with a tradesperson's actual work** - pricing disputes between you and the tradesperson, quality, delivery timelines - please talk to the tradesperson directly first. VetMyBuilder is not a party to the contract between you and the tradesperson and we can't intervene in those disputes.

**For problems with the Platform itself** - a tradesperson profile that looks fake, a recommendation you suspect is dishonest, a photo that shouldn't be there, a chat message that breaks our rules, a bug, or anything else - contact us:

- Email: hello@vetmybuilder.com
- Subject line: "Complaint - [short description]"
- Include: your account email, a link to the relevant content or page, and a clear description of what happened

**For content reports** (fake recommendation, inappropriate photo, harassing chat message) - you can also use the **Report** button next to the content. That's usually the fastest route.

**For payment or billing problems** - see the dedicated section below.`,
  },
  {
    title: "Reporting harmful chat content",
    content: `Chat between matched users is private to both parties. If you receive a message that:
- Contains harassment, threats, or abusive language
- Tries to take the conversation off the Platform to evade payment or trust and safety controls
- Looks like a scam, phishing, or asks for sensitive personal data
- Sends sexual or otherwise inappropriate content
- Is spam

...please use the **Report** button on the chat thread, or email hello@vetmybuilder.com with a screenshot. We will review the message, may suspend the offending account, and will keep you updated on the outcome.

If you feel you are in immediate danger, contact the police on 999.`,
  },
  {
    title: "Billing and refund complaints (tradespeople)",
    content: `If you are a tradesperson and have a problem with a charge:

**For a duplicate charge or charge you don't recognise** - email hello@vetmybuilder.com with the date, amount, and the email address on the account. We will investigate and, where the charge was made in error, refund it.

**For a refund of an access pass or one-off unlock** - see our <a href="/terms">Terms of Service</a> for the refund policy. In short, because passes and unlocks are digital services delivered immediately, the statutory 14-day cancellation right does not apply once you start using the entitlement, but we will refund where the Platform was unavailable through our fault, where you were charged in error, or where required by law.

**Card payment disputes** - card transactions are handled by Stripe Payments Europe Ltd. You also have rights under your card scheme (e.g. chargeback) - contact your bank if you cannot reach a resolution with us.`,
  },
  {
    title: "What happens next",
    content: `**Acknowledgement:** we aim to acknowledge all complaints within 2 working days.

**Investigation:** we will look into what happened, which may involve checking our logs, reviewing the relevant accounts or content, and sometimes contacting the other party involved. Straightforward complaints are typically resolved within 10 working days. More complex ones may take longer and we will keep you updated.

**Outcome:** we will write back with a clear explanation of what we found and what we're doing about it. Possible outcomes include:
- Content removal
- Account warning, suspension, or termination
- A refund or account credit
- A bug fix
- A change to our Terms or policies
- An apology and acknowledgement that we got it wrong
- A decision that we won't take further action, with our reasons

**If you're not satisfied:** you can ask us to reconsider. Reply to our response within 30 days and we'll have a different team member (where practical) take a fresh look.`,
  },
  {
    title: "Data protection complaints",
    content: `If your complaint is specifically about how we've handled your personal data, you also have the right to complain directly to the UK Information Commissioner's Office (ICO) at any time:

- Website: <a href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a>
- Helpline: 0303 123 1113

You don't have to go through us first. We'd prefer the chance to fix it, but it's your right either way.`,
  },
  {
    title: "Dispute resolution",
    content: `If we have been unable to resolve your complaint, you can pursue the matter through the courts of England and Wales.

We do not currently subscribe to an Alternative Dispute Resolution (ADR) scheme. The European Commission's Online Dispute Resolution platform is no longer available for UK users following Brexit.

If we adopt an ADR scheme in future (for example, alongside expanded paid features), we will publish the scheme's details here.`,
  },
  {
    title: "Contact",
    content: `VetMyBuilder Ltd
Email: hello@vetmybuilder.com

Company number: 1627511`,
  },
];

export default function Complaints() {
  return (
    <LegalPageLayout
      title="Complaints"
      titleAccent="Policy"
      subtitle="How to raise a concern about VetMyBuilder, how we handle it, and what to expect."
      lastUpdated="29 April 2026"
      metaDescription="VetMyBuilder's complaints policy - how to report problems and how we respond."
      sections={sections}
    />
  );
}
