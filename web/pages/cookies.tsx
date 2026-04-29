// web/pages/cookies.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

const sections: LegalSection[] = [
  {
    title: "What cookies and similar storage are",
    content: `Cookies are small files stored in your browser. Local storage and session storage are similar - key-value data your browser keeps for a specific site. Both can persist between visits.

UK law (the Privacy and Electronic Communications Regulations, or "PECR") treats them the same way: if the data is "strictly necessary" to deliver the service you asked for, we can use it without asking. For anything else - analytics, push notifications, advertising - we have to get your consent first.

VetMyBuilder uses strictly-necessary storage, opt-in analytics cookies, and (only if you grant browser permission) a push notification subscription. We do not use any advertising or cross-site tracking technology.`,
  },
  {
    title: "Strictly necessary storage",
    content: `These keep you signed in and the Platform working. They cannot be switched off.

**Firebase Authentication**
- Purpose: keeps you signed in between visits
- Expiry: up to 1 year; cleared when you sign out
- Category: strictly necessary

**Session and routing helpers** (\`vmb:returnTo\`, \`vmb:oauthReturnTo\`, \`vmb:oauthIntent\`, \`vmb:isTradesman\`, \`vmb:tradesCo\`)
- Purpose: routes you to the right area after sign-in (homeowner or tradesperson), remembers which company you're signed in as, and lets the post-OAuth flow send you to the correct destination
- Expiry: cleared on sign-out or shortly after the post-sign-in redirect
- Category: strictly necessary

**Signup progress flags** (\`vmb:tradesmanSignupInProgress\`, \`vmb:justRegisteredTradesman\`)
- Purpose: prevents the app from bouncing a part-finished tradesperson signup off the registration flow and primes the right interface immediately after registration
- Expiry: cleared automatically when the signup completes
- Category: strictly necessary

**Registration drafts** (\`vmb.vendorDraft.v1\`, \`vmb.vendorDraftSso.v1\`)
- Purpose: saves the tradesperson registration form as you fill it in so you don't lose progress if the tab closes
- Expiry: cleared when you finish or close the tab
- Category: strictly necessary

**Cookie consent preference** (\`vmb_cookie_consent\`)
- Purpose: remembers that you accepted analytics cookies so we don't ask again
- Expiry: 1 year
- Category: strictly necessary

**Home screen prompt** (\`vmb:homeScreenPromptShown\`, \`vmb:pushSetupShown\`)
- Purpose: remembers that you dismissed the "Add to home screen" or "Turn on notifications" prompt so we don't keep nagging
- Expiry: persists until cleared
- Category: strictly necessary`,
  },
  {
    title: "Push notification subscription",
    content: `If you grant your browser permission, we register a push subscription so we can deliver notifications about new matches, chat messages, and project updates.

This isn't technically a cookie - it's a browser-issued endpoint plus a pair of public keys - but it does fall under the same consent rules.

**What we store:** the endpoint URL and the public keys your browser supplies. We do not get your phone number or device identifier.
**Lawful basis:** consent (you must explicitly grant browser permission).
**How to revoke:** revoke notification permission in your browser settings, or sign out. We delete subscriptions that fail to deliver for an extended period.`,
  },
  {
    title: "Analytics cookies (PostHog)",
    content: `We use **PostHog** to understand how people use VetMyBuilder - which pages are visited, which features are used, and where people get stuck. This helps us improve the product.

PostHog analytics cookies are only set **after you accept** via the cookie consent banner. If you decline or ignore the banner, no analytics cookies are set.

**What PostHog stores:**
- A unique anonymous identifier (\`distinct_id\`) to distinguish visitors
- Session replay data (page views, clicks, scrolls) - no keystrokes or form input are recorded, and chat content is masked
- Device type, browser, and rough location (city-level from IP, not precise)

**What PostHog does NOT do:**
- Does not track you across other websites
- Does not sell or share your data with advertisers
- Does not record passwords, payment details, or chat messages

PostHog is hosted in the EU (Frankfurt). Data is retained for 12 months.

Privacy policy: <a href="https://posthog.com/privacy" target="_blank" rel="noreferrer">posthog.com/privacy</a>`,
  },
  {
    title: "Chat content is private",
    content: `Messages and images you send through the in-app chat are not collected by analytics. PostHog session replay masks chat surfaces, so the recording shows that a chat happened but not what was said. Chat data is handled under the rules in our <a href="/privacy">Privacy Policy</a>.`,
  },
  {
    title: "No advertising or cross-site tracking",
    content: `We do **not** use:
- Facebook / Meta pixel, Google Ads conversion tags, LinkedIn Insight, or any advertising pixel
- Cross-site tracking or fingerprinting
- Session replay that captures keystrokes, payment details, or chat content`,
  },
  {
    title: "How to manage cookies and notifications",
    content: `You can clear or block cookies at any time through your browser settings. Instructions for the main browsers:
- Chrome: Settings -> Privacy and security -> Cookies and other site data
- Safari: Settings -> Privacy
- Firefox: Settings -> Privacy & Security

Blocking strictly-necessary cookies will break the Platform - you won't be able to stay signed in. Blocking analytics cookies simply stops PostHog from collecting usage data; the Platform will work normally.

To revoke push notification permission, use the same Privacy / Site settings menu in your browser, or sign out.`,
  },
  {
    title: "Changes",
    content: `If this policy changes - most notably if we introduce a new category of cookie - we will update the "Last updated" date at the top of the page and, where required by law, ask for your consent before the change takes effect.`,
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
      lastUpdated="29 April 2026"
      metaDescription="What cookies and local storage VetMyBuilder uses, and your choices."
      sections={sections}
    />
  );
}
