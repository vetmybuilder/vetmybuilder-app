// web/utils/email.ts
import type { AxiosInstance } from "axios";

/**
 * Ensure an email address is not already in use (including aliases).
 *
 * Uses /api/auth/check-email which should:
 *  - normalise the email (e.g. strip +aliases where appropriate)
 *  - return { ok: true, exists, existsNormalized }
 */
export async function ensureEmailAvailable(
  api: AxiosInstance,
  email: string
): Promise<void> {
  const clean = (email || "").trim();
  if (!clean) {
    throw new Error("Email is required.");
  }

  const { data } = await api.post("/api/auth/check-email", { email: clean });

  if (data?.ok !== true) {
    throw new Error(
      data?.error || "Could not verify this email. Please try again."
    );
  }

  if (data?.exists || data?.existsNormalized) {
    throw new Error(
      "An account with this email already exists (including aliases). Try signing in instead."
    );
  }
}
