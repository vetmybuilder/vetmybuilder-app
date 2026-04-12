// e2e-tests/src/helpers/FirebaseSeed.ts
import admin from "firebase-admin";
import type { APIRequestContext } from "@playwright/test";

let isInitialised = false;

function getProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    undefined
  );
}

function buildCredential(): admin.credential.Credential {
  const credJson = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (credJson) return admin.credential.cert(JSON.parse(credJson));
  return admin.credential.applicationDefault();
}

function initAdmin(): void {
  if (isInitialised) return;
  if (admin.apps.length) {
    isInitialised = true;
    return;
  }

  const config: admin.AppOptions = { credential: buildCredential() };
  const projectId = getProjectId();
  if (projectId) config.projectId = projectId;

  admin.initializeApp(config);
  isInitialised = true;
}

export async function createAuthUser(email: string, password: string) {
  initAdmin();
  const auth = admin.auth();

  const existing = await auth.getUserByEmail(email).catch(() => null);
  if (existing) return existing;

  return auth.createUser({ email, password });
}

/**
 * Create a complete homeowner: Firebase user + MySQL profile row in a
 * single call. Mirrors `loginInAsHomeowner` but skips the UI sign-in step,
 * which is what most test setup actually needs.
 */
export async function createHomeownerUser(
  request: APIRequestContext,
  apiBaseUrl: string,
  args: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    location: string;
  },
) {
  const fbUser = await createAuthUser(args.email, args.password);

  await request.post(`${apiBaseUrl}/api/auth/signup`, {
    data: {
      firstName: args.firstName,
      lastName: args.lastName,
      location: args.location,
    },
    headers: {
      "X-Sim-Uid": fbUser.uid,
      "X-Test-Secret": process.env.E2E_TEST_SECRET!,
    },
  });

  return fbUser;
}

export async function createAuthUserWithUid(
  uid: string,
  email: string,
  password: string,
) {
  initAdmin();

  const auth = admin.auth();

  try {
    return await auth.createUser({ uid, email, password });
  } catch (err: any) {
    if (
      err?.code === "auth/uid-already-exists" ||
      err?.code === "auth/email-already-exists"
    ) {
      // User already exists — update their password so the caller's credentials
      // always work even if the emulator retained a user from a previous run.
      const existing = await auth
        .getUser(uid)
        .catch(() => auth.getUserByEmail(email));
      await auth.updateUser(existing.uid, { password });
      return existing;
    }
    throw err;
  }
}

/**
 * Generates a password reset oobCode directly via the Admin SDK.
 * Extracts the oobCode query param from the generated link.
 */
export async function generatePasswordResetCode(email: string): Promise<string> {
  initAdmin();
  const link = await admin.auth().generatePasswordResetLink(email, {
    url: "http://localhost:3000/reset-password",
  });
  const url = new URL(link);
  const oobCode = url.searchParams.get("oobCode");
  if (!oobCode) throw new Error(`No oobCode in generated link: ${link}`);
  return oobCode;
}

export async function deleteAuthUserByEmail(email: string) {
  initAdmin();

  const auth = admin.auth();

  try {
    const user = await auth.getUserByEmail(email);
    await auth.deleteUser(user.uid);
  } catch (err: any) {
    if (err?.code === "auth/user-not-found") return;
    throw err;
  }
}
