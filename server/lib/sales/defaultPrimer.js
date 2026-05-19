// server/lib/sales/defaultPrimer.js
//
// Seed text for the LLM sales-script primer. Used the first time the
// /admin/sales-script GET endpoint is hit and the singleton row hasn't
// been created yet. The admin can rewrite this freely afterwards - the
// default is a starting point, not a contract.

const DEFAULT_PRIMER = `# VetMyBuilder sales primer

## Who we are
VetMyBuilder is a two-sided UK home-improvement marketplace connecting
homeowners with vetted tradespeople. Limited to specific pilot boroughs
at launch (Waltham Forest is the first). Operating entity: VetMyBuilder Ltd
(England and Wales, Co. No. 1627511).

## How matching works
1. Homeowner posts a job describing the work + location.
2. The homeowner's community (friends, neighbours, past clients) recommends
   tradespeople they trust. Recommendations sit alongside our own
   smart-ranked candidates pulled from the platform.
3. The homeowner browses a swipe deck of tradesperson cards - free.
4. Tradespeople swipe right on jobs they want. A mutual right-swipe opens
   a chat. No mutual swipe = no chat.
5. Where there's no recommendation link, a tradesperson can pay to unlock
   contact for a specific project (one-off) OR buy a time-limited access
   pass.

## Pricing for tradespeople
- One-off unlock: £2.99 - £14.99 depending on the project's price band.
- 7-day pass: £3.99.
- 14-day pass: £6.99.
- 30-day pass: £9.99 (best value, lowest cost per day).
- No subscriptions. No auto-renewal. Pay only when you want to talk to
  a homeowner who isn't already in your community network.

## What makes us different
- **Community-first.** We start from people the homeowner already trusts,
  not from anonymous bids. Tradespeople with strong word-of-mouth get
  found faster.
- **No bid spam.** Tradespeople aren't competing in a lead-tax race.
  You don't pay for "leads" that go nowhere - you pay only to message a
  specific homeowner whose job interests you.
- **Transparent ranking.** Our smart-ranked deck order is explained on
  the /ranking page. We don't currently take money for placement.
- **Vetted badge clarity.** A "Verified" badge means we've matched a
  real registered UK business and a public listing - it does NOT mean
  insured, qualified, or endorsed. Homeowners do their own due diligence.

## Refunds
Refund policy is at /refund-policy. Digital service, immediate delivery,
14-day cancellation right is waived at checkout by ticking a box. We
refund mistakes, outages, statutory rights, and good-faith discretion.
We don't refund a change of mind after using the entitlement.

## What we're NOT
- A general contractor or staffing agency.
- A guarantee that a job will be completed - we're the introducer.
- A reviews aggregator. Our community recommendations are first-party,
  from people the homeowner knows.
- An insurance / qualifications check. That's the homeowner's job.

## Who's a great fit
- Independent tradespeople and small UK-registered limited companies who
  rely on word-of-mouth.
- Trades who are tired of paying lead fees for unqualified enquiries.
- Trades active in our pilot boroughs (initially Waltham Forest E4 / E17 /
  E10 / E11).
`;

module.exports = { DEFAULT_PRIMER };
