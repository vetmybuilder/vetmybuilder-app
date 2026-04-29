// web/pages/tradesman/account.tsx
//
// Tradesman account hub — mirrors the structure of web/pages/account.tsx
// Routes:
//   /tradesman/account                     → hub (company name, rows)
//   /tradesman/account?tab=notifications   → notification toggles

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import TradesmanOnly from "@/components/TradesmanOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { ChevronLeft } from "lucide-react";
import { signOut } from "firebase/auth";
import { initFirebase } from "@/utils/firebase";

// ── Notification types ────────────────────────────────────────────────────────

type Preferences = {
  matches: boolean;
  messages: boolean;
  project_matches: boolean;
};

const CATEGORIES: { key: keyof Preferences; label: string; description: string }[] = [
  {
    key: "matches",
    label: "Matches",
    description: "When a homeowner and you both swipe right and form a match",
  },
  {
    key: "messages",
    label: "Messages",
    description: "When you receive a new chat message",
  },
  {
    key: "project_matches",
    label: "Project matches",
    description: "Projects matching your trades and area",
  },
];

// ── RawProfile type ──────────────────────────────────────────────────────────

type RawProfile = {
  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  trade_types?: string | null;
  service_areas?: string | null;
  web_url?: string | null;
  photo_urls?: string[] | null;
  profile_picture_url?: string | null;
  warranty_months?: number | null;
  company_number?: string | null;
};

type MeResponse = {
  role: "tradesman" | "user";
  profile: RawProfile | null;
};

// ── Toggle component ──────────────────────────────────────────────────────────

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
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-emerald-500" : "bg-zinc-300"
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

// ── Shared top bar ────────────────────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

export default function TradesmanAccountPage() {
  return (
    <TradesmanOnly>
      <Inner />
    </TradesmanOnly>
  );
}

