// web/pages/ranking.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

// ---------------------------------------------------------------------------
// Ranking Transparency - required by:
// - Platform-to-Business (P2B) Regulation 2019/1150
// - Digital Markets, Competition and Consumers Act 2024
//
// [REVIEW] The exact signals below must match what the code actually
// does. Update this page whenever the recommendation scoring algorithm
// changes. A deliberate design decision not documented here is a
// compliance risk.
// ---------------------------------------------------------------------------

const sections: LegalSection[] = [
  {
    title: "Why this page exists",
    content: `When we show lists of tradespeople or recommendations - on the homepage, on project pages, in shortlists, or in search - we usually don't show them in random order. Something is deciding the order.

UK law (specifically the Platform-to-Business Regulation and the Digital Markets, Competition and Consumers Act) requires us to explain in plain English what drives that order. This page does that.

If the order is changing in a way that feels surprising, this page should explain why.`,
  },
  {
    title: "Where ranking appears",
    content: `We order tradespeople and recommendations in the following places:

- **Project "Top recommendations"** - when a homeowner opens a project page, we show a short list of the most relevant recommendations first.
- **"Featured" and "Spotlight" placements on the homepage** - editorial picks (see below).
- **Tradesperson search / browse pages** - when a homeowner is looking for a tradesperson in their area.
- **Admin leaderboards** - internal tools; not shown to end users.

All other lists (for example, "all recommendations on this project") are either chronological or filterable by you.`,
  },
  {
    title: "What drives ranking on project pages",
    content: `When ordering recommendations on a specific project, we combine the following signals. More important signals are listed first:

- **Match to the project's requirements** - we use the project's category (e.g. "Bathroom") and work type (e.g. "Bathroom Flooring") to prioritise tradespeople who offer exactly that work in the project's area.
- **Community recommendations count** - how many people in the homeowner's community have recommended this tradesperson.
- **Hire-through rate and history** - recommendations that have previously led to a hire get a small boost.
- **Recency** - recent activity beats old activity. A recommendation from last month ranks higher than one from 3 years ago for the same tradesperson.
- **Verified status** - Verified tradespeople get a small boost. See <a href="/verified">What does Verified mean?</a>.
- **Profile completeness** - tradespeople with photos, trade types, and service areas listed rank higher than profiles with little information.

We do not currently use the tradesperson's Google star rating as a ranking signal (we display it, but it doesn't drive order).`,
  },
  {
    title: "Featured and Spotlight placements",
    content: `Some pages include a "Featured" or "Spotlight" section. These are **editorial placements** - tradespeople chosen by the VetMyBuilder team because we think they provide a useful example of a well-completed profile, a strong community following, or a recent quality job.

**We do not currently accept payment for Featured or Spotlight placement.** If that changes, every sponsored placement will be clearly labelled (for example, with a "Promoted" tag) and this page will be updated to explain the arrangement.`,
  },
  {
    title: "What does NOT influence ranking",
    content: `To be explicit:

- **We do not accept money for ranking.** No tradesperson can pay to appear higher in any list.
- **Your personal data is not used to rank tradespeople differently for you.** A given project with given criteria produces the same ranking for everyone who views it.
- **Your browsing history on the Platform is not currently used to personalise rankings.**
- **Advertisers do not influence the order** (we don't currently have any; if that changes we will say so).`,
  },
  {
    title: "Manual overrides and removals",
    content: `We do sometimes intervene in rankings by hand. Specifically:

- A tradesperson we've suspended or are investigating for breaking our <a href="/acceptable-use">Acceptable Use Policy</a> may be hidden from rankings pending investigation.
- A tradesperson who loses their Verified status (because the underlying Companies House record was dissolved, for example) may drop in rankings as a result.
- In rare cases, where algorithmic ranking produces clearly broken results, we may hand-tune a specific page. Where we do, we aim to document it in a comment visible on the page.`,
  },
  {
    title: "How rankings are calculated",
    content: `Ranking is computed server-side from the signals above. The result is refreshed periodically - not on every page load - so the same list may look identical for a few minutes at a time.

If you have a reason to suspect something is wrong (a tradesperson ranking far higher than you'd expect, or far lower) email hello@vetmybuilder.com and we'll investigate.`,
  },
  {
    title: "Changes",
    content: `We update the ranking algorithm regularly as the Platform grows. Material changes to what signals are used - for example, adding review quality scores, or introducing a promoted-placement system - will be announced by a banner on the Platform and a corresponding update to this page.`,
  },
];

export default function Ranking() {
  return (
    <LegalPageLayout
      title="Ranking"
      titleAccent="Transparency"
      subtitle="Why you see tradespeople in the order you do, and what does (and doesn't) influence that order."
      lastUpdated="15 April 2026"
      metaDescription="How VetMyBuilder ranks tradespeople and recommendations, in plain English."
      sections={sections}
    />
  );
}
