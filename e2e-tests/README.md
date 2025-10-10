# Clean E2E (Playwright) — Signup only

This is a **fresh** Playwright TS setup with a single **signup** journey and a **test DB**.
No previous example specs are included.

## One command
```bash
npm i
npx playwright install
npm run test
```

What happens:
- Resets **data/app.test.db** (fixture).
- Boots **API** on **:8788** (using `server/.env.test`).
- Boots **Web** on **:3100** (using `web/.env.local`).
- Runs `tests/signup.spec.ts`.

## Files
- `tests/fixtures.ts` – resets `data/app.test.db` before tests.
- `tests/signup.spec.ts` – signup journey, expects redirect to `projects/` or `dashboard/`.
- `src/utils/db.ts` – helper to wipe the SQLite test DB.
- `server/.env.test` – API env for tests: `PORT=8788`, `DATABASE_URL=./data/app.test.db`, `WEB_PUBLIC_BASE=http://localhost:3100`.
- `web/.env.local` – Web env for tests: `NEXT_PUBLIC_API_BASE=http://localhost:8788`.
- `playwright.config.ts` – auto-starts API & Web via `webServer`.
- `package.json` – has `"test": "playwright test -c playwright.config.ts"`.

> Adjust the `cd server` / `cd web` paths in `playwright.config.ts` if your monorepo uses different folders.
