// e2e-tests/src/types/tradesman.ts
//
// Shared domain types for the tradesman entity. Anything that lives in the DB
// or is returned by the API and needs to be referenced from multiple places
// (page objects, API helpers, models, specs) belongs here rather than being
// re-declared inside individual page files.

/**
 * The lifecycle status of a tradesman record. Mirrors the values the server
 * accepts on `tradesmen.status`.
 *
 * - `draft`    — newly created, not yet visible to homeowners
 * - `active`   — live and discoverable
 * - `inactive` — temporarily hidden by the tradesman or admin
 * - `banned`   — permanently blocked; excluded from spotlight, hires, etc.
 */
export type TradesmanStatus = "draft" | "active" | "inactive" | "banned";
