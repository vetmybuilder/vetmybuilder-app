// web/pages/account.tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";

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

export default function ManageAccount() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading, mergeUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
    []
  );

  const set = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    setSaved(false);

    const payload = {
      firstName: form.firstName.trim() || null,
      lastName: form.lastName.trim() || null,
      username: form.username.trim() || null,
      location: form.location.trim() || "",
    };

    try {
      await api.post("/api/account", payload);

      // Instantly update the Auth context so header initials/name re-render now.
      mergeUser({
        firstName: payload.firstName,
        lastName: payload.lastName,
        username: payload.username,
      });

      setSaved(true);

      // Soft redirect after a short confirmation window
      const t = window.setTimeout(() => {
        router.replace("/projects");
      }, 1200);
      // If the component unmounts early, clear the timer
      const cn = () => window.clearTimeout(t);
      // Attach once per submit
      window.addEventListener("beforeunload", cn, { once: true });
      // Cleanup if user navigates within SPA before timeout
      setTimeout(() => window.removeEventListener("beforeunload", cn), 1300);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        (typeof e?.message === "string" ? e.message : "Failed to save changes");
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthedOnly>
      <Head>
        <title>Manage account</title>
      </Head>

      <div
        className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8"
        data-testid="account-page"
      >
        <h1
          className="text-3xl font-semibold tracking-tight mb-2"
          data-testid="account-title"
        >
          Manage account
        </h1>
        <p className="text-slate-500 mb-6" data-testid="account-subtitle">
          Update your profile info.
        </p>

        <div className="card" data-testid="account-card">
          {saved && (
            <div
              role="status"
              aria-live="polite"
              className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 text-sm"
              data-testid="account-alert-success"
            >
              Details updated. Redirecting…
            </div>
          )}
          {err && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm"
              data-testid="account-alert-error"
            >
              {err}
            </div>
          )}

          {loading ? (
            <p data-testid="account-loading">Loading…</p>
          ) : (
            <form
              onSubmit={onSubmit}
              className="grid grid-cols-1 gap-3"
              data-testid="account-form"
            >
              <label
                htmlFor={ids.first}
                className="text-sm"
                data-testid="label-first-name"
              >
                First name
              </label>
              <input
                id={ids.first}
                className="input"
                placeholder="First name"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                data-testid="input-first-name"
              />

              <label
                htmlFor={ids.last}
                className="text-sm"
                data-testid="label-last-name"
              >
                Last name
              </label>
              <input
                id={ids.last}
                className="input"
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                data-testid="input-last-name"
              />

              <label
                htmlFor={ids.email}
                className="text-sm"
                data-testid="label-email"
              >
                Email
              </label>
              <input
                id={ids.email}
                className="input opacity-70 cursor-not-allowed"
                placeholder="Email"
                value={form.email}
                disabled
                readOnly
                data-testid="input-email"
              />

              <label
                htmlFor={ids.username}
                className="text-sm"
                data-testid="label-username"
              >
                Username
              </label>
              <input
                id={ids.username}
                className="input"
                placeholder="Username"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                data-testid="input-username"
              />

              <label
                htmlFor={ids.location}
                className="text-sm"
                data-testid="label-location"
              >
                Location (postcode or city)
              </label>
              <input
                id={ids.location}
                className="input"
                placeholder="E4 6JH, SW1, London…"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                data-testid="input-location"
              />

              <button
                className="btn mt-2 disabled:opacity-50"
                disabled={busy}
                data-testid="btn-save"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </form>
          )}
        </div>
      </div>
    </AuthedOnly>
  );
}
