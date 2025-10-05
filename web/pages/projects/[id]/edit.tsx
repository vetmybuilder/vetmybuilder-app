import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/utils/auth";

const PROPERTY_TYPES = [
  "Detached",
  "Semi-Detached",
  "Terraced",
  "End of Terrace",
  "Flat",
  "Bungalow",
  "Cottage",
  "Maisonette",
  "Townhouse",
  "Other",
] as const;

export default function EditProject() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { id } = router.query;

  const [form, setForm] = useState({
    name: "",
    type: "",
    location: "",
    description: "",
    propertyType: "",
    bedrooms: 0,
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Load project ONLY when router is ready AND auth is ready AND we have a user
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;

    let alive = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        if (!alive) return;
        const p = data.project;
        setForm({
          name: p.name ?? "",
          type: p.type ?? "",
          location: p.location ?? "",
          description: p.description ?? "",
          propertyType: p.propertyType ?? "",
          bedrooms: Number(p.bedrooms ?? 0),
        });
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status;
        const message =
          e?.data?.error || e?.response?.data?.error || e?.message || "";
        if (status === 401 || /bearer token/i.test(String(message))) {
          setErr("You need to sign in again to edit this project.");
        } else {
          setErr("Failed to load project");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user]);

  const set = (k: string, v: any) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return; // extra guard
    setBusy(true);
    setErr(null);
    try {
      const payload = { ...form, bedrooms: Number(form.bedrooms) || 0 };
      const { data } = await api.put(`/api/projects/${id}`, payload);
      router.replace(`/projects/${data.project.id}`);
    } catch (e: any) {
      const message =
        e?.response?.data?.error ||
        e?.data?.error ||
        e?.message ||
        "Failed to update";
      setErr(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthedOnly>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Header band */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur px-6 py-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Edit Project
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Update the details and save your changes.
              </p>
            </div>
            <Link href={`/projects/${id}`} className="btn-outline">
              Back
            </Link>
          </div>
        </div>

        {authLoading || loading ? (
          <div className="card">
            <p className="text-sm text-slate-500">Loading…</p>
          </div>
        ) : err ? (
          <div className="card">
            <p className="text-red-600">{err}</p>
            <Link href="/login" className="btn mt-3">
              Go to sign in
            </Link>
          </div>
        ) : (
          <div className="card">
            <form onSubmit={submit} className="grid grid-cols-1 gap-3 max-w-xl">
              <input
                className="input"
                placeholder="Name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
              <input
                className="input"
                placeholder="Type"
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
                required
              />
              <input
                className="input"
                placeholder="Location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                required
              />
              <select
                className="input"
                value={form.propertyType}
                onChange={(e) => set("propertyType", e.target.value)}
                required
              >
                <option value="" disabled>
                  Select property type
                </option>
                {PROPERTY_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Bedrooms"
                type="number"
                min={0}
                value={form.bedrooms}
                onChange={(e) => set("bedrooms", e.target.value)}
                required
              />
              <textarea
                className="input min-h-32"
                placeholder="Description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                required
              />
              {err && <p className="text-red-600 text-sm">{err}</p>}
              <div className="flex gap-2">
                <button className="btn" disabled={busy}>
                  {busy ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AuthedOnly>
  );
}
