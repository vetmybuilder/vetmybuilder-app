import Layout from "@/components/Layout";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

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

export default function NewProject() {
  const api = useApi();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    type: "",
    location: "",
    description: "",
    propertyType: "",
    bedrooms: 0,
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: any) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload = { ...form, bedrooms: Number(form.bedrooms) || 0 };
      const { data } = await api.post("/api/projects", payload);
      // keep your existing behavior: go to the newly created project
      router.replace(`/projects/${data.project.id}`);
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to create");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <AuthedOnly>
        <div className="mx-auto max-w-2xl">
          {/* Header row with quick way back */}
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Create Project</h1>
            <Link
              href="/projects"
              className="inline-flex items-center rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              ← Back to projects
            </Link>
          </div>

          <form onSubmit={submit} className="card grid grid-cols-1 gap-3">
            <input
              className="input"
              placeholder="Name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Type (e.g., Kitchen Remodel)"
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Location (postcode, borough, city)"
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

            <div className="mt-2 flex flex-wrap gap-3">
              <button className="btn disabled:opacity-50" disabled={busy}>
                {busy ? "Saving..." : "Save Project"}
              </button>
            </div>
          </form>
        </div>
      </AuthedOnly>
    </Layout>
  );
}
