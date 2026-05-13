// e2e-tests/src/apiHelper/project/setupOwnerWithLiveProject.ts
//
// Test scaffold: creates a homeowner account via the API, posts and publishes
// a project, and returns the API client + project so a UI test can drop into
// any flow that requires "an existing live project owned by someone else".
//
// Used by recommendation/hire UI tests that need a real published project but
// don't care about the owner's UI session — typically because the test will
// then operate as a guest or as a different account.

import type { APIRequestContext } from "@playwright/test";
import { authedApiForUid } from "../../api/services/client";
import { AuthApi } from "../auth/AuthApi";
import { createAuthUser } from "../../helpers/FirebaseSeed";
import Account from "../../models/Account";
import Project from "../../models/Project";
import ProjectApi from "./ProjectApi";

type SetupArgs = {
  request: APIRequestContext;
  apiBaseUrl: string;
  /** Defaults to "E4". */
  location?: string;
};

type SetupResult = {
  owner: Account;
  ownerUid: string;
  ownerClient: Awaited<ReturnType<typeof authedApiForUid>>;
  project: Project;
  projectId: number;
};

export async function setupOwnerWithLiveProject(
  args: SetupArgs,
): Promise<SetupResult> {
  const location = args.location ?? "E4";
  const password = "Passw0rd!";

  const owner = Account.anAccount()
    .withRandomDetails()
    .withLocation(location)
    .withEmail(
      `owner+${Date.now()}-${Math.random().toString(16).slice(2, 6)}@test.com`,
    )
    .withPassword(password);

  const ownerAuthUser = await createAuthUser(owner.email!, owner.password!);
  const ownerClient = await authedApiForUid(
    args.request,
    args.apiBaseUrl,
    ownerAuthUser.uid,
  );
  await AuthApi.signup(ownerClient, owner);

  const ownerProjectApi = new ProjectApi(ownerClient);
  const project = Project.aProject().withRandomDetails({
    locationQuery: location,
    locationPick: location,
  });

  const created = await ownerProjectApi.createProject(project.toApiPayload());
  await ownerProjectApi.publishProject(created.id);

  return {
    owner,
    ownerUid: ownerAuthUser.uid,
    ownerClient,
    project,
    projectId: created.id,
  };
}
