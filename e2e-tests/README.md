# API E2E Tests (Playwright)

This test suite runs end-to-end API tests against the VetMyBuilder backend using Playwright.

It is API-only:
- No Next.js / web app involved
- No browser UI flows
- No shared state between tests

Each test shard runs its own API server and its own database, making the suite fast, isolated, and reliable.


## Quick start

npm install

npx playwright install

npm run test


## What happens when tests run

When the test suite starts:

1. Playwright starts multiple API servers
   - One server per shard (default: 4)
   - Each server runs `npm run dev:server`

2. Each server listens on its own port
   - Ports: 3100, 3101, 3102, 3103

3. Each shard uses its own database
   - No shared data
   - No cross-test contamination

4. Before tests start (per shard)
   - Database is created if missing
   - MySQL schema is applied
   - Core users are seeded

5. Before every test
   - All application tables are wiped
   - Schema remains intact

6. Tests run in parallel
   - One worker per shard
   - Deterministic and repeatable


## Sharding model

Playwright projects are used as shards.

Shard 1
- Project name: shard-1
- API port: 3100
- Base URL: http://127.0.0.1:3100
- Database: vmb_test_shard_0

Shard 2
- Project name: shard-2
- API port: 3101
- Base URL: http://127.0.0.1:3101
- Database: vmb_test_shard_1

Shard 3
- Project name: shard-3
- API port: 3102
- Base URL: http://127.0.0.1:3102
- Database: vmb_test_shard_2

Shard 4
- Project name: shard-4
- API port: 3103
- Base URL: http://127.0.0.1:3103
- Database: vmb_test_shard_3


## How the API server is started

API servers are started using the `webServer` setting in `playwright.config.ts`.

Each server:
- Uses a unique PORT
- Is pinned to a shard-specific database
- Is fully isolated from other shards

Server logs are silenced by default to keep output readable.

To debug server behaviour:
- Comment out `stdout: "ignore"` and `stderr: "ignore"` in `playwright.config.ts`


## Key files and responsibilities


### playwright.config.ts

Controls the entire test runtime.

Responsible for:
- Defining shard count
- Starting one API server per shard
- Assigning ports and databases
- Wiring Playwright projects to the correct base URL
- Trace, video, and screenshot behaviour

This is the single source of truth for parallelism.


### src/fixtures.ts

Provides the test framework glue.

Responsible for:
- Creating a runtime per shard
- Ensuring the database exists
- Applying the schema
- Seeding required users
- Exposing:
  - apiClient (normal user)
  - adminApiClient (admin user)

All API tests import from this file.

The fixture always uses the Playwright project baseURL to avoid accidental calls to localhost:3000.


### src/config/runtime.ts

Defines the runtime structure.

A runtime contains:
- Database name
- API base URL
- Web base URL (same as API in tests)
- Shard index

Each shard gets its own runtime instance.


### src/db/manage-db.ts

Handles database setup.

Responsible for:
- Creating databases
- Applying mysql_schema.sql
- Seeding core test users

Runs once per worker.


### src/db/wipe.ts

Runs before every test.

Deletes all rows from application tables while keeping the schema intact.


### src/api/client.ts

The API test client.

Wraps Playwright’s request API and provides:
- Authenticated clients
- Helpers for common API flows
- Guards against invalid base URLs

All API tests use this client.


## Authentication in tests

Authentication is handled using test-only API routes.

Flow:
1. Test client calls a test auth endpoint
2. Server returns a Firebase ID token
3. Client uses the token for authenticated requests

This avoids:
- UI login flows
- External auth dependencies
- Flaky setup

Test routes are enabled only when:
- TEST_ENV=e2e
- or ENABLE_TEST_ROUTES=1

They are never active in production.


## External services

When TEST_ENV=e2e:

- Companies House calls are stubbed
- Google Places lookups are skipped
- No outbound HTTP is required

This keeps tests fast and deterministic.


## Running specific tests

Run a single test file:

npx playwright test tests/api/project/projects.create.spec.ts

Run a single shard:

npx playwright test --project=shard-1


## Debugging failures

Open a Playwright trace:

npx playwright show-trace path/to/trace.zip

Enable server logs by removing:
- stdout: "ignore"
- stderr: "ignore"

from playwright.config.ts.


## Adjusting shard count

Shard count is controlled in playwright.config.ts:

const TOTAL_SHARDS = 4;

Four shards is the practical sweet spot for most machines.
More shards can increase overhead rather than reduce runtime.


## What this setup avoids (by design)

- Shared databases
- Global state
- UI dependency
- Migrations on boot
- Hard-coded localhost URLs
- Flaky timing assumptions


## Summary

This is a production-grade API E2E setup:

- Fully isolated shards
- One server per shard
- Clean database before every test
- Fast parallel execution
- CI-safe and predictable

If tests fail, it is almost always a real bug — not test noise.