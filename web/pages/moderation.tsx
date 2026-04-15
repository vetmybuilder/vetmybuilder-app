// web/pages/moderation.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

const sections: LegalSection[] = [
  {
    title: "What this page covers",
    content: `This page explains how we moderate content on VetMyBuilder - how reports are reviewed, what actions we can take, and how appeals work.

This sits alongside our <a href="/acceptable-use">Acceptable Use Policy</a> (which says **what's not allowed**) and the <a href="/complaints">Complaints Policy</a> (which covers wider complaints about the Platform).`,
  },
  {
    title: "What we moderate",
    content: `Content you can report and we will review includes:
- Tradesperson profile information (company name, trade claims, photos)
- Recommendations (written feedback, photos)
- Homeowner project posts (photos, descriptions)
- User-to-user messages (where available)
- Reports of fake, paid-for, or incentivised recommendations
- Reports of harassment or abuse via the Platform

We do **not** moderate work performed off-platform. If a tradesperson does a poor job, raise it with them directly - we're not in a position to arbitrate the underlying work.`,
  },
  {
    title: "How to report content",
    content: `**In-product:** use the **Report** button shown next to most content (profiles, recommendations, photos). This is the fastest route because the context is attached automatically.

**By email:** hello@vetmybuilder.com. Please include a link to the content and a short explanation.

When you report content, choose a category so we can route it correctly:
- **Fake or incentivised recommendation** - evidence the reviewer doesn't know the tradesperson, or was paid / offered benefits
- **Inappropriate image** - contains children, identifiable third parties who haven't consented, nudity or violence
- **Harassment or abuse** - threatening or aggressive behaviour
- **Misleading claims** - trade qualifications that look false, pricing claims that don't match what was offered
- **Illegal content** - anything that would be an offence under UK law
- **Spam** - off-topic promotion, bot-generated content
- **Something else** - free text`,
  },
  {
    title: "Response times",
    content: `Our targets:

- **Acknowledgement** of a report: within 2 working days
- **Review** completed: within 48 hours for clearly illegal content, and within 10 working days for most other categories

Illegal content is removed immediately on discovery; we don't wait for a formal investigation before taking it down.

Where the review needs to involve the person who posted the content (for example, a fake-recommendation investigation where we want their side), we'll give them a reasonable chance to respond - typically 7 days - before deciding.`,
  },
  {
    title: "What actions we can take",
    content: `Depending on what we find, we may:

- **Take no action** - if we think the content is within the rules. We'll tell you why.
- **Edit or redact** - for example, blurring an identifiable face or removing a phone number that shouldn't be public.
- **Remove** the content, with or without telling the poster.
- **Warn** the poster and ask them not to do it again.
- **Restrict** the poster's account - for example, stopping them from uploading new photos for a period.
- **Suspend** the account - they remain signed up but can't use the Platform until the issue is resolved.
- **Terminate** the account - permanent removal.
- **Report to law enforcement** - for illegal content (for example, imagery of children we will always report to the National Crime Agency's Child Exploitation and Online Protection command, CEOP).`,
  },
  {
    title: "Automated decisions",
    content: `We do not use automated systems to make final moderation decisions that would significantly affect a user. AI tools may surface content for human review (for example, flagging a photo that looks like it might contain people), but a person makes the decision on action.`,
  },
  {
    title: "Appeals",
    content: `If we have removed your content or restricted your account, you can appeal. Email hello@vetmybuilder.com within 30 days of the action. Tell us:
- What was removed or restricted
- Why you think the decision was wrong

A different team member from the one who made the original decision (where practical) will review the appeal and respond within 10 working days. If we reverse our decision, we'll restore the content or lift the restriction as quickly as we can.`,
  },
  {
    title: "Transparency",
    content: `As we grow we plan to publish periodic transparency reports showing how many reports we received, how many we actioned, and how quickly. We'll share the first one once we have a meaningful volume of data to report on.`,
  },
];

export default function Moderation() {
  return (
    <LegalPageLayout
      title="Content"
      titleAccent="Moderation"
      subtitle="How we review reports, what actions we can take, and your right to appeal."
      lastUpdated="15 April 2026"
      metaDescription="VetMyBuilder's content moderation policy - reporting, review process, and appeals."
      sections={sections}
    />
  );
}
