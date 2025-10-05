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

  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  >(null);

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (step < maxStep) next();
    }
  };

  // accessible ids (stable across renders)
  const ids = useMemo(
    () => ({
      name: "np-name",
      type: "np-type",
      location: "np-location",
      propertyType: "np-property",
      bedrooms: "np-beds",
      description: "np-desc",
    }),
    []
  );

  return (
    <AuthedOnly>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Create Project
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Tell us about the work you need and we’ll get the ball rolling.
            </p>
          </div>
          <Link
            href="/projects"
            aria-label="Back to my projects"
            title="Back to my projects"
            className="btn-back"
          >
            <svg
              viewBox="0 0 24 24"
              className="icon-24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 19l-7-7 7-7" />
              <path d="M3 12h18" />
            </svg>
            <span className="sr-only">Back to my projects</span>
          </Link>
        </div>

        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition ${
                i <= step ? "bg-blue-600" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        <div className="relative w-full overflow-hidden rounded-2xl bg-white border border-gray-200">
          <div
            className="flex w-full transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${step * 100}%)` }}
          >
            {STEPS.map((s) => (
              <section
                key={s.key}
                className="w-full shrink-0 px-6 py-6 sm:px-10 sm:py-10"
              >
                <h2 className="text-lg font-semibold">{s.title}</h2>
                {"hint" in s && s.hint && (
                  <p className="mt-1 text-sm text-gray-500">{s.hint}</p>
                )}

                <div className="mt-5 grid max-w-3xl gap-4">
                  {s.key === "name" && (
                    <>
                      <label htmlFor={ids.name} className="sr-only">
                        Project name
                      </label>
                      <input
                        id={ids.name}
                        ref={inputRef as any}
                        className="input"
                        placeholder="Project name"
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        onKeyDown={handleEnter}
                      />
                    </>
                  )}

                  {s.key === "type" && (
                    <>
                      <label htmlFor={ids.type} className="sr-only">
                        Type of work
                      </label>
                      <input
                        id={ids.type}
                        ref={inputRef as any}
                        className="input"
                        placeholder="Type (e.g., Kitchen remodel)"
                        value={form.type}
                        onChange={(e) => set("type", e.target.value)}
                        onKeyDown={handleEnter}
                      />
                    </>
                  )}

                  {s.key === "location" && (
                    <>
                      <label htmlFor={ids.location} className="sr-only">
                        Location
                      </label>
                      <input
                        id={ids.location}
                        ref={inputRef as any}
                        className="input"
                        placeholder="Location (postcode, borough, city)"
                        value={form.location}
                        onChange={(e) => set("location", e.target.value)}
                        onKeyDown={handleEnter}
                      />
                    </>
                  )}

                  {s.key === "propertyType" && (
                    <>
                      <label htmlFor={ids.propertyType} className="sr-only">
                        Property type
                      </label>
                      <select
                        id={ids.propertyType}
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
                    </>
                  )}

                  {s.key === "bedrooms" && (
                    <>
                      <label htmlFor={ids.bedrooms} className="sr-only">
                        Bedrooms
                      </label>
                      <input
                        id={ids.bedrooms}
                        ref={inputRef as any}
                        className="input"
                        placeholder="Bedrooms"
                        type="number"
                        min={0}
                        value={form.bedrooms}
                        onChange={(e) => set("bedrooms", e.target.value)}
                        onKeyDown={handleEnter}
                      />
                    </>
                  )}

                  {s.key === "description" && (
                    <>
                      <label htmlFor={ids.description} className="sr-only">
                        Description
                      </label>
                      <textarea
                        id={ids.description}
                        ref={inputRef as any}
                        className="input min-h-36"
                        placeholder="Brief description of the work"
                        value={form.description}
                        onChange={(e) => set("description", e.target.value)}
                        onKeyDown={handleEnter}
                      />
                    </>
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

                {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

                <div className="mt-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={back}
                    disabled={step === 0 || busy}
                    className="btn-outline disabled:opacity-50"
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
              </section>
            ))}
          </div>
        </div>
      </div>
    </AuthedOnly>
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
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      {multiline ? (
        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-900">
          {value || "—"}
        </p>
      ) : (
        <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900">
          {value || "—"}
        </div>
      )}
    </div>
  );
}