function Inner() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();

  // Derive view from URL query param
  type View = "hub" | "notifications";
  const tab = router.query.tab as string | undefined;
  const view: View = tab === "notifications" ? "notifications" : "hub";

  // ── Profile state ──────────────────────────────────────────────────────────

  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState<RawProfile | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let alive = true;

    (async () => {
      try {
        const res = await api.get<MeResponse>("/api/tradesmen/me");
        const data = (res as any)?.data ?? res;
        if (!alive) return;
        if (data?.profile) setProfile(data.profile);
      } catch {
        // swallow — pills will just not show
      } finally {
        if (alive) setProfileLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [api, authLoading]);

  // ── Notification state ─────────────────────────────────────────────────────

  const [notifLoading, setNotifLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>({
    matches: true,
    messages: true,
    project_matches: true,
  });

  useEffect(() => {
    if (authLoading) return;
    let alive = true;

    (async () => {
      try {
        const { data } = await api.get("/api/notifications/preferences");
        if (!alive) return;
        const raw = data.preferences || data;
        setPrefs({
          matches: raw.matches ?? true,
          messages: raw.messages ?? true,
          project_matches: raw.project_matches ?? true,
        });
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

  // Profile pill: count filled fields (companyName, contactName, email, phone, at least 1 trade, at least 1 area)
  const profilePill = useMemo(() => {
    if (profileLoading) return null;
    if (!profile) return { label: "Set up", color: "amber" as const };

    const checks = [
      !!(profile.company_name?.trim()),
      !!(profile.contact_name?.trim()),
      !!(profile.email?.trim()),
      !!(profile.phone?.trim()),
      !!(profile.trade_types?.trim()),
      !!(profile.service_areas?.trim()),
      (profile.photo_urls?.length ?? 0) > 0,
    ];
    const filled = checks.filter(Boolean).length;
    const total = checks.length;

    if (filled === total) return { label: "All set", color: "emerald" as const };
    const pct = Math.round((filled / total) * 100);
    return { label: `${pct}% complete`, color: "amber" as const };
  }, [profileLoading, profile]);

  // Notifications pill: count enabled toggles
  const notifPill = useMemo(() => {
    if (notifLoading) return null;
    const total = CATEGORIES.length;
    const on = CATEGORIES.filter((c) => prefs[c.key]).length;
    if (on === total) return { label: "All on", color: "emerald" as const };
    if (on === 0) return { label: "All off", color: "emerald" as const };
    return { label: `${on} of ${total}`, color: "amber" as const };
  }, [notifLoading, prefs]);

  // ── Avatar initials ────────────────────────────────────────────────────────

  const avatarInitials = useMemo(() => {
    const company = (profile?.company_name || "").trim();
    if (company) return company.charAt(0).toUpperCase();
    const email = user?.email || "";
    return email.charAt(0).toUpperCase() || "T";
  }, [profile, user]);

  const displayName = useMemo(() => {
    const company = (profile?.company_name || "").trim();
    if (company) return company;
    const contact = (profile?.contact_name || "").trim();
    if (contact) return contact;
    return "Your account";
  }, [profile]);

  const displayEmail = profile?.email || user?.email || "";

  // ── Sign out ───────────────────────────────────────────────────────────────

  const handleSignOut = async () => {
    try {
      const auth = initFirebase();
      await signOut(auth);
    } catch {
      // swallow
    }
    router.replace("/tradesman/login");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Head>
        <title>Account — VetMyBuilder</title>
      </Head>

      <div className="min-h-screen bg-gray-50 flex flex-col">

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

            {/* Hero - generic trade backdrop with emerald tint overlay,
                avatar = profile_picture_url if set, else initials circle. */}
            <div
              style={{
                position: "relative",
                padding: "18px 14px 22px",
                textAlign: "center",
                color: "white",
                backgroundImage:
                  "linear-gradient(135deg, rgba(16,185,129,0.78), rgba(5,150,105,0.85)), url(/job-images/building-and-construction.jpg)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {/* Avatar */}
              {profile?.profile_picture_url ? (
                <img
                  src={profile.profile_picture_url}
                  alt={displayName}
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "3px solid rgba(255,255,255,0.6)",
                    marginBottom: 10,
                    display: "inline-block",
                  }}
                />
              ) : (
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
              )}
              <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.3 }}>
                {displayName}
              </div>
              <div style={{ fontSize: 12, opacity: 0.95, marginTop: 3 }}>
                {displayEmail}
              </div>
            </div>

            {/* Row cards */}
            <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>

              {/* Profile row */}
              <button
                type="button"
                onClick={() => router.push("/tradesman/profile")}
                className="w-full bg-white rounded-2xl shadow-sm flex items-center gap-3 text-left"
                style={{ padding: 14 }}
              >
                <div
                  className="rounded-xl flex items-center justify-center shrink-0"
                  style={{ width: 40, height: 40, borderRadius: 11, background: "#ecfdf5", fontSize: 18 }}
                >
                  👤
                </div>
                <span className="flex-1 text-[14.5px] font-extrabold text-gray-900">
                  Profile
                </span>
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
                <span className="text-gray-300 text-[18px] shrink-0 ml-1">›</span>
              </button>

              {/* Notifications row */}
              <button
                type="button"
                onClick={() => router.replace("/tradesman/account?tab=notifications")}
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

            </div>

            {/* Sign out */}
            <div style={{ padding: "0 12px 24px" }}>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full bg-red-500 hover:bg-red-600 transition-colors text-white text-[15px] font-extrabold rounded-2xl"
                style={{ padding: "14px 0" }}
              >
                Sign out
              </button>
            </div>
          </>
        )}

        {/* ── Notifications drill-in ── */}
        {view === "notifications" && (
          <>
            <TopBar title="Notifications" onBack={() => router.replace("/tradesman/account")} />

            <div className="flex flex-col gap-3 p-4 flex-1">

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
    </>
  );
}
