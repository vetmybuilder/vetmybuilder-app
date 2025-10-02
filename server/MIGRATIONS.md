# Migrations Guide

This project uses a **tiny SQL-based migration runner** that reads `.sql` files from `server/migrations` and applies any new ones on server start.

## How it works
- A table `_migrations` tracks applied files by filename.
- On boot, files in `server/migrations` are **sorted** and executed **inside a transaction** if not yet applied.
- After success, the filename is recorded in `_migrations` with a timestamp.

## Create a new migration
1. Create a new file with the next sequence number, e.g.:
   - `server/migrations/003_add_budget.sql`
2. Put your SQL inside, for example:
```sql
ALTER TABLE projects ADD COLUMN budget INTEGER NOT NULL DEFAULT 0;
```
3. Start the server: `npm run dev` or `node server/index.js` (prod) — it will apply 003 automatically.

## Conventions
- Use incremental numeric prefixes: `001_*.sql`, `002_*.sql`, etc.
- Keep each file **idempotent** in spirit: don’t assume re-running; the runner itself enforces one-time application.
- Group related changes into one file where possible.
- Test locally on a copy of your DB file before destructive changes.

## SQLite notes
- **Add columns**: `ALTER TABLE ... ADD COLUMN ... DEFAULT ... NOT NULL` is safe.
- **Rename/drop columns**: prefer the “rebuild table” approach for compatibility:
  1. `CREATE TABLE new_table (...new schema...)`
  2. `INSERT INTO new_table (cols...) SELECT (cols...) FROM old_table;`
  3. `DROP TABLE old_table;`
  4. `ALTER TABLE new_table RENAME TO old_table;`
- Wrap destructive operations in a transaction (the runner already does).

## Troubleshooting
- Syntax error? The app will log which file failed. Fix SQL and restart.
- Need to re-apply a migration during dev? Delete the line for that file from `_migrations` **only** on your local dev DB and restart (not recommended in shared envs).
- Back up before risky changes: copy `data/app.db` to a safe path.
