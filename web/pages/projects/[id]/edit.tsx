import Layout from "@/components/Layout";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

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
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        const p = data.project;
        setForm({
          name: p.name,
          type: p.type,
          location: p.location,
          description: p.description,
          propertyType: p.propertyType,
          bedrooms: p.bedrooms,
        });
      } catch (e: any) {
        setErr(e?.response?.data?.error || "Failed to load");
      }
    })();
  }, [id, api]);

  const set = (k: string, v: any) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload = { ...form, bedrooms: Number(form.bedrooms) || 0 };
      const { data } = await api.put(`/api/projects/${id}`, payload);
      router.replace(`/projects/${data.project.id}`);
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <AuthedOnly>
        <div className="card max-w-2xl">
          <h1 className="text-xl font-semibold mb-4">Edit Project</h1>
          <form onSubmit={submit} className="grid grid-cols-1 gap-3">
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
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <div className="flex gap-2">
              <button className="btn" disabled={busy}>
                {busy ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      </AuthedOnly>
    </Layout>
  );
}
