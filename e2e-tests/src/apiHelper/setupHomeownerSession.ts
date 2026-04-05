import type { APIRequestContext, Page } from "@playwright/test";
import { uiLoginAsUid } from "./uiAuth";

type MaybeString = string | null | undefined;

function reqString(v: MaybeString, field: string): string {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required field: ${field}`);
  return s;
}

export async function loginInAsHomeowner(args: {
  request: APIRequestContext;
  page: Page;
  apiBaseUrl: string;
  uiBaseUrl: string;
  uid?: string;
  firstName: MaybeString;
  lastName: MaybeString;
  location: MaybeString;
  email?: MaybeString;
}) {
  const uid = String(args.uid || `ui-homeowner-${Date.now()}`).trim();
  if (!uid) throw new Error("Missing uid");

  const testSecret = process.env.E2E_TEST_SECRET;
  if (!testSecret) throw new Error("Missing E2E_TEST_SECRET");

  const payload = {
    firstName: reqString(args.firstName, "firstName"),
    lastName: reqString(args.lastName, "lastName"),
    location: reqString(args.location, "location"),
  };

  // Use X-Sim-Uid + X-Test-Secret to bypass Firebase token verification.
  // This avoids flakiness from the server-side 60s ID token cache, which can
  // return stale tokens when the emulator user is updated between tests.
  const res = await args.request.post(`${args.apiBaseUrl}/api/auth/signup`, {
    data: payload,
    headers: {
      "X-Sim-Uid": uid,
      "X-Test-Secret": testSecret,
    },
  });

  if (!res.ok() && res.status() !== 409) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Signup failed: ${res.status()} ${res.statusText()}\n${body || "(no body)"}`,
    );
  }

  await uiLoginAsUid({
    request: args.request,
    apiBaseUrl: args.apiBaseUrl,
    uiBaseUrl: args.uiBaseUrl,
    uid,
    page: args.page,
  });

  return { uid };
}
