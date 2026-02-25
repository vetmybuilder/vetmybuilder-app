export type FirebaseAuthSession = {
  idToken: string;
  refreshToken: string;
  localId: string;
  email: string;
};

type FirebaseAuthOptions = {
  apiKey: string;
  email: string;
  password: string;
};

function getEmulatorHost(): string | null {
  const host =
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ||
    null;

  return host && host.trim() ? host.trim() : null;
}

function buildBaseUrl(): string {
  const emulator = getEmulatorHost();

  if (emulator) {
    return `http://${emulator}/identitytoolkit.googleapis.com/v1`;
  }

  return "https://identitytoolkit.googleapis.com/v1";
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.error ||
      `Request failed: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return json as T;
}

export async function firebaseSignUpEmailPassword(
  opts: FirebaseAuthOptions,
): Promise<FirebaseAuthSession> {
  const base = buildBaseUrl();
  const url = `${base}/accounts:signUp?key=${encodeURIComponent(opts.apiKey)}`;

  const json = await postJson<any>(url, {
    email: opts.email,
    password: opts.password,
    returnSecureToken: true,
  });

  return {
    idToken: json.idToken,
    refreshToken: json.refreshToken,
    localId: json.localId,
    email: json.email,
  };
}

export async function firebaseSignInEmailPassword(
  opts: FirebaseAuthOptions,
): Promise<FirebaseAuthSession> {
  const base = buildBaseUrl();
  const url = `${base}/accounts:signInWithPassword?key=${encodeURIComponent(
    opts.apiKey,
  )}`;

  const json = await postJson<any>(url, {
    email: opts.email,
    password: opts.password,
    returnSecureToken: true,
  });

  return {
    idToken: json.idToken,
    refreshToken: json.refreshToken,
    localId: json.localId,
    email: json.email,
  };
}
