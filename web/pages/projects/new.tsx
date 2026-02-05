import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Select from "@/components/forms/Select";
import { PROJECT_TYPES, type ProjectTypeCategory } from "@/types/projectTypes";
import LocationField from "@/components/forms/LocationField";
import BedroomsSelect from "@/components/forms/BedroomsSelect";
import DescriptionBuilder from "@/components/forms/DescriptionBuilder";
import SearchableSelect from "@/components/forms/SearchableSelect";
import ProgressBar from "@/components/ProgressBar";

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

function normalize(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function buildAutoNameSimple(
  primaryType: string,
  location: string,
  propertyType?: string,
) {
  const loc = (location || "").trim();
  const prop = (propertyType || "").trim();
  if (loc && prop) return `${primaryType} in ${loc} (${prop})`;
  if (loc) return `${primaryType} in ${loc}`;
  return primaryType;
}

/* ===== Types ===== */
type FormShape = {
  category: string | null;
  selectedTypes: string[];
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

  // Scroll target (just above the card, under header)
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

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

  /* ===== Scroll to top *after* step content is rendered ===== */
  useEffect(() => {
    if (!shouldScrollRef.current) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });

    shouldScrollRef.current = false;
  }, [step]);

  /* ===== Derived lists ===== */

  const CATEGORY_OPTIONS = useMemo(
    () =>
      [...PROJECT_TYPES]
        .map((c) => c.category)
        .sort((a, b) => a.localeCompare(b)),
    [],
  );

  const SUBTYPE_OPTIONS = useMemo(() => {
    if (!form.category) return [];
    const bucket = PROJECT_TYPES.find(
      (c: ProjectTypeCategory) => c.category === form.category,
    );
    return bucket ? [...bucket.types].sort((a, b) => a.localeCompare(b)) : [];
  }, [form.category]);

  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  /* ===== Steps ===== */

  const STEPS = [
    { key: "category", title: "Choose category" },
    { key: "subtypes", title: "Type of work" },
    { key: "location", title: "Location" },
    { key: "propertyType", title: "Property type" },
    { key: "bedrooms", title: "Bedrooms" },
    { key: "description", title: "Brief description" },
    { key: "review", title: "Review & create" },
  ] as const;

  const maxStep = STEPS.length - 1;

  function hasAnySubtype() {
    const picked = form.selectedTypes.length > 0;
    const otherOk = form.otherEnabled && form.otherText.trim().length >= 2;
    return picked || otherOk;
  }

  function isStepValid(idx: number): boolean {
    const key = STEPS[idx].key;
    switch (key) {
      case "category":
        return !!form.category;
      case "subtypes":
        return hasAnySubtype();
      case "location":
      case "propertyType":
        return !!String(form[key]).trim();
      case "bedrooms":
        return Number(form.bedrooms) >= 0;
      case "description":
        return form.description.trim().length >= 2;
      case "review":
        return (
          !!form.category &&
          hasAnySubtype() &&
          !!form.location.trim() &&
          !!form.propertyType.trim() &&
          String(form.description).trim().length >= 2
        );
      default:
        return true;
    }
  }

  /* ===== Navigation helpers ===== */

  const autoNext = (force = false) => {
    // For auto-advance (e.g. category), allow a forced move so we don't rely on
    // state having updated synchronously.
    if (step < maxStep && (force || isStepValid(step))) {
      shouldScrollRef.current = true;
      setStep((s) => s + 1);
    }
  };

  const next = () => {
    if (step < maxStep && isStepValid(step)) {
      shouldScrollRef.current = true;
      setErr(null);
      setStep((s) => s + 1);
    }
  };

  const back = () => {
    if (step === 0) return;
    shouldScrollRef.current = true;
    setErr(null);
    setStep((s) => Math.max(0, s - 1));
  };

  /* ===== Submit ===== */

  async function onCreate() {
    if (!isStepValid(maxStep)) return;
    setBusy(true);
    setErr(null);

    try {
      const primaryType =
        form.selectedTypes[0] || normalize(form.otherText || "General work");

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
        form.propertyType,
      );

      const payload = {
        name: autoName,
        type: primaryType,
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

  /* ===== Toggle subtype ===== */

  function toggleSubtype(label: string) {
    setForm((prev) => {
      const exists = prev.selectedTypes.some(
        (t) => t.toLowerCase() === label.toLowerCase(),
      );
      const next = exists
        ? prev.selectedTypes.filter(
            (t) => t.toLowerCase() !== label.toLowerCase(),
          )
        : [...prev.selectedTypes, label];

      return { ...prev, selectedTypes: next };
    });
  }

  /* ===== IDs & preview ===== */

  const ids = {
    category: "np-category",
    subtypes: "np-subtypes",
    location: "np-location",
    propertyType: "np-property",
    bedrooms: "np-beds",
    description: "np-desc",
  };

  const primaryPreview =
    form.selectedTypes[0] || (form.otherEnabled ? form.otherText.trim() : "");

  const reviewAutoName = buildAutoNameSimple(
    primaryPreview || "Project",
    form.location,
    form.propertyType,
  );

  /* ===== Render ===== */

  return (
    <AuthedOnly>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Create Project
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Choose a category, tick the work you need, and add a few details.
            </p>
          </div>

          {/* Back to projects */}
          <button
            type="button"
            onClick={() => router.push("/projects")}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            data-testid="btn-back-to-projects"
          >
            <span className="text-lg">←</span>
            Back
          </button>
        </div>

        {/* Progress Bar (scroll target) */}
        <div ref={scrollRef}>
          <ProgressBar current={step} total={STEPS.length} />
        </div>

        {/* Wizard */}
        <div className="mt-4 relative w-full overflow-hidden rounded-2xl bg-white border border-gray-200">
          <div
            className="flex w-full transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${step * 100}%)` }}
          >
            {STEPS.map((s, idx) => {
              const titleId = `step-${s.key}-title`;

              return (
                <section
                  key={s.key}
                  role="region"
                  aria-labelledby={titleId}
                  className="w-full shrink-0 px-6 py-6 sm:px-10 sm:py-10"
                >
                  <h2 id={titleId} className="text-lg font-semibold">
                    {s.title}
                  </h2>

                  <div className="mt-5 grid max-w-3xl gap-4">
                    {/* Category */}
                    {s.key === "category" && (
                      <SearchableSelect
                        id={ids.category}
                        label="Category"
                        placeholder="Select category"
                        value={form.category}
                        onChange={(v) => {
                          set("category", v);
                          set("selectedTypes", []);
                          set("otherEnabled", false);
                          set("otherText", "");
                          if (v && v.trim().length > 0) autoNext(true);
                        }}
                        options={CATEGORY_OPTIONS}
                        dataTestId="field-category"
                        mode="select"
                      />
                    )}

                    {/* Subtypes */}
                    {s.key === "subtypes" && (
                      <div>
                        {!form.category ? (
                          <p className="text-sm text-slate-500">
                            Pick a category first.
                          </p>
                        ) : (
                          <>
                            <div className="text-xs text-slate-500 mb-1">
                              Select all that apply
                            </div>

                            <div
                              id={ids.subtypes}
                              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                            >
                              {SUBTYPE_OPTIONS.map((t) => {
                                const checked = form.selectedTypes.some(
                                  (x) => x.toLowerCase() === t.toLowerCase(),
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
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        toggleSubtype(t);
                                      }}
                                    />
                                    <span className="text-sm">{t}</span>
                                  </label>
                                );
                              })}
                            </div>

                            {/* Other */}
                            <div className="mt-3 rounded-xl border border-slate-200 p-3">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="checkbox"
                                  checked={form.otherEnabled}
                                  onChange={(e) =>
                                    set("otherEnabled", e.target.checked)
                                  }
                                />
                                <span className="text-sm">Other…</span>
                              </label>

                              {form.otherEnabled && (
                                <input
                                  className="input mt-2"
                                  placeholder="Describe another type of work"
                                  value={form.otherText}
                                  onChange={(e) => {
                                    set("otherText", e.target.value);
                                  }}
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
                        onChange={(v) => {
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
                        onChange={(v) => {
                          set("propertyType", v);
                        }}
                        options={Array.from(PROPERTY_TYPES)}
                      />
                    )}

                    {/* Bedrooms */}
                    {s.key === "bedrooms" && (
                      <BedroomsSelect
                        id={ids.bedrooms}
                        value={Number(form.bedrooms) || 0}
                        onChange={(n) => {
                          set("bedrooms", n);
                        }}
                      />
                    )}

                    {/* Description */}
                    {s.key === "description" && (
                      <DescriptionBuilder
                        value={form.description}
                        onChange={(nextVal) => set("description", nextVal)}
                        category={form.category}
                      />
                    )}

                    {/* Review */}
                    {s.key === "review" && (
                      <div className="space-y-3 text-sm">
                        <ReviewRow
                          label="Project name (auto)"
                          value={reviewAutoName}
                        />
                        <ReviewRow
                          label="Category"
                          value={form.category || "—"}
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
                        />
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

                  {err && idx === step && (
                    <p className="mt-3 text-sm text-red-600" role="alert">
                      {err}
                    </p>
                  )}

                  {/* Navigation buttons – only from step 1 onwards */}
                  {idx === step && step > 0 && (
                    <div className="mt-10 flex items-center justify-center gap-4">
                      {/* Previous */}
                      <button
                        type="button"
                        onClick={back}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                      >
                        ◀ Previous
                      </button>

                      {/* Next / Create */}
                      {step < maxStep ? (
                        <button
                          type="button"
                          onClick={next}
                          disabled={!isStepValid(step) || busy}
                          className="inline-flex items-center gap-2 rounded-full bg-[#F6A72B] px-8 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e59520] disabled:opacity-40"
                        >
                          Next ▶
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onCreate}
                          disabled={!isStepValid(step) || busy}
                          className="inline-flex items-center gap-2 rounded-full bg-[#F6A72B] px-8 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e59520] disabled:opacity-40"
                        >
                          {busy ? "Creating…" : "Create Project"}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </AuthedOnly>
  );
}

/* ====== Review Row ====== */

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
