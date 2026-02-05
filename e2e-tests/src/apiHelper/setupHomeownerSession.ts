import type { APIRequestContext, Page } from "@playwright/test";
import { authedApiForUid } from "../api/services/client";
import { uiLoginAsUid } from "./uiAuth";

type MaybeString = string | null | undefined;

function reqString(v: MaybeString, fieldName: string) {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required field: ${fieldName}`);
  return s;
}

export async function loginInAsHomeowner(args: {
  request: APIRequestContext;
  page: Page;
  apiBaseUrl: string; // http://localhost:3100
  uiBaseUrl: string; // http://localhost:3000
  uid?: string;

  firstName: MaybeString;
  lastName: MaybeString;
  location: MaybeString;
}) {
  const uid = args.uid || `ui-homeowner-${Date.now()}`;

  const apiClient = await authedApiForUid(args.request, args.apiBaseUrl, uid);

  const res = await apiClient.post("/api/auth/signup", {
    firstName: reqString(args.firstName, "firstName"),
    lastName: reqString(args.lastName, "lastName"),
    location: reqString(args.location, "location"),
  });

  if (!res.ok()) throw new Error(`Signup failed: ${res.status()}`);

  await uiLoginAsUid({
    request: args.request,
    apiBaseUrl: args.apiBaseUrl,
    uiBaseUrl: args.uiBaseUrl,
    uid,
    page: args.page,
  });

  return { uid };
}
