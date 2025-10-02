# Vetmybuilder — Expanded Test Suite

This expands coverage to **all routes (guard-rails)**, adds **DB behavior checks** and **component tests**, plus **fixtures/factories**.

## Install dev deps

```bash
npm i -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom supertest @types/supertest @types/node @types/react @types/react-dom
```

## Run

```bash
npx vitest run --config vitest.config.ts
npx vitest run --config vitest.web.config.ts
```

## What’s included

- **API guard tests** for every protected endpoint (ensures 401 without bearer). Also covers the **magic recommendation** endpoint (404 when token unknown).
- **DB behavior tests**:
  - Archive ↔ Unarchive transitions and timestamps
  - Publish-like fan-out creating notifications for nearby users (via `user_profiles.city`), excluding the owner
- **Component tests** for:
  - `StatusBadge` (values + unknown)
  - `Layout` (authless state shows "Not signed in")
  - `NotificationsBell` (smoke render with mocked API/Link)
- **Factories** for projects, user profiles, and notifications to keep tests tidy.
