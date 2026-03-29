// web/pages/account.tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import AccountField from "@/components/forms/AccountField";

type AccountUser = {
  uid: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
};

type AccountProfile = {
  userId: string;
  locationRaw: string | null;
  postcode?: string | null;
  postcodeSector?: string | null;
  postcodeOutward?: string | null;
  city?: string | null;
  updatedAt?: string | null;
};

type FieldKey = "firstName" | "lastName" | "username" | "location";
type FieldErrors = Partial<Record<FieldKey, string>>;

export default function ManageAccount() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading, mergeUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    location: "",
  });

  const ids = useMemo(
    () => ({
      first: "acc-first",
      last: "acc-last",
      email: "acc-email",
      username: "acc-username",
      location: "acc-location",
    }),
    [],
  );

  const set = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (authLoading) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);
      setSaved(false);
      setFieldErrors({});

      try {
        const { data } = await api.get<{
          user: AccountUser | null;
          profile: AccountProfile | null;
        }>("/api/account");

        const u = data.user;
        const p = data.profile;

        if (!alive) return;

        setForm({
          firstName: (u?.firstName ?? "") || "",
          lastName: (u?.lastName ?? "") || "",
          email: (u?.email ?? "") || "",
          username: (u?.username ?? "") || "",
          location: (p?.locationRaw ?? "") || "",
        });
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.response?.data?.error || "Failed to load your account.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, authLoading]);

  const validate = (next: {
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    location: string;
  }) => {
    const fe: FieldErrors = {};

    if (!next.firstName) fe.firstName = "First name is required.";
    if (!next.lastName) fe.lastName = "Last name is required.";
    if (!next.username) fe.username = "Username is required.";
    if (!String(next.location || "").trim())
      fe.location = "Postcode or city is required.";

    return fe;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setErr(null);
    setSaved(false);
    setFieldErrors({});

    const payload = {
      firstName: form.firstName.trim() || null,
      lastName: form.lastName.trim() || null,
      username: form.username.trim() || null,
      location: form.location.trim() || "",
    };

    const clientErrors = validate(payload);
    if (Object.keys(clientErrors).length > 0) {
      setErr("Please fill in all required fields.");
      setFieldErrors(clientErrors);

      const firstKey = (Object.keys(clientErrors)[0] || "") as FieldKey;
      const focusId =
        firstKey === "firstName"
          ? ids.first
          : firstKey === "lastName"
            ? ids.last
            : firstKey === "username"
              ? ids.username
              : ids.location;

      queueMicrotask(() => document.getElementById(focusId)?.focus());
      setBusy(false);
      return;
    }

    try {
      await api.post("/api/account", payload);

      mergeUser({
        firstName: payload.firstName,
        lastName: payload.lastName,
        username: payload.username,
      });

      setSaved(true);

      const t = window.setTimeout(() => {
        router.replace("/projects");
      }, 1200);

      const cn = () => window.clearTimeout(t);
      window.addEventListener("beforeunload", cn, { once: true });
      setTimeout(() => window.removeEventListener("beforeunload", cn), 1300);
    } catch (e: any) {
      const data = e?.response?.data;

      const msg =
        data?.message ||
        data?.error ||
        (typeof e?.message === "string" ? e.message : "Failed to save changes");

      setErr(msg);

      const serverFieldErrors = data?.fieldErrors;
      if (serverFieldErrors && typeof serverFieldErrors === "object") {
        setFieldErrors(serverFieldErrors as FieldErrors);
      }
    } finally {
      setBusy(false);
    }
  };

  const inputClass = (hasError: boolean) =>
    ["input", hasError ? "border-red-400 ring-1 ring-red-200" : ""].join(" ");

  return (
    <AuthedOnly>
      <Head>
        <title>Manage account</title>
      </Head>

      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Manage account
        </h1>
        <p className="text-slate-500 mb-2">Update your profile info.</p>
        <p className="text-xs text-slate-500 mb-6">
          Fields marked <span className="text-red-600">*</span> are required.
        </p>

        <div className="card">
          {saved && (
            <div
              role="status"
              aria-live="polite"
              className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 text-sm"
            >
              Details updated. Redirecting…
            </div>
          )}

          {err && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm"
            >
              <div>{err}</div>

              {Object.keys(fieldErrors).length > 0 && (
                <ul className="mt-2 list-disc pl-5 space-y-1">
                  {Object.entries(fieldErrors).map(([k, v]) =>
                    v ? <li key={k}>{v}</li> : null,
                  )}
                </ul>
              )}
            </div>
          )}

          {loading ? (
            <p>Loading…</p>
          ) : (
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3">
              <AccountField
                id={ids.first}
                label="First name"
                required
                error={fieldErrors.firstName}
                errorId="acc-first-error"
              >
                <input
                  id={ids.first}
                  className={inputClass(!!fieldErrors.firstName)}
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  aria-invalid={!!fieldErrors.firstName}
                  aria-describedby={
                    fieldErrors.firstName ? "acc-first-error" : undefined
                  }
                />
              </AccountField>

              <AccountField
                id={ids.last}
                label="Last name"
                required
                error={fieldErrors.lastName}
                errorId="acc-last-error"
              >
                <input
                  id={ids.last}
                  className={inputClass(!!fieldErrors.lastName)}
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  aria-invalid={!!fieldErrors.lastName}
                  aria-describedby={
                    fieldErrors.lastName ? "acc-last-error" : undefined
                  }
                />
              </AccountField>

              <AccountField id={ids.email} label="Email">
                <input
                  id={ids.email}
                  className="input opacity-70 cursor-not-allowed"
                  placeholder="Email"
                  value={form.email}
                  disabled
                  readOnly
                />
              </AccountField>

              <AccountField
                id={ids.username}
                label="Username"
                required
                error={fieldErrors.username}
                errorId="acc-username-error"
              >
                <input
                  id={ids.username}
                  className={inputClass(!!fieldErrors.username)}
                  placeholder="Username"
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  aria-invalid={!!fieldErrors.username}
                  aria-describedby={
                    fieldErrors.username ? "acc-username-error" : undefined
                  }
                />
              </AccountField>

              <AccountField
                id={ids.location}
                label="Location (postcode or city)"
                required
                error={fieldErrors.location}
                errorId="acc-location-error"
              >
                <input
                  id={ids.location}
                  className={inputClass(!!fieldErrors.location)}
                  placeholder="E4 6JH, SW1, London…"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  aria-invalid={!!fieldErrors.location}
                  aria-describedby={
                    fieldErrors.location ? "acc-location-error" : undefined
                  }
                />
              </AccountField>

              <button className="btn mt-2 disabled:opacity-50" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </form>
          )}
        </div>
      </div>
    </AuthedOnly>
  );
}
