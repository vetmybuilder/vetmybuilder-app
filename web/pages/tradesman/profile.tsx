import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";

type Profile = {
  user_id?: string;
  company_name?: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  trade_types?: string;
  service_areas?: string;
  subscription_status?: string;
};

export default function TradesProfilePage() {
  const api = useApi();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const status = useMemo(() => p?.subscription_status || "draft", [p]);

  useEffect(() => {
    let alive = true;
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent("/tradesman/profile")}`);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const prof = data?.profile || null;
        if (!alive) return;
        setP(prof);
      } catch (e: any) {
        if (!alive) return;
        setErr(
          e?.response?.data?.error || e?.message || "Failed to load profile"
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, loading, api, router]);

  function set<K extends keyof Profile>(k: K, v: Profile[K]) {
    setP((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await api.put("/api/tradesmen/me", {
        // immutable: company_name, contact_name, email
        companyName: p.company_name, // server requires it, so echo current value
        contactName: p.contact_name,
        email: p.email,
        phone: p.phone || "",
        tradeTypes: p.trade_types || "",
        serviceAreas: p.service_areas || "",
      });
      setOk("Saved.");
    } catch (e: any) {
      setErr(
        e?.response?.data?.error || e?.message || "Failed to save profile"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>Manage trades profile • Vetmybuilder</title>
      </Head>
      <div
        className="mx-auto max-w-2xl px-4 py-4"
        data-testid="trades-profile-page"
      >
        <h1 className="text-2xl font-semibold mb-2">Manage profile</h1>
        {status === "draft" && (
          <div
            className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            data-testid="review-banner"
          >
            Your account is being reviewed. We’ll notify you once your account
            is fully verified.
          </div>
        )}

        {!p ? (
          <div className="card">Loading…</div>
        ) : (
          <form
            className="card grid gap-3"
            onSubmit={save}
            data-testid="trades-profile-form"
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Company name</label>
                <input
                  className="input bg-slate-50"
                  value={p.company_name || ""}
                  disabled
                />
              </div>
              <div>
                <label className="text-sm">Contact name</label>
                <input
                  className="input bg-slate-50"
                  value={p.contact_name || ""}
                  disabled
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Email</label>
                <input
                  className="input bg-slate-50"
                  value={p.email || ""}
                  disabled
                />
              </div>
              <div>
                <label className="text-sm" htmlFor="phone">
                  Phone
                </label>
                <input
                  id="phone"
                  className="input"
                  value={p.phone || ""}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="020…"
                  data-testid="input-phone"
                />
              </div>
            </div>

            <div>
              <label className="text-sm" htmlFor="trades">
                Trades (comma separated)
              </label>
              <input
                id="trades"
                className="input"
                value={p.trade_types || ""}
                onChange={(e) => set("trade_types", e.target.value)}
                placeholder="plumber, electrician"
                data-testid="input-trades"
              />
            </div>

            <div>
              <label className="text-sm" htmlFor="areas">
                Service areas (comma separated)
              </label>
              <input
                id="areas"
                className="input"
                value={p.service_areas || ""}
                onChange={(e) => set("service_areas", e.target.value)}
                placeholder="E4, E17, Chingford"
                data-testid="input-areas"
              />
            </div>

            {err && (
              <p
                className="text-sm text-red-600"
                role="alert"
                data-testid="profile-error"
              >
                {err}
              </p>
            )}
            {ok && (
              <p
                className="text-sm text-emerald-700"
                role="status"
                data-testid="profile-ok"
              >
                {ok}
              </p>
            )}

            <div className="flex gap-2">
              <button
                className="btn"
                disabled={busy}
                data-testid="btn-save-profile"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => router.push("/tradesman/projects")}
              >
                Back to jobs
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
