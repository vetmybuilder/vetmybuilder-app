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
  const { loading: authLoading } = useAuth();

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

    try {
      await api.post("/api/account", {
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        username: form.username.trim() || null,
        location: form.location.trim() || "",
      });

      setSaved(true);
      const t = setTimeout(() => router.replace("/projects"), 1200);
      // cleanup if user navigates early
      return () => clearTimeout(t);
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

      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Manage account
        </h1>
        <p className="text-slate-500 mb-6">Update your profile info.</p>

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
              {err}
            </div>
          )}

          {loading ? (
            <p>Loading…</p>
          ) : (
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3">
              <label htmlFor={ids.first} className="text-sm">
                First name
              </label>
              <input
                id={ids.first}
                className="input"
                placeholder="First name"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />

              <label htmlFor={ids.last} className="text-sm">
                Last name
              </label>
              <input
                id={ids.last}
                className="input"
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />

              <label htmlFor={ids.email} className="text-sm">
                Email
              </label>
              <input
                id={ids.email}
                className="input opacity-70 cursor-not-allowed"
                placeholder="Email"
                value={form.email}
                disabled
                readOnly
              />

              <label htmlFor={ids.username} className="text-sm">
                Username
              </label>
              <input
                id={ids.username}
                className="input"
                placeholder="Username"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
              />

              <label htmlFor={ids.location} className="text-sm">
                Location (postcode or city)
              </label>
              <input
                id={ids.location}
                className="input"
                placeholder="E4 6JH, SW1, London…"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
              />

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
