// web/pages/promo/terms.tsx
// ---------------------------------------------------------------------------
// "Free Web Page" launch promotion terms - the first 50 verified tradespeople
// get a free public profile page hosted on VetMyBuilder. UK-law-governed.
// Operating entity: VetMyBuilder Ltd (Company No. 1627511). Route: /promo/terms
//
// DECISIONS TO CONFIRM before this goes out:
// - The "Cost" section says free "while you remain an active launch member".
//   Change if you mean free for life / a fixed term.
// - Add a hard end date and/or a geographic limit if you want one.
// ---------------------------------------------------------------------------
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

const sections: LegalSection[] = [
  {
    title: "The offer",
    content: `As a launch promotion, the first 50 eligible tradespeople to join VetMyBuilder and be verified will receive a **free public profile page** hosted on VetMyBuilder (the "Free Page").

Your Free Page is a professional online presence you can share with customers straight away - showing your trades, the areas you cover, photos of your work, your Verified badge, and a way for customers to get in touch.`,
  },
  {
    title: "Who can claim",
    content: `The promotion is open to tradespeople and trade businesses that:
- Are operating legally in the United Kingdom (sole trader, partnership, LLP, or limited company), and
- Hold any licences or registrations required for the trades they offer, and
- Complete tradesperson registration on VetMyBuilder and pass our verification.

You must be at least 18 years old. One Free Page per business.`,
  },
  {
    title: "How the first 50 places are decided",
    content: `Places are limited to **50 tradespeople**. They are awarded in the order that registration is completed and verification is approved, as recorded by VetMyBuilder.

The promotion closes once all 50 places have been claimed, or earlier at our discretion. We will announce on our channels once the places are gone.`,
  },
  {
    title: "What you get",
    content: `Your Free Page includes:
- Your business name, trades, and the areas you cover
- A gallery of photos of your work
- Your **Verified** badge (see <a href="/verified">What does Verified mean?</a>)
- Community recommendations, where you have them
- A "Get in touch" enquiry button

The look, layout, and features of the page are set by VetMyBuilder and may change over time as we improve the Platform.`,
  },
  {
    title: "Want extra features?",
    content: `If you'd like additional features or extra customisation, we may be able to help.

Just email hello@vetmybuilder.com and we'll talk through the options. Any bespoke or premium work is separate from this free promotion and would be agreed and charged separately.`,
  },
  {
    title: "Where your page lives",
    content: `Your Free Page is hosted on the VetMyBuilder platform, with its own shareable link you can send to customers or add to your van, cards, and socials.

The free offer covers your hosted page and link. A custom domain or other customisation is not included in the free page - but if you'd like that, just email hello@vetmybuilder.com and we can talk through the options. VetMyBuilder hosts and operates the page.`,
  },
  {
    title: "How customers reach you",
    content: `Your Free Page does **not** publish your phone number or email address. Instead, customers get in touch using an enquiry form on the page, and VetMyBuilder passes their enquiry to you.

**All contact and enquiries are routed through VetMyBuilder.** This protects your personal number from spam, keeps a record of every enquiry, and is a condition of the Free Page. You agree to use any contact details a customer shares only to respond to their enquiry.`,
  },
  {
    title: "Verification is required",
    content: `Your Free Page only goes live once your business has been **verified** by VetMyBuilder. Verification may include checks on your business registration, insurance, and identity.

If verification is not completed or not passed, the Free Page is not provided. Verification does not mean VetMyBuilder endorses you or guarantees your work - see our <a href="/terms">Terms of Service</a> for what Verified does and does not mean.`,
  },
  {
    title: "Your content",
    content: `You provide the content for your page (photos, description, trades, and areas) and confirm that it is accurate and that you own it or have the right to use it. You grant VetMyBuilder a licence to host and display that content as needed to operate and promote the Platform, in line with our <a href="/terms">Terms of Service</a>.

We may edit, moderate, or remove content that we reasonably believe is inaccurate, unlawful, or in breach of our <a href="/acceptable-use">Acceptable Use Policy</a>.`,
  },
  {
    title: "Cost",
    content: `The Free Page is **free while you remain an active VetMyBuilder member during our launch period.** There is no upfront cost and no auto-renewing charge.

If we introduce a charge for the page in future, we will give you reasonable notice first, and you will be free to decline and have the page taken down. There is no cash alternative to this offer.`,
  },
  {
    title: "Linked to your membership",
    content: `The Free Page is part of your VetMyBuilder membership. If your account is closed, suspended, or you leave the Platform, your page will be taken down.`,
  },
  {
    title: "No guarantees",
    content: `VetMyBuilder does not guarantee any particular number of enquiries, customers, leads, search-engine ranking, or visitor traffic from your Free Page. The page is a tool to present your business; the results depend on many factors outside our control.`,
  },
  {
    title: "Changes to this promotion",
    content: `We may amend, suspend, or withdraw this promotion at any time for reasons beyond our reasonable control. Where we do, we will honour places that have already been validly claimed wherever it is reasonable to do so.`,
  },
  {
    title: "Data and privacy",
    content: `We handle personal data in line with our <a href="/privacy">Privacy Policy</a>. Enquiry details that we pass to you are shared so you can respond to that customer, and must be used only for that purpose.`,
  },
  {
    title: "General",
    content: `This promotion is run by **VetMyBuilder Ltd**, a company registered in England and Wales (Company No. 1627511).

The offer cannot be transferred, exchanged, or combined with any other offer. VetMyBuilder's decision on eligibility and on the order in which places are claimed is final.

This promotion is governed by the laws of England and Wales and is subject to the VetMyBuilder <a href="/terms">Terms of Service</a> and <a href="/acceptable-use">Acceptable Use Policy</a>.`,
  },
  {
    title: "Contact",
    content: `Questions about this promotion? Email us at hello@vetmybuilder.com.

Company number: 1627511`,
  },
];

const summary = (
  <>
    <h2
      className="text-lg font-extrabold text-slate-900 mb-2"
      style={{ fontFamily: "'Sora', sans-serif" }}
    >
      The plain English summary
    </h2>
    <p className="text-slate-700 text-sm leading-relaxed">
      We&apos;re giving the first 50 verified tradespeople a free profile page
      on VetMyBuilder - your trades, your work, your Verified badge, and a
      button for customers to get in touch. The page is hosted by us at a
      VetMyBuilder web address (it&apos;s not a website you own), and all
      customer enquiries come through VetMyBuilder rather than straight to your
      phone. It&apos;s free while you&apos;re an active member during our
      launch, with no auto-renewing charge and reasonable notice before any
      future cost. Verification is required before your page goes live.
    </p>
  </>
);

export default function PromoTerms() {
  return (
    <LegalPageLayout
      title="Free Web Page"
      titleAccent="Promotion"
      subtitle="The terms of our launch offer: a free public profile page on VetMyBuilder for the first 50 verified tradespeople."
      lastUpdated="29 May 2026"
      metaDescription="Terms and conditions for the VetMyBuilder launch promotion - a free public profile page for the first 50 verified tradespeople."
      sections={sections}
      summary={summary}
      numbered
      footerCtaHref="/tradesman/register-tradesmen"
      footerCtaLabel="Claim your free page"
    />
  );
}
