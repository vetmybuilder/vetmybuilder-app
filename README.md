# VetMyBuilder

Two-sided marketplace connecting homeowners with vetted local tradespeople. Homeowners post projects, swipe through ranked tradespeople, and form matches. Tradespeople get verified, browse a job discovery deck, and connect directly with homeowners - no bidding wars, no spam.

## Architecture

- **Web**: Next.js 14 (pages router), Tailwind CSS, Firebase Auth
- **Server**: Node.js/Express, MySQL 8, Firebase Admin SDK
- **Infra**: Oracle Cloud VM, Nginx reverse proxy, PM2, Let's Encrypt
- **Services**: Stripe (payments), Resend (email), PostHog (analytics), Google Places, Companies House API, Anthropic (AI classification)

## User types

- **Homeowner**: posts projects, swipes through ranked tradespeople, hires, leaves recommendations
- **Tradesperson**: registers business, gets verified, browses job deck, swipes on projects, manages leads
- **Admin**: verifies tradespeople, manages pilot areas/categories, monitors dashboard, processes refunds

## Key features

- **Swipe matching**: homeowners and tradespeople swipe on each other; mutual interest forms a match and reveals contact details
- **AI ranking**: projects are classified by trade type; tradespeople are scored by area match, trade match, price band, and reputation
- **Community recommendations**: homeowners recommend tradespeople via magic links with per-category star ratings
- **Grants helper**: public /free-wall-insulation funnel checks ECO4/GBIS eligibility, captures leads, routes to assigned specialist
- **Real-time notifications**: web push (VAPID), SSE broadcast, email (Resend), in-app bell
- **Payment gating**: Stripe subscriptions and one-time contact unlocks
- **Admin dashboard**: stats, activity log, trades pipeline, grant leads inbox, leaderboards

## Local dev

```bash
npm install
npm run dev:manual          # full stack with Firebase Auth emulator
```

Requires: Node.js 20, MySQL 8, Docker (for Firebase emulators).

See `web/.env.local.sample` for required env vars. Copy to `web/.env.local` and fill values.

The canonical database schema is `mysql_schema.sql`. Migrations live in `server/migrations/` and run automatically on server boot.

## Testing

```bash
npm test              # all tests
npm run test:api      # server/API tests (vitest.config.ts)
npm run test:web      # web component tests (vitest.web.config.mts)
```

## Deploy

Pushes to `master` trigger GitHub Actions: runs tests, deploys to staging, then production. See `RUNBOOK.md` for ops details.

## Docs

See `docs/` for detailed feature documentation:
- [Matching and ranking](docs/matching.md)
- [Notifications](docs/notifications.md)
- [Grants helper](docs/grants.md)
- [Admin features](docs/admin.md)
- [API routes](docs/api-routes.md)
- [Page routes](docs/page-routes.md)
