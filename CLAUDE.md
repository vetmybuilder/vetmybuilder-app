# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies
npm install

# Development (web + API simultaneously)
npm run dev                    # Web: http://localhost:3000, API: http://localhost:8787

# Production
npm run build                  # Build Next.js frontend
npm run start                  # Run web + API in production mode

# Testing
npm run test:api               # Vitest unit tests for server (tests/server/)
npm run test:web               # Vitest unit tests for frontend (tests/web/)
npm run test                   # Run both + cleanup

# Run a single test file
npx vitest run tests/server/projects.spec.ts

# E2E tests (Playwright, requires Docker or local sharded setup)
cd e2e-tests && npm run test

# Manual dev with Firebase emulator + sharded API servers
npm run dev:manual             # Starts Firebase emulator, 4 API shards, web dev server
```

Linting is intentionally skipped (`"lint": "echo 'lint skipped in POC'"`).

## Architecture

This is a two-service app (not a monorepo workspace) with shared `node_modules` at root:

- **`web/`** — Next.js 14 frontend (React 18, TypeScript, Tailwind)
- **`server/`** — Express API (Node.js, CommonJS)
- **`tests/`** — Vitest unit tests for both layers
- **`e2e-tests/`** — Playwright API integration tests

### Frontend (`web/`)

- Page-based routing via `pages/` directory
- Auth state managed in `web/utils/auth.tsx` (React context wrapping the page tree)
- All API calls go through `web/utils/api.ts` — an Axios instance that automatically injects Firebase Bearer tokens
- Protected pages use the `AuthedOnly` wrapper component
- Next.js rewrites `/api/*` and `/uploads/*` to the Express backend (configured in `web/next.config.mjs`)

### Backend (`server/`)

- `server/index.js` — Express entry point; registers all routes
- `server/routes/` — Modular route files grouped by domain (projects, recommendations, tradesmen, auth, etc.)
- `server/lib/` — Shared utilities: `mysql.js` (connection pool + AsyncLocalStorage transactions), `middleware.js` (Firebase auth), `migration.js` (auto-migration runner), `validation.js` (Zod schemas), `logger.js` (Pino)
- `server/migrations/` — Numbered `.sql` files (e.g. `001_init.sql`); applied automatically on startup, tracked in `_migrations` table

### Database

Dual-driver system — the same code paths work with both:
- **SQLite** (`better-sqlite3`) — used in local dev by default
- **MySQL** — used in production and E2E tests

Driver selection is automatic based on environment. MySQL uses `AsyncLocalStorage` in `server/lib/mysql.js` for per-request transaction context.

**Adding a migration:** create `server/migrations/NNN_description.sql` and restart the server. It applies automatically.

### Testing Architecture

- **Unit tests** (Vitest): `tests/server/` for API, `tests/web/` for React components. Test setup in `tests/setup/`.
- **E2E tests** (Playwright): 4 parallel shards, each with its own API server instance (ports 3100–3103) and isolated database. Tests wipe table data (not schema) before each test.
- Firebase Auth emulator (port 9099) used for all local/CI testing. Set via `FIREBASE_AUTH_EMULATOR_HOST`.

### Auth Flow

- Frontend: Firebase client SDK signs in users, gets ID tokens
- Backend: `server/lib/middleware.js` verifies ID tokens via Firebase Admin SDK on protected routes (returns 401 if missing/invalid)
- `ENABLE_TEST_ROUTES=1` enables test helper routes (`/test/*`) authenticated with `E2E_TEST_SECRET`

## Environment Variables

**Root `.env` (server):**
```
PORT=8787
FIREBASE_ADMIN_CREDENTIALS_JSON=...   # Firebase service account JSON (single line)
ENABLE_TEST_ROUTES=1
E2E_TEST_SECRET=...
MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
GOOGLE_PLACES_API_KEY=...
CH_ENV=live                           # Companies House API
CH_KEY=...
```

**`web/.env.local` (frontend):**
```
NEXT_PUBLIC_FIREBASE_CONFIG_JSON=...  # Firebase web config (or individual NEXT_PUBLIC_FIREBASE_* keys)
NEXT_PUBLIC_API_BASE=http://localhost:8787
```

## Deployment

CI/CD via GitHub Actions (`.github/workflows/deploy.yml`): pushes to `master` SSH into the production VM and run `/usr/local/bin/vmb-deploy`. Health check retries for 90s against `https://vetmybuilder.com/api/health`.

Docker files: `Dockerfile.e2e` for the E2E environment, `docker-compose.parallel.local.yml` for local sharded E2E runs with MySQL.
