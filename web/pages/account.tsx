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
import { User, Bell } from "lucide-react";

// ── Profile types ────────────────────────────────────────────────────────────

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

// ── Notification types ───────────────────────────────────────────────────────

type Preferences = {
  hire_updates: boolean;
  recommendations: boolean;
  builder_interest: boolean;
  local_activity: boolean;
  project_matches: boolean;
};

const CATEGORIES: { key: keyof Preferences; label: string; description: string }[] = [
  {
    key: "hire_updates",
    label: "Hire updates",
    description: "When a builder accepts, declines, or a hire is cancelled",
  },
  {
    key: "recommendations",
    label: "Recommendations",
    description: "When someone recommends a builder for your project",
  },
  {
    key: "builder_interest",
    label: "Builder interest",
    description: "When a builder shares their profile with your project",
  },
  {
    key: "local_activity",
    label: "Local activity",
    description: "New projects or completions in your area",
  },
  {
    key: "project_matches",
    label: "Project matches",
    description: "Projects matching your trades and area (tradesmen only)",
  },
];

// ── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      type="button"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-red-500" : "bg-zinc-300"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Sidebar nav items ────────────────────────────────────────────────────────

type Tab = "profile" | "notifications";

const NAV_ITEMS: { tab: Tab; label: string; Icon: React.ElementType }[] = [
  { tab: "profile", label: "Profile details", Icon: User },
  { tab: "notifications", label: "Notifications", Icon: Bell },
];

// ── Main component ───────────────────────────────────────────────────────────

export default function ManageAccount() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading, mergeUser } = useAuth();

  // Derive initial tab from URL query param (?tab=notifications)
  const initialTab = (): Tab => {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("tab");
      if (q === "notifications") return "notifications";
    }
    return "profile";
  };

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Sync tab from router query after hydration
  useEffect(() => {
    if (router.query.tab === "notifications") setActiveTab("notifications");
    else if (router.query.tab === "profile") setActiveTab("profile");
  }, [router.query.tab]);

  // ── Profile state ──────────────────────────────────────────────────────────

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

  // ── Notification state ─────────────────────────────────────────────────────

  const [notifLoading, setNotifLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>({
    hire_updates: true,
    recommendations: true,
    builder_interest: true,
    local_activity: false,
    project_matches: true,
  });

  useEffect(() => {
    if (authLoading) return;
    let alive = true;

    (async () => {
      try {
        const { data } = await api.get("/api/notifications/preferences");
        if (!alive) return;
        setPrefs(data.preferences || data);
      } catch {
        if (alive) setNotifError("Failed to load preferences.");
      } finally {
        if (alive) setNotifLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [api, authLoading]);

  async function toggleCategory(key: keyof Preferences) {
    const newValue = !prefs[key];
    const prev = { ...prefs };

    setPrefs((p) => ({ ...p, [key]: newValue }));
    setSaving(key);
    setNotifError(null);

    try {
      await api.put("/api/notifications/preferences", { [key]: newValue });
    } catch {
      setPrefs(prev);
      setNotifError("Failed to save. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AuthedOnly>
      <Head>
        <title>Manage Account — VetMyBuilder</title>
      </Head>

      <div className="overflow-x-hidden -mt-14 min-h-screen">
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16 pb-10 sm:py-24">
          <div className="relative z-10 w-full max-w-3xl px-4 sm:px-0">

            {/* Card */}
            <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 overflow-hidden">
              <div className="flex flex-col sm:flex-row">

                {/* ── Mobile: horizontal tabs ── */}
                <div className="sm:hidden flex border-b border-zinc-100">
                  {NAV_ITEMS.map(({ tab, label, Icon }) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-colors border-b-2 ${
                        activeTab === tab
                          ? "border-red-500 text-red-600"
                          : "border-transparent text-zinc-500 hover:text-zinc-800"
                      }`}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── Desktop: sidebar ── */}
                <nav className="hidden sm:flex flex-col w-[200px] shrink-0 border-r border-zinc-100 py-8 px-3 gap-1">
                  {NAV_ITEMS.map(({ tab, label, Icon }) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors border-l-2 ${
                        activeTab === tab
                          ? "border-red-500 font-bold text-zinc-900 bg-zinc-50"
                          : "border-transparent font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50"
                      }`}
                    >
                      <Icon size={16} className={activeTab === tab ? "text-red-500" : "text-zinc-400"} />
                      {label}
                    </button>
                  ))}
                </nav>

                {/* ── Content area ── */}
                <div className="flex-1 p-8 sm:p-10">

                  {/* Profile tab */}
                  {activeTab === "profile" && (
                    <>
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
                    </>
                  )}

                  {/* Notifications tab */}
                  {activeTab === "notifications" && (
                    <>
                      <div className="mb-8">
                        <h1 className="text-3xl font-black tracking-tight text-zinc-900">
                          Notification settings
                        </h1>
                        <p className="mt-2 text-zinc-500 text-sm leading-relaxed">
                          Choose which push notifications you receive. The notification
                          bell always shows all notifications regardless of these
                          settings.
                        </p>
                      </div>

                      {notifError && (
                        <div
                          role="alert"
                          className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm font-medium"
                        >
                          {notifError}
                        </div>
                      )}

                      {notifLoading ? (
                        <p className="text-zinc-400 text-sm">Loading…</p>
                      ) : (
                        <div className="divide-y divide-zinc-100">
                          {CATEGORIES.map((cat) => (
                            <div
                              key={cat.key}
                              className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                            >
                              <label
                                htmlFor={`toggle-${cat.key}`}
                                className="flex-1 cursor-pointer pr-4"
                              >
                                <div className="text-sm font-semibold text-zinc-900">
                                  {cat.label}
                                </div>
                                <div className="mt-0.5 text-xs text-zinc-500">
                                  {cat.description}
                                </div>
                              </label>

                              <Toggle
                                id={`toggle-${cat.key}`}
                                checked={prefs[cat.key]}
                                onChange={() => toggleCategory(cat.key)}
                                disabled={saving === cat.key}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </AuthedOnly>
  );
}
