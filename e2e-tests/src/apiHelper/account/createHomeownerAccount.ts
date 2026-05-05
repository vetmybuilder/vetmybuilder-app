// e2e-tests/src/apiHelper/account/createHomeownerAccount.ts
//
// API-only helper that creates a Firebase auth user, signs them up via
// the API, and returns both the Account model + an authed API client.
//
// Use this when a UI test needs an existing homeowner without going
// through the registration UI. Combine two of these with ProjectApi to
// get "recommender + owner with project" with no UI bootstrapping.

import type { APIRequestContext } from "@playwright/test";
import { authedApiForUid } from "../../api/services/client";
import { createAuthUser } from "../../helpers/FirebaseSeed";
import Account from "../../models/Account";
import { AuthApi } from "../auth/AuthApi";

type Args = {
  request: APIRequestContext;
  apiBaseUrl: string;
  /** Defaults to "E4". */
  location?: string;
  /** Optional prefix to disambiguate emails when seeding multiple accounts. */
  emailPrefix?: string;
};

type Result = {
  account: Account;
  client: Awaited<ReturnType<typeof authedApiForUid>>;
  uid: string;
};

export async function createHomeownerAccount(args: Args): Promise<Result> {
  const location = args.location ?? "E4";
  const password = "Passw0rd!";
  const prefix = args.emailPrefix ?? "ho";
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

  const account = Account.anAccount()
    .withRandomDetails()
    .withLocation(location)
    .withEmail(`${prefix}+${suffix}@test.com`)
    .withPassword(password);

  const fb = await createAuthUser(account.email!, account.password!);
  const client = await authedApiForUid(args.request, args.apiBaseUrl, fb.uid);
  await AuthApi.signup(client, account);

  return { account, client, uid: fb.uid };
}
