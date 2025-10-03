import Layout from "@/components/Layout";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useMemo, useRef, useState } from "react";
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

type FormShape = {
  name: string;
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number | string;
};

export default function NewProject() {
  const api = useApi();
  const router = useRouter();

  const [form, setForm] = useState<FormShape>({
    name: "",
    type: "",
    location: "",
    description: "",
    propertyType: "",
    bedrooms: 0,
  });
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof FormShape, v: any) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const STEPS = useMemo(
    () =>
      [
        {
          key: "name",
          title: "Project name",
          hint: "e.g. Bathroom refit, Loft conversion",
        },
        {
          key: "type",
          title: "Type of work",
          hint: "e.g. Kitchen remodel, Extension, Boiler install",
        },
        {
          key: "location",
          title: "Location",
          hint: "Postcode, borough, or city (e.g. E4, Walthamstow)",
        },
        { key: "propertyType", title: "Property type" },
        { key: "bedrooms", title: "Bedrooms" },
        {
          key: "description",
          title: "Brief description",
          hint: "Add helpful details: scope, timing, budget ballpark, etc.",
        },
        { key: "review", title: "Review & create" },
      ] as const,
    []
  );
  type StepKey = (typeof STEPS)[number]["key"];
  const maxStep = STEPS.length - 1;

  function isStepValid(idx: number): boolean {
    const k = STEPS[idx].key as StepKey;
    if (k === "review") {
      return (
        !!form.name.trim() &&
        !!form.type.trim() &&
        !!form.location.trim() &&
        !!form.propertyType.trim() &&
        Number(form.bedrooms) >= 0 &&
        String(form.description).trim().length >= 2
      );
    }
    switch (k) {
      case "name":
      case "type":
      case "location":
      case "propertyType":
        return !!String(form[k]).trim();
      case "bedrooms":
        return String(form.bedrooms) !== "" && Number(form.bedrooms) >= 0;
      case "description":
        return String(form.description).trim().length >= 2;
      default:
        return true;
    }
  }

  async function onCreate() {
    if (!isStepValid(maxStep)) return;
    setBusy(true);
    setErr(null);
    try {
      const payload = { ...form, bedrooms: Number(form.bedrooms) || 0 };
      const { data } = await api.post("/api/projects", payload);
      router.replace(`/projects/${data.project.id}`);
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  // advance/back helpers
  const next = () => {
    if (step < maxStep && isStepValid(step)) {
      setErr(null);
      setStep((s) => s + 1);
    }
  };
  const back = () => {
    setErr(null);
    setStep((s) => Math.max(0, s - 1));
  };

  // one ref so we can focus the active input if desired later
  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  >(null);

  // unify Enter behavior: advance exactly one step; never “submit” until review
  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (step < maxStep) next();
    }
  };

  return (
    <Layout>
      <AuthedOnly>
        <div className="mx-auto max-w-3xl">
          {/* Header row */}
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Create Project</h1>
            <Link
              href="/projects"
              className="inline-flex items-center rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              ← Back to projects
            </Link>
          </div>

          {/* Progress */}
          <div className="mb-5 flex items-center justify-center gap-2">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-8 rounded-full transition ${
                  i <= step ? "bg-indigo-500" : "bg-zinc-800"
                }`}
              />
            ))}
          </div>

          {/* Slider viewport */}
          <div className="relative w-full overflow-hidden rounded-2xl">
            {/* The sliding track */}
            <div
              className="flex w-full transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${step * 100}%)` }}
            >
              {STEPS.map((s, idx) => (
                <section key={s.key} className="w-full shrink-0 px-0">
                  <div className="card mx-auto max-w-xl">
                    <h2 className="text-lg font-semibold">{s.title}</h2>
                    {"hint" in s && s.hint && (
                      <p className="mt-1 text-sm text-zinc-400">{s.hint}</p>
                    )}

                    {/* Fields */}
                    <div className="mt-4 space-y-3">
                      {s.key === "name" && (
                        <input
                          ref={inputRef as any}
                          className="input"
                          placeholder="Project name"
                          value={form.name}
                          onChange={(e) => set("name", e.target.value)}
                          onKeyDown={handleEnter}
                        />
                      )}

                      {s.key === "type" && (
                        <input
                          ref={inputRef as any}
                          className="input"
                          placeholder="Type (e.g., Kitchen remodel)"
                          value={form.type}
                          onChange={(e) => set("type", e.target.value)}
                          onKeyDown={handleEnter}
                        />
                      )}

                      {s.key === "location" && (
                        <input
                          ref={inputRef as any}
                          className="input"
                          placeholder="Location (postcode, borough, city)"
                          value={form.location}
                          onChange={(e) => set("location", e.target.value)}
                          onKeyDown={handleEnter}
                        />
                      )}

                      {s.key === "propertyType" && (
                        <select
                          ref={inputRef as any}
                          className="input"
                          value={form.propertyType}
                          onChange={(e) => set("propertyType", e.target.value)}
                          onKeyDown={handleEnter}
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
                      )}

                      {s.key === "bedrooms" && (
                        <input
                          ref={inputRef as any}
                          className="input"
                          placeholder="Bedrooms"
                          type="number"
                          min={0}
                          value={form.bedrooms}
                          onChange={(e) => set("bedrooms", e.target.value)}
                          onKeyDown={handleEnter}
                        />
                      )}

                      {s.key === "description" && (
                        <textarea
                          ref={inputRef as any}
                          className="input min-h-32"
                          placeholder="Brief description of the work"
                          value={form.description}
                          onChange={(e) => set("description", e.target.value)}
                          onKeyDown={handleEnter}
                        />
                      )}

                      {s.key === "review" && (
                        <div className="space-y-3 text-sm">
                          <ReviewRow label="Project name" value={form.name} />
                          <ReviewRow label="Type of work" value={form.type} />
                          <ReviewRow label="Location" value={form.location} />
                          <ReviewRow
                            label="Property type"
                            value={form.propertyType}
                          />
                          <ReviewRow
                            label="Bedrooms"
                            value={String(form.bedrooms || 0)}
                          />
                          <ReviewRow
                            label="Description"
                            value={form.description}
                            multiline
                          />
                        </div>
                      )}
                    </div>

                    {err && <p className="mt-2 text-sm text-red-400">{err}</p>}

                    {/* Actions */}
                    <div className="mt-6 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={back}
                        disabled={step === 0 || busy}
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        Back
                      </button>

                      {step < maxStep ? (
                        <button
                          type="button"
                          onClick={next}
                          disabled={!isStepValid(step) || busy}
                          className="btn disabled:opacity-50"
                        >
                          Next
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onCreate}
                          disabled={!isStepValid(step) || busy}
                          className="btn disabled:opacity-50"
                        >
                          {busy ? "Creating..." : "Create Project"}
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </AuthedOnly>
    </Layout>
  );
}

function ReviewRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      {multiline ? (
        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-zinc-200">
          {value || "—"}
        </p>
      ) : (
        <div className="mt-1 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-zinc-200">
          {value || "—"}
        </div>
      )}
    </div>
  );
}
