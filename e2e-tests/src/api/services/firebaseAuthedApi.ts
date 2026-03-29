import { APIRequestContext } from "@playwright/test";
import { firebaseSignInEmailPassword } from "../../apiHelper/firebaseAuth";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

export type ApiClient = {
  get: (path: string) => Promise<ApiResponse>;
  post: (path: string, payload?: any) => Promise<ApiResponse>;
};

function joinUrl(baseUrl: string, path: string) {
  const b = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export function firebaseAuthedApiClient(
  request: APIRequestContext,
  baseUrl: string,
  idToken: string,
): ApiClient {
  const headers = { Authorization: `Bearer ${idToken}` };

  return {
    get: (path: string) =>
      request.get(joinUrl(baseUrl, path), { headers }) as any,
    post: (path: string, payload?: any) =>
      request.post(joinUrl(baseUrl, path), {
        headers,
        data: payload ?? {},
      }) as any,
  };
}

export async function authedApiForEmailPassword(
  request: APIRequestContext,
  baseUrl: string,
  email: string,
  password: string,
): Promise<ApiClient> {
  const apiKey =
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing Firebase API key. Set NEXT_PUBLIC_FIREBASE_API_KEY or FIREBASE_API_KEY.",
    );
  }

  const session = await firebaseSignInEmailPassword({
    apiKey,
    email,
    password,
  });

  return firebaseAuthedApiClient(request, baseUrl, session.idToken);
}
