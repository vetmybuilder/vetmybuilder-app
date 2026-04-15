// web/pages/verified.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

// ---------------------------------------------------------------------------
// "What does Verified mean?" - public-facing explainer.
//
// This page is disproportionately important for compliance. The DMCC 2024
// actively scrutinises marketplace trust signals ("verified", "vetted",
// "approved") and the ASA enforces the same under the CAP Code. Anyone who
// believes the badge represents something it doesn't can file a complaint,
// and we must be able to substantiate exactly what we claim.
//
// Rule of thumb: if you wouldn't defend it in front of a trading standards
// officer, don't put it here.
// ---------------------------------------------------------------------------

const sections: LegalSection[] = [
  {
    title: "What the green 'Verified' badge means",
    content: `When you see a green **Verified** badge next to a tradesperson's name, it means we've matched their profile against two independent public sources:

**1. UK Companies House register.** We find a real company of the same name currently listed on the UK's official company register, and we check that its filing status is active (or otherwise not dissolved).

**2. Google Business listing.** We find a Google Maps business listing that matches the same company name and location, with a confidence threshold high enough that we're confident it's the same business.

If both checks pass, we show the Verified badge on the tradesperson's profile.`,
  },
  {
    title: "What Verified does NOT mean",
    content: `The Verified badge is a record check. It tells you the business is real and publicly listed. It does **not** mean:

- **That the tradesperson is qualified.** We do not check trade qualifications, apprenticeship records, gas-safe registration, Part P, NICEIC, or any other professional certification.
- **That the tradesperson is insured.** We do not verify public liability, employer's liability, or any other form of insurance. Ask to see certificates before you engage anyone.
- **That their work is of any particular quality.** We don't inspect work and we don't endorse tradespeople.
- **That they will be available, reliable, or easy to work with.** That's between you and them.
- **That they are the right fit for your job.** Every project is different; a good bathroom fitter isn't necessarily a good roofer.

The badge is an easy first filter - it tells you the company actually exists and has a public trading presence. The rest is your own due diligence.`,
  },
  {
    title: "Recommendations vs Verification - the difference",
    content: `Recommendations are written by real people in your community who say they've worked with (or seen the work of) a specific tradesperson. They are subjective, specific to a project, and sometimes glowing, sometimes not.

Verification is an objective, binary record check against two public databases.

A tradesperson can be verified without having any recommendations (they just set up the profile). A tradesperson can have many recommendations without being verified (for example, because they trade as a sole trader without a registered company). Both signals are useful in different ways.`,
  },
  {
    title: "What the Google rating and review count show",
    content: `Where a tradesperson is matched to a Google business listing we also show:
- Their current average rating on Google (for example, 4.7 ★)
- The number of Google reviews that rating is based on

This data is pulled directly from Google at regular intervals. We don't edit it, inflate it, or filter it. Clicking the rating opens the tradesperson's Google listing where you can read the reviews in full.

If you see a rating that you believe is based on fake reviews, report it to Google via their Google Maps interface - we don't control what appears there.`,
  },
  {
    title: "When Verified can change",
    content: `A tradesperson's Verified status isn't permanent. We re-check against Companies House and Google periodically. If:
- The company is dissolved, struck off, or put into liquidation
- The Google listing is closed or removed
- A tradesperson changes their company name to one that no longer matches

...the Verified badge will disappear until the profile matches again.

We may also manually remove the badge if we find evidence that the tradesperson misrepresented their company affiliation.`,
  },
  {
    title: "Scope and limits",
    content: `Verification is a **best-effort** process. We rely on the accuracy of:
- The UK Companies House register
- Google's business listings
- Our name-matching algorithm, which uses fuzzy comparison

We try to be cautious - if we can't match a tradesperson with high confidence, we don't show the Verified badge. That means some perfectly legitimate tradespeople (especially sole traders or those with multiple trading names) won't be verified, and it isn't a signal that anything is wrong with them.

If you are a tradesperson and you believe your profile should be Verified but isn't, email hello@vetmybuilder.com with your Companies House number and Google Business Profile link and we'll take another look.`,
  },
  {
    title: "Companies House data",
    content: `Data about registered companies is taken from the UK Companies House public register. It's Crown copyright and we use it under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noreferrer">Open Government Licence</a>. Companies House data is updated by Companies House itself; we refresh our copy at least monthly.`,
  },
  {
    title: "Questions?",
    content: `If you want to understand why a specific tradesperson does or doesn't have a badge, or if you think a badge has been applied incorrectly, email hello@vetmybuilder.com and we'll investigate within 5 working days.`,
  },
];

export default function Verified() {
  return (
    <LegalPageLayout
      title="What"
      titleAccent="Verified means"
      subtitle="We keep this simple: the green badge means 'we've matched this tradesperson to a real company and a real Google listing'. Here's the full detail."
      lastUpdated="15 April 2026"
      metaDescription="What VetMyBuilder's Verified badge means, how we verify tradespeople, and what Verified does NOT cover."
      sections={sections}
    />
  );
}
