// web/pages/account.tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import AccountField from "@/components/forms/AccountField";
import LocationField from "@/components/forms/LocationField";
import Link from "next/link";

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
    `w-full rounded-2xl border-2 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors ${
      hasError ? "border-red-400 focus:border-red-500" : "border-zinc-200 focus:border-red-400"
    }`;

  return (
    <AuthedOnly>
      <Head>
        <title>Manage account — VetMyBuilder</title>
      </Head>

      <div className="overflow-x-hidden -mt-14 min-h-screen">
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16 pb-10 sm:py-24">

          <div className="relative z-10 w-full max-w-lg px-4 sm:px-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="hidden sm:inline-flex items-center gap-2 mb-4 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              ← Back
            </button>
            <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 sm:p-10">
              <div className="mb-8">
                <h1 className="text-3xl font-black tracking-tight text-zinc-900">
                  Manage account
                </h1>
                <p className="mt-2 text-zinc-500 text-sm">
                  Update your profile details below.
                </p>
              </div>

              {saved && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm font-medium"
                >
                  Details updated. Redirecting…
                </div>
              )}

              {err && (
                <div
                  role="alert"
                  className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm font-medium"
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
                <p className="text-zinc-400 text-sm">Loading…</p>
              ) : (
                <form onSubmit={onSubmit} className="grid grid-cols-1 gap-5">
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
                      className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-400 bg-zinc-50 cursor-not-allowed"
                      placeholder="Email"
                      value={form.email}
                      disabled
                      readOnly
                    />
                  </AccountField>

                  <AccountField id={ids.username} label="Username">
                    <input
                      id={ids.username}
                      className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-400 bg-zinc-50 cursor-not-allowed"
                      placeholder="Username"
                      value={form.username}
                      disabled
                      readOnly
                    />
                    <p className="mt-1.5 text-xs text-zinc-400">
                      Username and email cannot be changed.{" "}
                      <Link href="/contact" className="underline hover:text-zinc-600 transition-colors">
                        Contact support
                      </Link>{" "}
                      if you need help.
                    </p>
                  </AccountField>

                  <AccountField
                    id={ids.location}
                    label="Postcode or City/Borough"
                    required
                    error={fieldErrors.location}
                    errorId="acc-location-error"
                  >
                    <LocationField
                      id={ids.location}
                      label=""
                      placeholder="e.g., E4, N17, Chingford"
                      value={form.location}
                      onChange={(v, meta) => {
                        if (meta) {
                          const token = meta.outward || meta.sector || meta.postcode || v;
                          set("location", token);
                        } else {
                          set("location", v);
                        }
                      }}
                      reasonText=""
                      error={fieldErrors.location}
                    />
                  </AccountField>

                  <button
                    className="w-full inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                    disabled={busy}
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthedOnly>
  );
}
