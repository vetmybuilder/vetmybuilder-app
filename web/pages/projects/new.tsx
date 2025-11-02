// web/pages/projects/new.tsx
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Select from "@/components/forms/Select";
import { PROJECT_TYPES, type ProjectTypeCategory } from "@/types/projectTypes";
import LocationField from "@/components/forms/LocationField";
import BedroomsSelect from "@/components/forms/BedroomsSelect";
import DescriptionBuilder from "@/components/forms/DescriptionBuilder";

/* ===== Constants & helpers ===== */

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

const LONDON_LOCATIONS = [
  "E4",
  "E17",
  "Walthamstow",
  "Chingford",
  "Hackney",
  "Enfield",
  "Islington",
  "Waltham Forest",
  "London",
];

const UK_POSTCODE_HINT =
  /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})$/i;

function normalize(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function locationSuggestions(query: string): string[] {
  const q = query.toLowerCase();
  return LONDON_LOCATIONS.filter((s) => s.toLowerCase().includes(q));
}

function buildAutoNameSimple(
  primaryType: string,
  location: string,
  propertyType?: string
) {
  const loc = (location || "").trim();
  const prop = (propertyType || "").trim();
  if (loc && prop) return `${primaryType} in ${loc} (${prop})`;
  if (loc) return `${primaryType} in ${loc}`;
  return primaryType;
}

/* ===== Types ===== */
type FormShape = {
  category: string | null; // selected high-level category
  selectedTypes: string[]; // chosen sub-categories (multi)
  otherEnabled: boolean;
  otherText: string;

  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;
};

export default function NewProject() {
  const api = useApi();
  const router = useRouter();

  const [form, setForm] = useState<FormShape>({
    category: null,
    selectedTypes: [],
    otherEnabled: false,
    otherText: "",

    location: "",
    description: "",
    propertyType: "",
    bedrooms: 0,
  });
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Derived, memoized data
  const CATEGORY_OPTIONS = useMemo(
    () =>
      [...PROJECT_TYPES]
        .map((c) => c.category)
        .sort((a, b) => a.localeCompare(b)),
    []
  );

  const SUBTYPE_OPTIONS = useMemo(() => {
    if (!form.category) return [] as string[];
    const bucket = PROJECT_TYPES.find(
      (c: ProjectTypeCategory) => c.category === form.category
    );
    if (!bucket) return [] as string[];
    return [...bucket.types].sort((a, b) => a.localeCompare(b));
  }, [form.category]);

  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const STEPS = useMemo(
    () =>
      [
        { key: "category", title: "Category" as const },
        { key: "subtypes", title: "Type of work" as const },
        { key: "location", title: "Location" as const },
        { key: "propertyType", title: "Property type" as const },
        { key: "bedrooms", title: "Bedrooms" as const },
        { key: "description", title: "Brief description" as const },
        { key: "review", title: "Review & create" as const },
      ] as const,
    []
  );
  type StepKey = (typeof STEPS)[number]["key"];
  const maxStep = STEPS.length - 1;

  function hasAnySubtype() {
    const picked = form.selectedTypes.length > 0;
    const otherOk = form.otherEnabled && form.otherText.trim().length >= 2;
    return picked || otherOk;
  }

  function isStepValid(idx: number): boolean {
    const k = STEPS[idx].key as StepKey;
    if (k === "review") {
      return (
        !!form.category &&
        hasAnySubtype() &&
        !!form.location.trim() &&
        !!form.propertyType.trim() &&
        Number(form.bedrooms) >= 0 &&
        String(form.description).trim().length >= 2
      );
    }
    switch (k) {
      case "category":
        return !!form.category;
      case "subtypes":
        return hasAnySubtype();
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
      // Primary type = first checked, else "Other" text
      const primaryType =
        form.selectedTypes[0] || normalize(form.otherText || "General work");

      // If multiple types, append the rest into the description to preserve user intent
      const extras = form.selectedTypes.slice(1);
      const descExtras =
        extras.length > 0
          ? `\n\nAdditional work types: ${extras.join(", ")}${
              form.otherEnabled && form.otherText.trim()
                ? `, ${normalize(form.otherText)}`
                : ""
            }`
          : form.otherEnabled && form.otherText.trim()
          ? `\n\nAdditional work types: ${normalize(form.otherText)}`
          : "";

      const autoName = buildAutoNameSimple(
        primaryType,
        form.location,
        form.propertyType
      );

      const payload = {
        name: autoName,
        type: primaryType, // DB expects a string; using the primary
        location: form.location,
        description: normalize((form.description || "") + descExtras),
        propertyType: form.propertyType,
        bedrooms: Number(form.bedrooms) || 0,
      };

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

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (step < maxStep) next();
    }
  };

  const ids = useMemo(
    () => ({
      category: "np-category",
      subtypes: "np-subtypes",
      location: "np-location",
      propertyType: "np-property",
      bedrooms: "np-beds",
      description: "np-desc",
    }),
    []
  );

  const postcodeLooksValid =
    !form.location || UK_POSTCODE_HINT.test(form.location.trim());

  const primaryPreview =
    form.selectedTypes[0] || (form.otherEnabled ? form.otherText.trim() : "");
  const reviewAutoName = buildAutoNameSimple(
    primaryPreview || "Project",
    form.location,
    form.propertyType
  );

  // Toggle a sub-type in the checklist (case-insensitive)
  function toggleSubtype(label: string) {
    setForm((prev) => {
      const exists = prev.selectedTypes.some(
        (t) => t.toLowerCase() === label.toLowerCase()
      );
      const next = exists
        ? prev.selectedTypes.filter(
            (t) => t.toLowerCase() !== label.toLowerCase()
          )
        : [...prev.selectedTypes, label];
      return { ...prev, selectedTypes: next };
    });
  }

  return (
    <AuthedOnly>
      <div
        className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"
        data-testid="create-project-page"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              data-testid="create-project-title"
            >
              Create Project
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Choose a category, tick the work you need, and add a few details.
            </p>
          </div>
          <Link
            href="/projects"
            aria-label="Back to my projects"
            title="Back to my projects"
            className="btn-back"
            data-testid="btn-back-to-projects"
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

        {/* Progress */}
        <div
          className="mb-6 flex items-center gap-2"
          aria-label="Progress"
          data-testid="wizard-progress"
        >
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition ${
                i <= step ? "bg-blue-600" : "bg-gray-200"
              }`}
              aria-current={i === step ? "step" : undefined}
            />
          ))}
        </div>

        {/* Wizard */}
        <div
          className="relative w-full overflow-hidden rounded-2xl bg-white border border-gray-200"
          data-testid="wizard"
          data-current-step={STEPS[step].key}
        >
          <div
            className="flex w-full transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${step * 100}%)` }}
          >
            {STEPS.map((s, i) => {
              const active = i === step;
              const titleId = `step-${s.key}-title`;
              return (
                <section
                  key={s.key}
                  role="region"
                  aria-labelledby={titleId}
                  aria-hidden={active ? undefined : true}
                  className="w-full shrink-0 px-6 py-6 sm:px-10 sm:py-10"
                >
                  <h2 id={titleId} className="text-lg font-semibold">
                    {s.title}
                  </h2>

                  <div className="mt-5 grid max-w-3xl gap-4">
                    {/* Category */}
                    {s.key === "category" && (
                      <Select
                        id={ids.category}
                        label="Category"
                        placeholder="Select a category"
                        value={form.category}
                        onChange={(v) => {
                          set("category", v);
                          // Reset subtypes when category changes
                          set("selectedTypes", []);
                          set("otherEnabled", false);
                          set("otherText", "");
                        }}
                        options={CATEGORY_OPTIONS}
                        data-testid="field-category"
                      />
                    )}

                    {/* Subtypes checklist */}
                    {s.key === "subtypes" && (
                      <div>
                        {!form.category ? (
                          <p className="text-sm text-slate-500">
                            Pick a category first.
                          </p>
                        ) : SUBTYPE_OPTIONS.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No sub-types available for this category.
                          </p>
                        ) : (
                          <>
                            <div className="text-xs text-slate-500 mb-1">
                              Select all that apply
                            </div>
                            <div
                              id={ids.subtypes}
                              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                              data-testid="field-subtypes"
                            >
                              {SUBTYPE_OPTIONS.map((t) => {
                                const checked = form.selectedTypes.some(
                                  (x) => x.toLowerCase() === t.toLowerCase()
                                );
                                return (
                                  <label
                                    key={t}
                                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition ${
                                      checked
                                        ? "border-indigo-300 bg-indigo-50"
                                        : "border-slate-200 hover:bg-slate-50"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="checkbox"
                                      checked={checked}
                                      onChange={() => toggleSubtype(t)}
                                    />
                                    <span className="text-sm">{t}</span>
                                  </label>
                                );
                              })}
                            </div>

                            {/* Other… */}
                            <div className="mt-3 rounded-xl border border-slate-200 p-3">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="checkbox"
                                  checked={form.otherEnabled}
                                  onChange={(e) =>
                                    set("otherEnabled", e.target.checked)
                                  }
                                  data-testid="chk-other"
                                />
                                <span className="text-sm">Other…</span>
                              </label>
                              {form.otherEnabled && (
                                <input
                                  className="input mt-2"
                                  placeholder="Describe another type of work"
                                  value={form.otherText}
                                  onChange={(e) =>
                                    set("otherText", e.target.value)
                                  }
                                  onKeyDown={handleEnter}
                                  data-testid="input-other"
                                />
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Location */}
                    {s.key === "location" && (
                      <LocationField
                        id={ids.location}
                        label="Location"
                        value={form.location}
                        onChange={(v /*, meta*/) => {
                          set("location", v.toUpperCase());
                        }}
                        dataTestId="field-location"
                      />
                    )}

                    {/* Property type */}
                    {s.key === "propertyType" && (
                      <Select
                        id={ids.propertyType}
                        label="Property type"
                        placeholder="Select property type"
                        value={form.propertyType || null}
                        onChange={(v) => set("propertyType", v)}
                        options={Array.from(PROPERTY_TYPES)}
                        data-testid="field-property"
                      />
                    )}

                    {/* Bedrooms */}
                    {s.key === "bedrooms" && (
                      <BedroomsSelect
                        id={ids.bedrooms}
                        value={Number(form.bedrooms) || 0}
                        onChange={(n) => set("bedrooms", n)}
                        data-testid="field-bedrooms"
                      />
                    )}

                    {/* Description — now using DescriptionBuilder */}
                    {s.key === "description" && (
                      <DescriptionBuilder
                        value={form.description}
                        onChange={(next) => set("description", next)}
                        className="mt-1"
                      />
                    )}

                    {/* Review */}
                    {s.key === "review" && (
                      <div className="space-y-3 text-sm" data-testid="review">
                        <ReviewRow
                          label="Project name (auto)"
                          value={reviewAutoName}
                          dataTestId="review-name"
                        />
                        <ReviewRow
                          label="Category"
                          value={form.category || "—"}
                          dataTestId="review-category"
                        />
                        <ReviewRow
                          label="Type(s) of work"
                          value={
                            [
                              ...form.selectedTypes,
                              ...(form.otherEnabled && form.otherText.trim()
                                ? [normalize(form.otherText)]
                                : []),
                            ].join(", ") || "—"
                          }
                          dataTestId="review-types"
                        />
                        <ReviewRow
                          label="Location"
                          value={form.location}
                          dataTestId="review-location"
                        />
                        <ReviewRow
                          label="Property type"
                          value={form.propertyType}
                          dataTestId="review-property"
                        />
                        <ReviewRow
                          label="Bedrooms"
                          value={String(form.bedrooms || 0)}
                          dataTestId="review-bedrooms"
                        />
                        <ReviewRow
                          label="Description"
                          value={form.description}
                          multiline
                          dataTestId="review-description"
                        />
                      </div>
                    )}
                  </div>

                  {err && (
                    <p
                      className="mt-3 text-sm text-red-600"
                      role="alert"
                      data-testid="create-error"
                    >
                      {err}
                    </p>
                  )}

                  <div className="mt-8 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={back}
                      disabled={step === 0 || busy}
                      className="btn-outline disabled:opacity-50"
                      aria-label="Back"
                      data-testid="wizard-back"
                    >
                      Back
                    </button>

                    {step < maxStep ? (
                      <button
                        type="button"
                        onClick={next}
                        disabled={!isStepValid(step) || busy}
                        className="btn disabled:opacity-50"
                        aria-label={`Next: ${s.title}`}
                        data-testid="wizard-next"
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onCreate}
                        disabled={!isStepValid(step) || busy}
                        className="btn disabled:opacity-50"
                        aria-label="Create Project"
                        data-testid="wizard-create"
                      >
                        {busy ? "Creating..." : "Create Project"}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
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
  dataTestId,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  dataTestId: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      {multiline ? (
        <p
          className="mt-1 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-900"
          data-testid={dataTestId}
        >
          {value || "—"}
        </p>
      ) : (
        <div
          className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900"
          data-testid={dataTestId}
        >
          {value || "—"}
        </div>
      )}
    </div>
  );
}
