import { APIRequestContext } from "@playwright/test";
import {
  firebaseSignUpEmailPassword,
  firebaseSignInEmailPassword,
} from "../apiHelper/firebaseAuth";

type RegisterUserOptions = {
  apiKey: string;
  apiBaseUrl: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username?: string;
  location?: string;
};

export async function registerUserViaApi(
  request: APIRequestContext,
  opts: RegisterUserOptions,
) {
  // Create Firebase user
  await firebaseSignUpEmailPassword({
    apiKey: opts.apiKey,
    email: opts.email,
    password: opts.password,
  });

  // Sign in to get ID token
  const session = await firebaseSignInEmailPassword({
    apiKey: opts.apiKey,
    email: opts.email,
    password: opts.password,
  });

  // Call backend signup endpoint
  const res = await request.post(`${opts.apiBaseUrl}/api/auth/signup`, {
    headers: {
      Authorization: `Bearer ${session.idToken}`,
    },
    data: {
      firstName: opts.firstName,
      lastName: opts.lastName,
      username: opts.username,
      location: opts.location,
    },
  });

  if (res.status() !== 200) {
    const body = await res.text().catch(() => "");
    throw new Error(`POST /api/auth/signup failed: ${res.status()} ${body}`);
  }

  return {
    email: opts.email,
    password: opts.password,
  };
}
