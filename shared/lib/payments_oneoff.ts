// shared/lib/payments_oneoff.ts
const { query } = require("../lib/mysql");

export type OneOffStatus = "pending_admin" | "active" | "rejected" | "deleted";

export interface OneOffRow {
  id: number;
  user_id: string;
  type: "unlock_contact" | "spotlight";
  amount: number | null;
  currency: string | null;
  status: OneOffStatus;
  provider_session_id: string | null;
  provider_payment_intent: string | null;
  expires_at: string | null;
  created_at: string;
}

/** Fetch the most recent one-off row of specific type */
export async function getLatestOneOff(
  userId: string,
  type: "unlock_contact" | "spotlight"
): Promise<OneOffRow | null> {
  const rows = await query(
    `
    SELECT *
    FROM payments_oneoff
    WHERE user_id = ? AND type = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [userId, type]
  );

  if (!rows || rows.length === 0) return null;
  return rows[0];
}

/** Normalised Spotlight status */
export async function resolveSpotlightStatus(userId: string) {
  const row = await getLatestOneOff(userId, "spotlight");

  if (!row) return { spotlight: null, expiresAt: null };

  if (row.status === "active") {
    return { spotlight: "active" as const, expiresAt: row.expires_at };
  }

  if (row.status === "pending_admin") {
    return { spotlight: "pending" as const, expiresAt: null };
  }

  return { spotlight: null, expiresAt: null };
}
