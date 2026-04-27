// web/pages/account.tsx
//
// Mobile-native settings hub with two drill-in screens.
// Routes:
//   /account            → hub (avatar + name + email, row cards)
//   /account?tab=profile     → profile edit form
//   /account?tab=notifications → notification toggles

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth, signOutUser } from "@/utils/auth";
import AccountField from "@/components/forms/AccountField";
import LocationField from "@/components/forms/LocationField";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

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
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-indigo-500" : "bg-zinc-300"
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

// ── Shared top bar ───────────────────────────────────────────────────────────

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center text-gray-600 shrink-0"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="flex-1 text-[15px] font-extrabold text-gray-900">{title}</span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ManageAccount() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading, mergeUser, user } = useAuth();

  // Derive view from URL query param
  type View = "hub" | "profile" | "notifications";
  const tab = router.query.tab as string | undefined;
  const view: View = tab === "profile" ? "profile" : tab === "notifications" ? "notifications" : "hub";

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
      hasError ? "border-red-400 focus:border-red-500" : "border-zinc-200 focus:border-indigo-400"
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

  // ── Status pill helpers ────────────────────────────────────────────────────

  // Profile pill: count required fields (firstName, lastName, username, location)
  const profilePill = useMemo(() => {
    if (loading) return null;
    const required = [form.firstName, form.lastName, form.username, form.location];
    const filled = required.filter((v) => v && v.trim()).length;
    const empty = 4 - filled;
    if (empty === 0) {
      return { label: "All set", color: "emerald" as const };
    }
    return { label: `${empty} to complete`, color: "amber" as const };
  }, [loading, form]);

  // Notifications pill: count enabled toggles
  const notifPill = useMemo(() => {
    if (notifLoading) return null;
    const total = CATEGORIES.length;
    const on = CATEGORIES.filter((c) => prefs[c.key]).length;
    if (on === total) {
      return { label: "All on", color: "emerald" as const };
    }
    if (on === 0) {
      return { label: "All off", color: "emerald" as const };
    }
    return { label: `${on} of ${total}`, color: "amber" as const };
  }, [notifLoading, prefs]);

  // ── Avatar initials ────────────────────────────────────────────────────────

  const avatarInitials = useMemo(() => {
    const fn = (form.firstName || user?.firstName || "").trim();
    const ln = (form.lastName || user?.lastName || "").trim();
    if (fn || ln) {
      return `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase();
    }
    return (user?.email || "?").charAt(0).toUpperCase();
  }, [form.firstName, form.lastName, user]);

  const displayName = useMemo(() => {
    const fn = (form.firstName || user?.firstName || "").trim();
    const ln = (form.lastName || user?.lastName || "").trim();
    if (fn || ln) return `${fn} ${ln}`.trim();
    return user?.displayName || "";
  }, [form.firstName, form.lastName, user]);

  const displayEmail = form.email || user?.email || "";

  // ── Sign out ───────────────────────────────────────────────────────────────

  async function handleSignOut() {
    try {
      await signOutUser();
    } catch (e) {
      console.warn("[account] signOutUser failed", e);
    }
    router.replace("/");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AuthedOnly>
      <Head>
        <title>Account — VetMyBuilder</title>
      </Head>

      <div className="min-h-screen bg-gray-50">

        {/* ── Hub view ── */}
        {view === "hub" && (
          <>
            {/* Top bar */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
              <button
                type="button"
                onClick={() => router.back()}
                aria-label="Back"
                className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center text-gray-600 shrink-0"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="flex-1 text-[15px] font-extrabold text-gray-900">Account</span>
            </div>

            {/* Indigo hero */}
            <div
              style={{
                background: "linear-gradient(135deg, #6366f1, #4338ca)",
                padding: "18px 14px 22px",
                textAlign: "center",
                color: "white",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  border: "3px solid rgba(255,255,255,0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  fontWeight: 800,
                  color: "white",
                  marginBottom: 10,
                }}
              >
                {avatarInitials}
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.3 }}>
                {displayName || "Your account"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>
                {displayEmail}
              </div>
            </div>

            {/* Row cards */}
            <div className="flex flex-col gap-2.5 p-[14px_12px]" style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

              {/* Profile details row */}
              <button
                type="button"
                onClick={() => router.push("/account?tab=profile")}
                className="w-full bg-white rounded-2xl shadow-sm flex items-center gap-3 text-left"
                style={{ padding: 14 }}
              >
                {/* Icon tile */}
                <div
                  className="rounded-xl flex items-center justify-center shrink-0"
                  style={{ width: 40, height: 40, borderRadius: 11, background: "#eef2ff", fontSize: 18 }}
                >
                  👤
                </div>
                {/* Label */}
                <span className="flex-1 text-[14.5px] font-extrabold text-gray-900">
                  Profile details
                </span>
                {/* Status pill */}
                {profilePill && (
                  <span
                    className={`text-[11px] font-extrabold rounded-full shrink-0 ${
                      profilePill.color === "emerald"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-800"
                    }`}
                    style={{ padding: "5px 10px" }}
                  >
                    {profilePill.label}
                  </span>
                )}
                {/* Chevron */}
                <span className="text-gray-300 text-[18px] shrink-0 ml-1">›</span>
              </button>

              {/* Notifications row */}
              <button
                type="button"
                onClick={() => router.push("/account?tab=notifications")}
                className="w-full bg-white rounded-2xl shadow-sm flex items-center gap-3 text-left"
                style={{ padding: 14 }}
              >
                <div
                  className="rounded-xl flex items-center justify-center shrink-0"
                  style={{ width: 40, height: 40, borderRadius: 11, background: "#fffbeb", fontSize: 18 }}
                >
                  🔔
                </div>
                <span className="flex-1 text-[14.5px] font-extrabold text-gray-900">
                  Notifications
                </span>
                {notifPill && (
                  <span
                    className={`text-[11px] font-extrabold rounded-full shrink-0 ${
                      notifPill.color === "emerald"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-800"
                    }`}
                    style={{ padding: "5px 10px" }}
                  >
                    {notifPill.label}
                  </span>
                )}
                <span className="text-gray-300 text-[18px] shrink-0 ml-1">›</span>
              </button>

              {/* Sign out row */}
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full bg-white rounded-2xl shadow-sm flex items-center gap-3 text-left"
                style={{ padding: 14 }}
              >
                <div
                  className="rounded-xl flex items-center justify-center shrink-0"
                  style={{ width: 40, height: 40, borderRadius: 11, background: "#fff1f2", fontSize: 18 }}
                >
                  ⏏
                </div>
                <span className="flex-1 text-[14.5px] font-extrabold text-red-500">
                  Sign out
                </span>
              </button>

            </div>
          </>
        )}

        {/* ── Profile drill-in ── */}
        {view === "profile" && (
          <>
            <TopBar title="Profile details" onBack={() => router.push("/account")} />

            <div className="flex flex-col gap-3 p-4">

              {saved && (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm font-medium"
                >
                  Details updated. Redirecting…
                </div>
              )}

              {err && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm font-medium"
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
                <p className="text-zinc-400 text-sm px-1">Loading…</p>
              ) : (
                <form onSubmit={onSubmit} className="flex flex-col gap-3">

                  <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-4">
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

                    <AccountField id={ids.location} label="Postcode or City/Borough" required error={fieldErrors.location} errorId="acc-location-error">
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
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-4">
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
                  </div>

                  <button
                    className="w-full inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-8 py-4 text-base font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={busy}
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </button>

                </form>
              )}
            </div>
          </>
        )}

        {/* ── Notifications drill-in ── */}
        {view === "notifications" && (
          <>
            <TopBar title="Notifications" onBack={() => router.push("/account")} />

            <div className="flex flex-col gap-3 p-4">

              {notifError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm font-medium"
                >
                  {notifError}
                </div>
              )}

              <p className="text-xs text-zinc-500 px-1">
                Choose which push notifications you receive. The notification bell always shows all notifications regardless of these settings.
              </p>

              {notifLoading ? (
                <p className="text-zinc-400 text-sm px-1">Loading…</p>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm divide-y divide-zinc-100">
                  {CATEGORIES.map((cat) => (
                    <div
                      key={cat.key}
                      className="flex items-center justify-between px-4 py-4"
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
            </div>
          </>
        )}

      </div>
    </AuthedOnly>
  );
}
