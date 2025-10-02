# Server (Express API)

- Port: `PORT` (default 8787)
- Auth: Firebase ID token verification (`Authorization: Bearer <token>`)
- DB: SQLite via `better-sqlite3`
- Migrations: simple SQL runner (`server/lib/migrate.js`) that applies files from `server/migrations` on boot

## Endpoints
### `GET /health`
Healthcheck response: `{ ok: true, now: ISO }`

### `POST /api/projects` (auth required)
Create a project.
Body (JSON):
```json
{
  "name": "Kitchen Remodel",
  "type": "Kitchen",
  "location": "SW1A 1AA, Westminster",
  "description": "Full refit with electrics and plumbing",
  "propertyType": "Flat",
  "bedrooms": 2
}
```
Returns: `{ project: {...} }`

### `GET /api/projects` (auth required)
Returns projects owned by the current user and projects they recommended.
Response:
```json
{ "mine": [...], "recommended": [...] }
```

### `GET /api/projects/:id` (auth required)
Returns a single project by numeric id.

### `POST /api/recommendations` (auth required)
Minimal stub (Phase-2 ready). Body:
```json
{ "projectId": 1, "notes": "Great workmanship, on time" }
```

## Auth details
- The server initializes Firebase Admin using `FIREBASE_ADMIN_CREDENTIALS_JSON` (service account JSON string).
- `authMiddleware` verifies the incoming ID token and attaches `req.user`.

## Database
- DB file path from `DATABASE_URL` (default `./data/app.db`).
- WAL mode enabled for better concurrency.
- Tables created via migrations; see `MIGRATIONS.md`.
