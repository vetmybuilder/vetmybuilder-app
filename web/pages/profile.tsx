import Layout from "@/components/Layout";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useEffect, useState } from "react";

export default function Profile() {
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/profile");
        setLocation(data?.profile?.locationRaw || "");
      } catch {}
      setLoading(false);
    })();
  }, [api]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await api.post("/api/profile", { location });
      setMsg("Saved ✓");
    } catch (e: any) {
      setMsg(e?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <AuthedOnly>
        <div className="max-w-xl card">
          <h1 className="text-xl font-semibold mb-3">Your Location</h1>
          <p className="text-sm text-zinc-400 mb-4">
            Enter a UK postcode (e.g. <code>E4 6JH</code>) or a city/borough
            (e.g. <code>Chingford</code>). Notifications for live projects will
            target users in the same area.
          </p>
          {loading ? (
            <p>Loading…</p>
          ) : (
            <form onSubmit={save} className="space-y-3">
              <input
                className="input"
                placeholder="Postcode or city/borough"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <button className="btn" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              {msg && <p className="text-sm mt-1">{msg}</p>}
            </form>
          )}
        </div>
      </AuthedOnly>
    </Layout>
  );
}
