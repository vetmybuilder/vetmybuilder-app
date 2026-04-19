# TODO

Items to pick up in a future session.

## Migration runner for prod schema changes

The current `server/migrations/` folder is gitignored and dead. Schema changes are tracked in `mysql_schema.sql` + `docker/mysql/init/02-schema.sql` (for fresh DB bootstrap in CI), but existing prod databases require manual ALTER TABLE statements run via SSH + MySQL CLI.

Columns that had to be manually ALTER'd on prod (April 2026):
- `google_places_cache` (new table)
- `tradesmen.review_links_json`
- `projects.answers_json`
- `trade_shares` FK constraint (`fk_trade_shares_tradesman`)

**Fix:** build a lightweight migration runner that:
- Reads numbered `.sql` files from a tracked directory (not gitignored)
- Applies them in order on server boot
- Tracks applied migrations in a `_migrations` table (the table already exists from the old dead system)
- Skips already-applied migrations
- Logs clearly what it applied

This eliminates the "deploy goes out, column doesn't exist, 500 until someone SSHs in" failure mode.

## Remove serial mode from admin UI tests

The admin UI e2e tests (`tradesmen-leaderboard.spec.ts`, `recommendation-leaderboard.spec.ts`) use `test.describe.configure({ mode: "serial" })` to avoid cross-worker data races — they all share the same `TEST_ADMIN_USER_UID` and `seedUsers` wipes between tests. The downside is that one failure skips all remaining tests in the file.

**Fix:** give each test its own unique admin UID (generated per-worker like the regular test user UIDs) so tests can run in parallel without data races, and a single failure doesn't block the rest of the suite.

## PostHog reverse proxy

PostHog requests are blocked by Brave and other ad-blocking browsers. Route PostHog requests through the vetmybuilder.com domain (e.g. `/ingest/*` → `eu.i.posthog.com`) to avoid tracker blocking. Can be done via Next.js rewrites or an Express proxy route.

## Supply-side acquisition: curated local tradesperson pipeline

Build a system to find, vet, and recommend local tradespeople to homeowners — even before those tradespeople have signed up. This creates supply-side growth and gives homeowners immediate value when they publish a project.

**How it works:**

1. **Batch discovery** — Script or admin tool that searches Google Places API by trade + area (e.g. "plumber Waltham Forest"), cross-references Companies House, and stores qualified businesses in a `trades_tbc` table.

2. **Vetting bar (high — only businesses we'd genuinely stand behind):**
   - Google rating ≥ 4.5 with ≥ 20 reviews
   - Companies House registered, active, not first-year
   - Listed on Checkatrade or Trustatrader (insurance already verified by them)
   - AI review scan (Haiku) — no red flags in Google reviews around safety, reliability, or quality
   - Store a `vetting_score` / `vetting_status` on each record

3. **Display** — These are NOT shown as "Community" recommendations (which implies a personal vouch). Use a distinct label like "Vetted local business" so homeowners can tell the difference from personal recommendations at a glance.

4. **Auto-recommend on publish** — When a homeowner publishes a project, match against `trades_tbc` by trade + area and surface matching vetted businesses on their shortlist.

5. **Outreach email** — Send the tradesperson a single email: "Someone has recommended you on VetMyBuilder for a [Project Type] project in [Area]. [View the project →]. Claim your free profile to respond — or ask us to remove your data." Links to the public project page. One email per tradesperson per project — no repeats until they claim.

6. **GDPR compliance** — Only store business-level contact details (generic emails like `info@`, business landlines, publicly listed numbers). No personal emails or personal mobiles for sole traders. The outreach email serves as Article 14 notification. Include a "remove my data" link. Get solicitor sign-off on the email wording before sending.

**Start small:** Waltham Forest + surrounding boroughs, 3-4 high-demand trades (plumbers, electricians, builders, roofers). Quality over quantity — 3 genuinely vetted businesses per area is better than 30 scraped ones.
