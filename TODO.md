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
