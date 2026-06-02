// e2e-tests/src/apiHelper/project/setupSharableProjectScene.ts
//
// Enables the social share-button flags (share_nextdoor / share_facebook) and
// creates an owner with a published (live) project, so a UI test can assert the
// Nextdoor/Facebook share tiles. Mirrors setupGatedJobScene: setup + flag state
// lives here, not in the spec.

import type { APIRequestContext } from "@playwright/test";
import type { AdminApi } from "../admin/AdminApi";
import {
  setupOwnerWithLiveProject,
  type SetupResult,
} from "./setupOwnerWithLiveProject";

export async function setupSharableProjectScene(args: {
  request: APIRequestContext;
  apiBaseUrl: string;
  adminApi: AdminApi;
  location?: string;
}): Promise<SetupResult> {
  await args.adminApi.setFeatureFlag("share_nextdoor", true);
  await args.adminApi.setFeatureFlag("share_facebook", true);

  return setupOwnerWithLiveProject({
    request: args.request,
    apiBaseUrl: args.apiBaseUrl,
    location: args.location,
  });
}
