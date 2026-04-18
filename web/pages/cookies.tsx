// web/pages/cookies.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

const sections: LegalSection[] = [
  {
    title: "What cookies and local storage are",
    content: `Cookies are small files stored in your browser. Local storage is similar - key-value data your browser keeps for a specific site. Both can persist between visits.

UK law (the Privacy and Electronic Communications Regulations, or "PECR") treats both the same way: if the data is "strictly necessary" to deliver the service you asked for, we can use it without asking. For anything else, we have to get your consent first.

VetMyBuilder uses strictly necessary storage and analytics cookies. We show a consent banner before setting analytics cookies.`,
  },
  {
    title: "Strictly necessary storage",
    content: `These keep you signed in and the platform working. They cannot be switched off.

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

**Cookie consent preference** (\`vmb_cookie_consent\`)
- Purpose: remembers that you accepted analytics cookies so we don't ask again
- Expiry: 1 year
- Category: strictly necessary

**Home screen prompt** (\`vmb:homeScreenPromptShown\`)
- Purpose: remembers that you dismissed the "Add to home screen" prompt
- Expiry: persists until cleared
- Category: strictly necessary`,
  },
  {
    title: "Analytics cookies",
    content: `We use **PostHog** to understand how people use VetMyBuilder — which pages are visited, which features are used, and where people get stuck. This helps us improve the product.

PostHog analytics cookies are only set **after you accept** via the cookie consent banner. If you decline or ignore the banner, no analytics cookies are set.

**What PostHog stores:**
- A unique anonymous identifier (\`distinct_id\`) to distinguish visitors
- Session replay data (page views, clicks, scrolls) — no keystrokes or form input are recorded
- Device type, browser, and rough location (city-level from IP, not precise)

**What PostHog does NOT do:**
- Does not track you across other websites
- Does not sell or share your data with advertisers
- Does not record passwords, payment details, or form input

PostHog is hosted in the EU (Frankfurt). Data is retained for 12 months.

Privacy policy: <a href="https://posthog.com/privacy" target="_blank" rel="noreferrer">posthog.com/privacy</a>`,
  },
  {
    title: "No advertising or cross-site tracking",
    content: `We do **not** use:
- Facebook / Meta pixel, Google Ads conversion tags, LinkedIn Insight, or any advertising pixel
- Cross-site tracking or fingerprinting
- Session replay that captures keystrokes or sensitive input`,
  },
  {
    title: "How to manage cookies",
    content: `You can clear or block cookies at any time through your browser settings. Instructions for the main browsers:
- Chrome: Settings → Privacy and security → Cookies and other site data
- Safari: Settings → Privacy
- Firefox: Settings → Privacy & Security

Blocking strictly-necessary cookies will break the Platform — you won't be able to stay signed in. Blocking analytics cookies will simply stop PostHog from collecting usage data; the platform will work normally.`,
  },
  {
    title: "Changes",
    content: `If this policy changes — most notably if we introduce a new category of cookie — we will update the "Last updated" date at the top of the page and, where required by law, ask for your consent before the change takes effect.`,
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
      lastUpdated="18 April 2026"
      metaDescription="What cookies and local storage VetMyBuilder uses, and your choices."
      sections={sections}
    />
  );
}
