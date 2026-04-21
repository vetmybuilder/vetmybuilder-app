// web/pages/complaints.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

const sections: LegalSection[] = [
  {
    title: "We want to hear from you",
    content: `If something on VetMyBuilder doesn't feel right - whether it's a bug, a concern about a specific tradesperson, a recommendation you think is fake, or anything else - we want to know.

This page explains how to complain, what we'll do with your complaint, and how long it will take.`,
  },
  {
    title: "How to complain",
    content: `**For problems with a tradesperson's actual work** - pricing disputes, quality, delivery timelines - please talk to the tradesperson directly first. VetMyBuilder is not a party to the contract between you and the tradesperson and we can't intervene in billing or quality disputes.

**For problems with the Platform itself** - a tradesperson profile that looks fake, a recommendation you suspect is dishonest, a photo that shouldn't be there, a bug, or anything else - contact us:

- Email: hello@vetmybuilder.com
- Subject line: "Complaint - [short description]"
- Include: your account email, a link to the relevant content or page, and a clear description of what happened

**For content reports** (fake recommendation, inappropriate photo, harassment) - you can also use the **Report** button next to the content. That's usually the fastest route.`,
  },
  {
    title: "What happens next",
    content: `**Acknowledgement:** we aim to acknowledge all complaints within 2 working days.

**Investigation:** we will look into what happened, which may involve checking our logs, reviewing the relevant accounts or content, and sometimes contacting the other party involved. Straightforward complaints are typically resolved within 10 working days. More complex ones may take longer and we will keep you updated.

**Outcome:** we will write back with a clear explanation of what we found and what we're doing about it. Possible outcomes include:
- Content removal
- Account warning, suspension, or termination
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
    title: "Online dispute resolution (consumers)",
    content: `If you are a consumer and we have been unable to resolve your complaint, you also have the right to use the European Commission's Online Dispute Resolution platform (where available for UK users post-Brexit), or to pursue the matter through the courts of England and Wales.

VetMyBuilder is currently a free service; we do not subscribe to an Alternative Dispute Resolution (ADR) scheme because we do not take payments from users. If and when that changes, we will publish our ADR scheme details here.`,
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
      lastUpdated="15 April 2026"
      metaDescription="VetMyBuilder's complaints policy - how to report problems and how we respond."
      sections={sections}
    />
  );
}
