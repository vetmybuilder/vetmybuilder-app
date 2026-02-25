import type { APIRequestContext, Page } from "@playwright/test";
import { authedApiForUid } from "../api/services/client";
import { uiLoginAsUid } from "./uiAuth";

type MaybeString = string | null | undefined;

function reqString(v: MaybeString, fieldName: string) {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required field: ${fieldName}`);
  return s;
}

function looksLikeAlreadySignedUp(bodyText: string): boolean {
  const t = (bodyText || "").toLowerCase();
  return (
    t.includes("already") ||
    t.includes("exists") ||
    t.includes("signed up") ||
    t.includes("user exists") ||
    t.includes("duplicate")
  );
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

  const email = String(args.email || `e2e+${uid}@example.test`).trim();

  const apiClient = await authedApiForUid(
    args.page.request,
    args.apiBaseUrl,
    uid,
    args.page,
  );

  const res = await apiClient.post("/api/auth/signup", {
    firstName: reqString(args.firstName, "firstName"),
    lastName: reqString(args.lastName, "lastName"),
    location: reqString(args.location, "location"),
  });

  const bodyText = await res.text().catch(() => "");

  if (!res.ok()) {
    if (res.status() === 409) {
      // already exists
    } else if (res.status() === 400 && looksLikeAlreadySignedUp(bodyText)) {
      // ignore known already-signed-up case
    } else {
      throw new Error(
        `Signup failed: ${res.status()} ${res.statusText()}\n${bodyText || "(no body)"}`,
      );
    }
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
