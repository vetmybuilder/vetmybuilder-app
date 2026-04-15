// web/pages/cookies.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

// ---------------------------------------------------------------------------
// Cookie Policy - PECR + UK GDPR compliant.
//
// Current state (April 2026): VetMyBuilder uses ONLY strictly-necessary
// cookies and localStorage keys. No analytics. No marketing pixels. That
// means we do NOT need a consent banner today - strictly-necessary storage
// is exempt under reg 6(4) PECR.
//
// IMPORTANT: if Google Analytics, Meta Pixel, or any other tracker is
// added in future, THIS PAGE must be updated AND a consent banner must be
// rolled out BEFORE the tracker goes live. Do not ship non-essential
// tracking until consent UI is in place.
// ---------------------------------------------------------------------------

const sections: LegalSection[] = [
  {
    title: "What cookies and local storage are",
    content: `Cookies are small files stored in your browser. Local storage is similar - key-value data your browser keeps for a specific site. Both can persist between visits.

UK law (the Privacy and Electronic Communications Regulations, or "PECR") treats both the same way: if the data is "strictly necessary" to deliver the service you asked for, we can use it without asking. For anything else, we have to get your consent first.

VetMyBuilder currently uses **only strictly necessary** storage. That means we don't need to show you a consent banner today. If that ever changes, we'll ask first.`,
  },
  {
    title: "What we store, and why",
    content: `All of the items below are strictly necessary - they keep you signed in, route you to the right area, and prevent you from seeing broken pages. None of them track you, profile you, or share data with any third party.

**Firebase Authentication**
- Purpose: keeps you signed in between visits
- Expiry: up to 1 year; cleared when you sign out
- Category: strictly necessary

**Session and routing helpers**
- Purpose: remembers which area of the platform you're using (homeowner or tradesperson), which company you're signed in as, and where to send you after sign-in
- Expiry: cleared on sign-out or immediately after the post-sign-in redirect
- Category: strictly necessary

**Registration drafts**
- Purpose: saves your tradesperson registration form as you fill it in so you don't lose progress
- Expiry: cleared when you close the tab
- Category: strictly necessary

If you want the technical detail - exact key names, expiries and code locations - we keep an internal audit record and will share it on request to hello@vetmybuilder.com.`,
  },
  {
    title: "Analytics, advertising and tracking",
    content: `We do **not** currently use:
- Google Analytics, Mixpanel, PostHog, or any other behavioural analytics
- Facebook / Meta pixel, Google Ads conversion tags, LinkedIn Insight, or any advertising pixel
- Cross-site tracking, fingerprinting, or session replay

If we add any of these in future, we will show you a consent banner before they run, and only set the relevant cookies if you opt in. You'll always be able to withdraw consent by re-opening your cookie preferences.`,
  },
  {
    title: "How to manage cookies",
    content: `You can clear or block cookies at any time through your browser settings. Instructions for the main browsers:
- Chrome: Settings -> Privacy and security -> Cookies and other site data
- Safari: Settings -> Privacy
- Firefox: Settings -> Privacy & Security

Blocking strictly-necessary cookies will break the Platform - you won't be able to stay signed in. That's the trade-off: if you block them, certain features simply won't work.`,
  },
  {
    title: "Changes",
    content: `If this policy changes - most notably if we introduce a non-essential cookie - we will update the "Last updated" date at the top of the page and, where required by law, ask for your consent before the change takes effect.`,
  },
  {
    title: "Contact",
    content: `Questions about cookies? Email hello@vetmybuilder.com. See also our <a href="/privacy">Privacy Policy</a> for the wider picture on how we handle your data.`,
  },
];

export default function Cookies() {
  return (
    <LegalPageLayout
      title="Cookie"
      titleAccent="Policy"
      subtitle="A short, honest explanation of what we store in your browser, and why."
      lastUpdated="15 April 2026"
      metaDescription="What cookies and local storage VetMyBuilder uses, and your choices."
      sections={sections}
    />
  );
}
