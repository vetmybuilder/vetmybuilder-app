# Vetmybuilder v1.3 (POC)

**Next.js (web)** + **Express (server)** + **SQLite** + **Firebase Auth**.
Node 20+. Tailwind for styling.

## Contents
- `web/` – Next.js 14 + TypeScript + Tailwind UI
- `server/` – Express API + Firebase Admin + SQLite + migrations
- `data/` – local SQLite DB file (created automatically)

## Quick start
1. Copy `.env.sample` → `.env` at repo root (server vars) **and** `web/.env.local.sample` → `web/.env.local` (web vars). Fill both.
2. Install deps: `npm install`
3. Run both apps: `npm run dev`
   - Web: http://localhost:3000
   - API: http://localhost:8787

## Environment variables
See `.env.sample` for all options. You **must** set:
- `NEXT_PUBLIC_FIREBASE_CONFIG_JSON` – JSON string of your web Firebase config
- `FIREBASE_ADMIN_CREDENTIALS_JSON` – JSON string of your Firebase service account

## Scripts
- `npm run dev` – runs Next dev server and API together
- `npm run build` – builds the Next.js app
- `npm run start` – starts API and Next in prod modes

## Project scope (Phase 1)
- Register/Login via Firebase
- Create Project (name, type, location, description, propertyType, bedrooms)
- Projects List (My Projects / Recommended)
- Project View

## Where to read more
- `server/README.md` – API routes, auth, DB, migrations
- `server/MIGRATIONS.md` – how to write and apply migrations
- `web/README.md` – pages, components, auth flow, styling