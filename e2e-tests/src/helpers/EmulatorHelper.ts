// e2e-tests/src/helpers/EmulatorHelper.ts
// Fetches OOB codes (password reset links) from the Firebase Auth Emulator REST API.

const EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  "vetmybuilder";

type OobCode = {
  email: string;
  oobCode: string;
  oobLink: string;
  requestType: string;
};

/**
 * Returns all pending OOB codes from the Firebase Auth Emulator.
 */
export async function getEmulatorOobCodes(): Promise<OobCode[]> {
  const url = `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch OOB codes from emulator: ${res.status} ${res.statusText}`,
    );
  }
  const body = await res.json();
  return (body.oobCodes as OobCode[]) || [];
}

/**
 * Returns the most recent password-reset OOB code for the given email.
 */
export async function getPasswordResetCode(email: string): Promise<string> {
  // Poll for up to 5 seconds — emulator is usually instant but give it time
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const codes = await getEmulatorOobCodes();
    const match = codes
      .filter(
        (c) =>
          c.requestType === "PASSWORD_RESET" &&
          c.email.toLowerCase() === email.toLowerCase(),
      )
      .pop(); // most recent
    if (match) return match.oobCode;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No password reset OOB code found for ${email} in emulator`);
}
