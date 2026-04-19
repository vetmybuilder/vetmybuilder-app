// web/pages/account/notifications.tsx
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";

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

export default function NotificationSettings() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        if (alive) setError("Failed to load preferences.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [api, authLoading]);

  async function toggleCategory(key: keyof Preferences) {
    const newValue = !prefs[key];
    const prev = { ...prefs };

    // Optimistic update
    setPrefs((p) => ({ ...p, [key]: newValue }));
    setSaving(key);
    setError(null);

    try {
      await api.put("/api/notifications/preferences", { [key]: newValue });
    } catch {
      // Revert on failure
      setPrefs(prev);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <AuthedOnly>
      <Head>
        <title>Notification settings — VetMyBuilder</title>
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
                  Notification settings
                </h1>
                <p className="mt-2 text-zinc-500 text-sm leading-relaxed">
                  Choose which push notifications you receive. The notification
                  bell always shows all notifications regardless of these
                  settings.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm font-medium"
                >
                  {error}
                </div>
              )}

              {loading ? (
                <p className="text-zinc-400 text-sm">Loading...</p>
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
            </div>
          </div>
        </div>
      </div>
    </AuthedOnly>
  );
}
