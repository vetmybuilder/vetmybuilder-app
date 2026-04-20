import Head from "next/head";
import AuthedOnly from "@/components/AuthedOnly";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Select from "@/components/forms/Select";
import { PROJECT_TYPES, type ProjectTypeCategory } from "@/types/projectTypes";
import LocationField from "@/components/forms/LocationField";
import BedroomsSelect from "@/components/forms/BedroomsSelect";
import { trackProjectCreated } from "@/utils/analytics";
import DescriptionBuilder from "@/components/forms/DescriptionBuilder";
import SearchableSelect from "@/components/forms/SearchableSelect";
import ProgressBar from "@/components/ProgressBar";
import DynamicFieldGroup, {
  validateGroup,
} from "@/components/forms/DynamicFieldGroup";
import { getSpecForSelection, type AnswersShape } from "@/config/jobFields";

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
  locationDisplay: string;
  description: string;
  propertyType: string;
  bedrooms: number;

  // Structured, category-specific answers. Shape is `{ _version, [groupId]: {...} }`
  // — see web/config/jobFields.ts. Empty object when the category has no spec.
  answers: AnswersShape;
};

export default function NewProject() {
  const api = useApi();
  const router = useRouter();
  const { user, loading } = useAuth();

  // Tradesmen are not allowed to post projects — redirect them away
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { setRoleChecked(true); return; } // AuthedOnly handles unauthed
    api.get("/api/tradesmen/me").then((res: any) => {
      const data = res?.data ?? res;
      const role = String(data?.role || "user").toLowerCase();
      if (role === "tradesman" || !!data?.profile) {
        router.replace("/tradesman/projects");
      } else {
        setRoleChecked(true);
      }
    }).catch(() => { setRoleChecked(true); });
  }, [loading, user, router, api]);

  // Scroll target (just above the card, under header)
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  const [form, setForm] = useState<FormShape>({
    category: null,
    selectedTypes: [],
    otherEnabled: false,
    otherText: "",

    location: "",
    locationDisplay: "",
    description: "",
    propertyType: "",
    bedrooms: 0,

    answers: { _version: 1 },
  });

  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Per-field errors for the dynamic "details" step, keyed by `${groupId}.${fieldKey}`.
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});

  // Reset structured answers only when the matched spec changes — NOT when the
  // selection changes within the same spec (user toggling work types mid-flow).
  // See categorySpec.id below.

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

  // "details" step is injected only when a selected work type matches a spec.
  // All other work types keep the existing flow untouched.
  const categorySpec = useMemo(
    () => getSpecForSelection(form.selectedTypes),
    [form.selectedTypes],
  );

  useEffect(() => {
    setForm((prev) => ({ ...prev, answers: { _version: 1 } }));
    setAnswerErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySpec?.id]);

  const STEPS = useMemo(() => {
    const base: Array<{ key: string; title: string }> = [
      { key: "category", title: "Choose category" },
      { key: "subtypes", title: "Type of work" },
      { key: "location", title: "Location" },
      { key: "propertyType", title: "Property type" },
      { key: "bedrooms", title: "Bedrooms" },
    ];
    const details = categorySpec
      ? [{ key: "details", title: categorySpec.groups[0].title }]
      : [];
    return [
      ...base,
      ...details,
      { key: "description", title: "Brief description" },
      { key: "review", title: "Review & create" },
    ];
  }, [categorySpec]);

  const maxStep = STEPS.length - 1;

  function hasAnySubtype() {
    const picked = form.selectedTypes.length > 0;
    const otherOk = form.otherEnabled && form.otherText.trim().length >= 2;
    return picked || otherOk;
  }

  function detailsStepErrors(): Record<string, string> {
    if (!categorySpec) return {};
    return categorySpec.groups.reduce<Record<string, string>>(
      (acc, g) => Object.assign(acc, validateGroup(g, form.answers)),
      {},
    );
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
        return !!String(form[key as "location" | "propertyType"]).trim();
      case "bedrooms":
        return Number(form.bedrooms) >= 0;
      case "details":
        return Object.keys(detailsStepErrors()).length === 0;
      case "description":
        return form.description.trim().length >= 2;
      case "review":
        return (
          !!form.category &&
          hasAnySubtype() &&
          !!form.location.trim() &&
          !!form.propertyType.trim() &&
          String(form.description).trim().length >= 2 &&
          Object.keys(detailsStepErrors()).length === 0
        );
      default:
        return true;
    }
  }

  /* ===== Navigation helpers ===== */

  const autoNext = (force = false) => {
    if (step < maxStep && (force || isStepValid(step))) {
      shouldScrollRef.current = true;
      setStep((s) => s + 1);
    }
  };

  const next = () => {
    if (step >= maxStep) return;

    if (STEPS[step].key === "details") {
      const errs = detailsStepErrors();
      if (Object.keys(errs).length > 0) {
        setAnswerErrors(errs);
        return;
      }
      setAnswerErrors({});
    }

    if (isStepValid(step)) {
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

      const hasAnswers =
        categorySpec &&
        Object.keys(form.answers).some((k) => k !== "_version");

      const payload = {
        name: autoName,
        type: primaryType,
        location: form.location,
        description: normalize((form.description || "") + descExtras),
        propertyType: form.propertyType,
        bedrooms: Number(form.bedrooms) || 0,
        ...(hasAnswers ? { answers: form.answers } : {}),
      };

      const { data } = await api.post("/api/projects", payload);
      trackProjectCreated(data.project.id, payload.type);
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

  if (!roleChecked) return null;

  return (
    <AuthedOnly>
      <Head>
        <title>Post a Job — VetMyBuilder</title>
      </Head>

      <div className="relative min-h-screen overflow-hidden -mt-14">

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-20 pb-8">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between rounded-2xl bg-white/80 backdrop-blur px-4 py-3 shadow-sm">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-zinc-900">
                Post a job
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Choose a category, tick the work you need, and add a few details.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/projects")}
              className="hidden sm:flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
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

          {/* Wizard card */}
          <div className="mt-4 relative w-full overflow-hidden rounded-3xl bg-white shadow-xl shadow-zinc-200/60">
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
                    className="w-full shrink-0 px-6 py-6 sm:px-10 sm:py-10 min-h-[28rem] sm:min-h-[32rem]"
                  >
                    <h2
                      id={titleId}
                      className="max-w-3xl mx-auto text-xl font-black text-zinc-900"
                    >
                      {s.title}
                    </h2>

                    <div className="mt-5 grid max-w-3xl mx-auto gap-4">
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
                            <p className="text-sm text-zinc-400">
                              Pick a category first.
                            </p>
                          ) : (
                            <>
                              <div className="text-xs text-zinc-400 mb-3">
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
                                      className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 cursor-pointer transition ${
                                        checked
                                          ? "border-red-300 bg-red-50"
                                          : "border-zinc-200 hover:bg-zinc-50"
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
                                      <span className="text-sm text-zinc-800">{t}</span>
                                    </label>
                                  );
                                })}
                              </div>

                              {/* Other */}
                              <div className="mt-3 rounded-xl border-2 border-zinc-200 p-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={form.otherEnabled}
                                    onChange={(e) =>
                                      set("otherEnabled", e.target.checked)
                                    }
                                  />
                                  <span className="text-sm text-zinc-700">Other…</span>
                                </label>

                                {form.otherEnabled && (
                                  <input
                                    className="mt-2 w-full rounded-xl border-2 border-zinc-200 px-4 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors text-sm"
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
                          onChange={(v, meta) => {
                            set("location", v.toUpperCase());
                          }}
                          onDisplayChange={(display) => {
                            set("locationDisplay", display);
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

                      {/* Category-specific dynamic fields */}
                      {s.key === "details" && categorySpec && (
                        <div className="space-y-6">
                          {categorySpec.groups.map((g) => (
                            <DynamicFieldGroup
                              key={g.id}
                              group={g}
                              value={form.answers}
                              onChange={(nextAnswers) =>
                                set("answers", nextAnswers)
                              }
                              errors={answerErrors}
                            />
                          ))}
                        </div>
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
                          <ReviewRow label="Location" value={form.locationDisplay || form.location} />
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
                      <p
                        className="mt-3 max-w-3xl mx-auto text-sm text-red-500 font-medium"
                        role="alert"
                      >
                        {err}
                      </p>
                    )}

                    {/* Navigation buttons – only from step 1 onwards */}
                    {idx === step && step > 0 && (
                      <div className="mt-10 flex max-w-3xl mx-auto items-center justify-center gap-4">
                        <button
                          type="button"
                          onClick={back}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-full border-2 border-zinc-200 bg-white px-6 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition-all"
                        >
                          Previous
                        </button>

                        {step < maxStep ? (
                          <button
                            type="button"
                            onClick={next}
                            disabled={!isStepValid(step) || busy}
                            className="inline-flex items-center gap-2 rounded-full bg-red-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] disabled:opacity-40 disabled:scale-100 disabled:shadow-none transition-all"
                          >
                            Next
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={onCreate}
                            disabled={!isStepValid(step) || busy}
                            className="inline-flex items-center gap-2 rounded-full bg-red-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] disabled:opacity-40 disabled:scale-100 disabled:shadow-none transition-all"
                          >
                            {busy ? "Creating…" : "Create project"}
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
      <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
        {label}
      </div>
      {multiline ? (
        <p className="whitespace-pre-wrap rounded-2xl border-2 border-zinc-100 bg-zinc-50 p-4 text-zinc-800">
          {value || "—"}
        </p>
      ) : (
        <div className="rounded-2xl border-2 border-zinc-100 bg-zinc-50 px-4 py-2.5 text-zinc-800">
          {value || "—"}
        </div>
      )}
    </div>
  );
}
