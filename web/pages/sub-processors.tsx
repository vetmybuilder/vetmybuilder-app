// web/pages/sub-processors.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

// ---------------------------------------------------------------------------
// Sub-processor list. Keep this in sync with server/lib/externalServices.js
// and the DPAs stored in docs/compliance/dpas/. Every service that
// processes personal data on our behalf must appear here.
// ---------------------------------------------------------------------------

const sections: LegalSection[] = [
  {
    title: "What this is",
    content: `When you use VetMyBuilder, some of your data gets processed by third-party services that help us run the Platform. Under UK GDPR we have to tell you who they are and what they do with your data.

This page is the full list. It's kept up to date as we add or remove providers. For each provider we have a data-processing agreement in place.`,
  },
  {
    title: "Our sub-processors",
    content: `**Google Firebase (Google LLC)**
- What it does: user authentication (sign-in with Google, email/password), session management
- What data it sees: your email, hashed password, user identifier, sign-in events, your IP at the time of sign-in
- Where: EU and US regions
- Legal transfer mechanism: UK Addendum to EU SCCs
- Privacy policy: <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">policies.google.com/privacy</a>

**Google Places / Maps API (Google LLC)**
- What it does: enriches tradesperson profiles with public business listing data (star rating, review count, website)
- What data it sees: the company name and location we query with; the public business listing returned
- Where: Google global infrastructure
- Legal transfer mechanism: UK Addendum to EU SCCs
- Privacy policy: as above

**Companies House API (UK government)**
- What it does: verifies tradesperson company names against the UK public company register
- What data it sees: the company name (or number) we query with
- Where: UK
- Legal transfer mechanism: not applicable - UK-to-UK
- Terms: <a href="https://developer.company-information.service.gov.uk/terms-of-service" target="_blank" rel="noreferrer">developer.company-information.service.gov.uk/terms-of-service</a>

**AI inference** (third-party provider, US)
- What it does: classifies project descriptions and generates short summaries to help match homeowners with relevant tradespeople
- What data it sees: the project description, recommendation text, or tradesperson profile text we send for classification. We do not send identifiers, contact details, or account IDs alongside it.
- Where: US
- Legal transfer mechanism: UK Addendum to EU SCCs. Our provider does not use our inputs to train its models.
- The specific provider changes occasionally as the AI market evolves. The current provider's name is available on request to hello@vetmybuilder.com.

**[REVIEW: email delivery provider]**
- What it does: sends transactional emails (account activity, project updates, password resets)
- What data it sees: your email address, the content of emails we send you
- Where: [REVIEW]
- Legal transfer mechanism: [REVIEW]

**[REVIEW: hosting provider]**
- What it does: runs the VetMyBuilder servers and stores the MySQL database
- What data it sees: all data we store about you (encrypted at rest where supported)
- Where: [REVIEW - typically UK or EU data region]
- Legal transfer mechanism: [REVIEW]`,
  },
  {
    title: "Changes to this list",
    content: `When we add or remove a sub-processor, we update this page. For significant changes (for example, moving user data to a new country or adding a category of processor we didn't use before) we will also notify you by email or by a banner on the Platform before the change takes effect.`,
  },
  {
    title: "Your rights",
    content: `If you have concerns about any of the processors above, email hello@vetmybuilder.com. You have the right to object to processing (see our <a href="/privacy">Privacy Policy</a>) and to lodge a complaint with the ICO at <a href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a>.`,
  },
];

export default function SubProcessors() {
  return (
    <LegalPageLayout
      title="Sub-"
      titleAccent="processors"
      subtitle="Every third party that processes your personal data on our behalf. Updated whenever the list changes."
      lastUpdated="15 April 2026"
      metaDescription="The full list of sub-processors that handle VetMyBuilder user data."
      sections={sections}
    />
  );
}
