// web/pages/refund-policy.tsx
import LegalPageLayout, {
  type LegalSection,
} from "@/components/LegalPageLayout";

// ---------------------------------------------------------------------------
// Refund Policy - UK Consumer Contracts (Information, Cancellation and
// Additional Charges) Regulations 2013. Covers the immediate-supply
// waiver consumers accept at checkout when they buy a one-off unlock
// or access pass.
//
// Must be solicitor-reviewed before publishing. Draft only.
// When updating, bump REFUND_POLICY_VERSION in
// server/lib/payments/refundPolicyVersion.js to match the new
// lastUpdated date below.
// ---------------------------------------------------------------------------

const sections: LegalSection[] = [
  {
    title: "What this policy covers",
    content: `This Refund Policy covers paid services that **tradespeople** buy from VetMyBuilder Ltd ("we", "us"). It applies to:
- One-off contact unlocks (a one-time payment to message a specific homeowner about a specific project)
- Time-limited access passes (7-day, 14-day, 30-day)

Homeowners do not pay us to use the Platform, so this policy does not affect homeowners.`,
  },
  {
    title: "What you're buying is a digital service, delivered immediately",
    content: `When you pay for an unlock or access pass, what you receive is **digital content and a digital service** delivered to you the moment payment succeeds:
- For a one-off unlock: the homeowner's contact details are revealed in your VetMyBuilder account and a chat thread opens with them.
- For an access pass: your right to send first messages to homeowners is switched on for the duration of the pass.

These are not physical goods. Nothing is shipped. You can use them straight away.`,
  },
  {
    title: "The 14-day cancellation right and why you waive it",
    content: `Under the **Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013**, UK consumers usually have a 14-day right to cancel a purchase made online.

That 14-day right does **not** apply once a digital service has begun being delivered, provided that you:
- Gave express prior consent to the supply starting immediately, and
- Acknowledged that by doing so you would lose your right to cancel.

At checkout, before you're sent to our payment processor, we ask you to tick a single box confirming both of those points. You can only proceed to payment with the box ticked. We record the date and time of that tick and the version of this policy that applied at the time.

If you don't tick the box, you can't pay - so you never lose your statutory right unknowingly.`,
  },
  {
    title: "When we will refund",
    content: `We will refund you, in full or in part, where:
- You were charged in error or charged twice for the same entitlement.
- A bug or outage on our side meant the entitlement was never actually delivered (for example, an unlock that never opened the homeowner's contact details).
- The Platform was substantially unavailable for a meaningful part of an access pass's term through our fault.
- We are required to refund by UK consumer law, including by your non-excludable rights under the Consumer Rights Act 2015.
- In our discretion, the circumstances make a refund the fair outcome - for example, a homeowner closed or cancelled the job within minutes of you unlocking it and no contact was attempted.

Discretionary refunds are case-by-case and not a guarantee.`,
  },
  {
    title: "When we won't refund",
    content: `We will not refund you simply because:
- You changed your mind after using the entitlement.
- The homeowner did not reply to your message, or stopped replying. The contact details and the right to message are what you paid for - those were delivered.
- You had a dispute with the homeowner about the job itself. We are the introducer, not a party to the contract you make with the homeowner.
- An access pass expired before you used all of it. Passes are time-limited and not stockable.

If you think your situation falls outside this list, ask anyway. We read every email.`,
  },
  {
    title: "How to request a refund",
    content: `Email **hello@vetmybuilder.com** with:
- The email address on your VetMyBuilder account
- The project ID or chat thread (if you have it)
- A short description of what happened

We aim to respond within 5 working days. Most refunds are reviewed within 2.`,
  },
  {
    title: "How long refunds take",
    content: `When we approve a refund, we process it back to the original card via Stripe. Stripe typically returns the funds within **5 to 10 working days**, depending on your card issuer. You'll see the refund as a separate line item on your statement, not a reversal of the original charge.`,
  },
  {
    title: "Your statutory rights",
    content: `Nothing in this policy limits any non-excludable rights you have under UK consumer law, including the Consumer Rights Act 2015. If a refund is required by law in your circumstances, you are entitled to it regardless of what this policy says.`,
  },
  {
    title: "Contact",
    content: `Questions about this policy? Email **hello@vetmybuilder.com**.

VetMyBuilder Ltd, registered in England and Wales. Company number: 1627511.`,
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
      When you pay us, you get an unlock or pass right away - that's the
      service. Because it's delivered immediately, you waive your 14-day
      cancellation right by ticking a box at checkout. We refund mistakes,
      outages, and anything UK law requires; we don't refund a change of
      mind or a homeowner going quiet. Email us and we'll look at every
      case fairly.
    </p>
  </>
);

export default function RefundPolicy() {
  return (
    <LegalPageLayout
      title="Refund"
      titleAccent="policy"
      subtitle="When we refund tradesperson payments, when we don't, and how to request one."
      lastUpdated="19 May 2026"
      metaDescription="VetMyBuilder refund policy for tradesperson payments under UK consumer law."
      sections={sections}
      summary={summary}
      numbered
      footerCtaHref="mailto:hello@vetmybuilder.com"
      footerCtaLabel="hello@vetmybuilder.com"
    />
  );
}
