// web/pages/projects/[id]/edit.tsx
import Head from "next/head";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/utils/auth";
import Select from "@/components/forms/Select";
import { PROJECT_TYPES, type ProjectTypeCategory } from "@/types/projectTypes";
import BedroomsSelect from "@/components/forms/BedroomsSelect";
import DescriptionBuilder from "@/components/forms/DescriptionBuilder";
import ProgressBar from "@/components/ProgressBar";
import DynamicFieldGroup, {
  validateGroup,
} from "@/components/forms/DynamicFieldGroup";
import { getSpecForSelection, type AnswersShape } from "@/config/jobFields";

/* ===== Outer page: auth + gate (prevents flicker) ===== */
export default function EditProjectPage() {
  return (
    <AuthedOnly>
      <EditGate />
    </AuthedOnly>
  );
}

/* ===== Little gate that decides where to send the user (no flicker) ===== */
function EditGate() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"checking" | "ok" | "redirect">(
    "checking",
  );

  useEffect(() => {
    let alive = true;
    if (!router.isReady || authLoading) return;

    try {
      if (sessionStorage.getItem("vmb:isTradesman") === "1") {
        setStatus("redirect");
        router.replace("/tradesman/projects");
        return;
      }
    } catch {}

    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const isT =
          String(data?.role || "").toLowerCase() === "tradesman" ||
          !!data?.profile;
        if (!alive) return;
        if (isT) {
          try {
            sessionStorage.setItem("vmb:isTradesman", "1");
          } catch {}
          setStatus("redirect");
          router.replace("/tradesman/projects");
          return;
        }
      } catch {}
      if (alive) setStatus("ok");
    })();

    return () => {
      alive = false;
    };
  }, [api, router, authLoading]);

  if (status === "redirect") {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 text-sm text-slate-500">
        Redirecting…
      </div>
    );
  }

  if (status !== "ok") {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return <EditProjectInner />;
}

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

type FormShape = {
  category: string | null;
  selectedTypes: string[];
  otherEnabled: boolean;
  otherText: string;

  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;

  answers: AnswersShape;
};

function EditProjectInner() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { id } = router.query;

  const [form, setForm] = useState<FormShape | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  const wizardRef = useRef<HTMLDivElement | null>(null);

  function moveFocusOffStep() {
    try {
      const el = document.activeElement as HTMLElement | null;
      el?.blur?.();
    } catch {}
    try {
      wizardRef.current?.focus();
    } catch {}
  }

  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;

    let alive = true;
    setLoading(true);
    setLoadErr(null);

    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        if (!alive) return;
        const p = data.project;

        const primaryType: string = p.type ?? "";
        let inferredCategory: string | null = null;
        if (primaryType) {
          const bucket = PROJECT_TYPES.find((c: ProjectTypeCategory) =>
            c.types.some(
              (t) => t.toLowerCase() === String(primaryType).toLowerCase(),
            ),
          );
          inferredCategory = bucket?.category ?? null;
        }

        // answers_json may come back as a parsed object or a JSON string
        // depending on the MySQL driver config. Normalise to an object.
        let loadedAnswers: AnswersShape = { _version: 1 };
        const rawAnswers = (p as any)?.answers_json;
        if (rawAnswers && typeof rawAnswers === "string") {
          try {
            loadedAnswers = JSON.parse(rawAnswers) || loadedAnswers;
          } catch {
            /* keep default */
          }
        } else if (rawAnswers && typeof rawAnswers === "object") {
          loadedAnswers = rawAnswers;
        }

        const initialForm: FormShape = {
          category: inferredCategory,
          selectedTypes: primaryType ? [primaryType] : [],
          otherEnabled: false,
          otherText: "",
          location: p.location ?? "",
          description: p.description ?? "",
          propertyType: p.propertyType ?? "",
          bedrooms: Number(p.bedrooms ?? 0),
          answers: loadedAnswers,
        };

        setForm(initialForm);
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status;
        const message =
          e?.data?.error || e?.response?.data?.error || e?.message || "";
        if (status === 401 || /bearer token/i.test(String(message))) {
          setLoadErr("You need to sign in again to edit this project.");
        } else {
          setLoadErr("Failed to load project.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user]);

  const CATEGORY_OPTIONS = useMemo(
    () =>
      [...PROJECT_TYPES]
        .map((c) => c.category)
        .sort((a, b) => a.localeCompare(b)),
    [],
  );

  const SUBTYPE_OPTIONS = useMemo(() => {
    if (!form?.category) return [] as string[];
    const bucket = PROJECT_TYPES.find(
      (c: ProjectTypeCategory) => c.category === form.category,
    );
    if (!bucket) return [] as string[];
    return [...bucket.types].sort((a, b) => a.localeCompare(b));
  }, [form?.category]);

  const categorySpec = useMemo(
    () => getSpecForSelection(form?.selectedTypes ?? null),
    [form?.selectedTypes],
  );

  const STEPS = useMemo(() => {
    const base: Array<{ key: string; title: string }> = [
      { key: "category", title: "Category" },
      { key: "subtypes", title: "Type of work" },
      { key: "location", title: "Location" },
      { key: "propertyType", title: "Property type" },
      { key: "bedrooms", title: "Number of rooms" },
    ];
    const details = categorySpec
      ? [{ key: "details", title: categorySpec.groups[0].title }]
      : [];
    return [
      ...base,
      ...details,
      { key: "description", title: "Brief description" },
      { key: "review", title: "Review & save" },
    ];
  }, [categorySpec]);
  type StepKey = string;
  const maxStep = STEPS.length - 1;

  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));

  function hasAnySubtype(): boolean {
    if (!form) return false;
    const picked = form.selectedTypes.length > 0;
    const otherOk = form.otherEnabled && form.otherText.trim().length >= 2;
    return picked || otherOk;
  }

  function detailsStepErrors(): Record<string, string> {
    if (!categorySpec || !form) return {};
    return categorySpec.groups.reduce<Record<string, string>>(
      (acc, g) => Object.assign(acc, validateGroup(g, form.answers)),
      {},
    );
  }

  function isStepValid(idx: number): boolean {
    if (!form) return false;
    const k = STEPS[idx].key as StepKey;
    if (k === "review") {
      return (
        !!form.category &&
        hasAnySubtype() &&
        !!form.location.trim() &&
        !!form.propertyType.trim() &&
        Number(form.bedrooms) >= 0 &&
        String(form.description).trim().length >= 2 &&
        Object.keys(detailsStepErrors()).length === 0
      );
    }
    switch (k) {
      case "category":
        return !!form.category;
      case "subtypes":
        return hasAnySubtype();
      case "location":
      case "propertyType":
        return !!String(form[k as "location" | "propertyType"]).trim();
      case "bedrooms":
        return String(form.bedrooms) !== "" && Number(form.bedrooms) >= 0;
      case "details":
        return Object.keys(detailsStepErrors()).length === 0;
      case "description":
        return String(form.description).trim().length >= 2;
      default:
        return true;
    }
  }

  async function onSave() {
    if (!form) return;
    if (!isStepValid(maxStep)) return;
    setBusy(true);
    setFormErr(null);
    try {
      const primaryType =
        form.selectedTypes[0] || normalize(form.otherText || "General work");

      const autoName = buildAutoNameSimple(
        primaryType,
        form.location,
        form.propertyType,
      );

      const hasAnswers =
        !!categorySpec &&
        Object.keys(form.answers).some((k) => k !== "_version");

      const payload = {
        name: autoName,
        type: primaryType,
        location: form.location,
        description: normalize(form.description || ""),
        propertyType: form.propertyType,
        bedrooms: Number(form.bedrooms) || 0,
        // Always send `answers` so the server can overwrite (including clearing
        // when the category no longer has a spec). undefined would be ignored.
        answers: hasAnswers ? form.answers : null,
      };

      const { data } = await api.put(`/api/projects/${id}`, payload);
      router.replace(`/projects/${data.project.id}`);
    } catch (e: any) {
      setFormErr(
        e?.response?.data?.error ||
          e?.data?.error ||
          e?.message ||
          "Failed to update",
      );
    } finally {
      setBusy(false);
    }
  }

  const autoNext = () => {
    if (step < maxStep) {
      moveFocusOffStep();
      setFormErr(null);
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
      moveFocusOffStep();
      setFormErr(null);
      setStep((s) => s + 1);
    }
  };
  const back = () => {
    moveFocusOffStep();
    setFormErr(null);
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
      category: "ep-category",
      subtypes: "ep-subtypes",
      location: "ep-location",
      propertyType: "ep-property",
      bedrooms: "ep-beds",
      description: "ep-desc",
    }),
    [],
  );

  const primaryPreview =
    (form?.selectedTypes[0] as string | undefined) ||
    (form?.otherEnabled ? form?.otherText.trim() : "") ||
    "";
  const reviewAutoName = buildAutoNameSimple(
    primaryPreview || "Project",
    form?.location || "",
    form?.propertyType || "",
  );

  function toggleSubtype(label: string) {
    setForm((prev) => {
      if (!prev) return prev;
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

  if (authLoading || loading) {
    return (
      <div
        className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10"
        data-testid="project-edit-loading"
      >
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="card" data-testid="project-edit-error">
          <p
            className="text-red-600 text-sm"
            data-testid="project-edit-error-message"
          >
            {loadErr}
          </p>
          <Link
            href="/login"
            className="btn mt-3"
            data-testid="btn-go-to-sign-in"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10 text-sm text-zinc-500">
        Project not found.
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Edit Project — VetMyBuilder</title>
      </Head>
      <div
        className="relative min-h-screen overflow-hidden"
        data-testid="project-edit-page"
        aria-label="Edit Project Page"
      >

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div
            className="mb-6 flex items-center justify-between rounded-2xl bg-white/80 backdrop-blur px-4 py-3 shadow-sm"
            data-testid="project-edit-header"
          >
            <div>
              <h1
                className="text-3xl font-black tracking-tight text-zinc-900"
                data-testid="project-edit-title"
              >
                Edit project
              </h1>
              <p
                className="mt-1 text-sm text-zinc-500"
                data-testid="project-edit-subtitle"
              >
                Update the key details. Location can’t be changed here.
              </p>
            </div>
            <Link
              href={`/projects/${id}`}
              data-testid="btn-back"
              aria-label="Back to project"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              <span className="text-lg">←</span>
              Back
            </Link>
          </div>

          {/* Progress bar */}
          <div data-testid="wizard-progress-edit" aria-label="Progress">
            <ProgressBar current={step} total={STEPS.length} />
          </div>

          {/* Wizard card */}
          <div
            ref={wizardRef}
            tabIndex={-1}
            className="mt-4 relative w-full overflow-hidden rounded-3xl bg-white shadow-xl shadow-zinc-200/60"
            data-testid="wizard-edit"
            data-current-step={STEPS[step].key}
          >
            <div
              className="flex w-full transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${step * 100}%)` }}
            >
              {STEPS.map((s, i) => {
                const active = i === step;
                const titleId = `edit-step-${s.key}-title`;
                return (
                  <section
                    key={s.key}
                    role="region"
                    aria-labelledby={titleId}
                    aria-hidden={active ? undefined : true}
                    {...(!active ? ({ inert: "" } as any) : {})}
                    className="w-full shrink-0 px-6 py-6 sm:px-10 sm:py-10 min-h-[28rem] sm:min-h-[32rem]"
                  >
                    <h2
                      id={titleId}
                      className="max-w-3xl mx-auto text-xl font-black text-zinc-900"
                    >
                      {s.title}
                    </h2>

                <div className="mt-5 grid max-w-3xl mx-auto gap-4">
                  {s.key === "category" && (
                    <Select
                      id={ids.category}
                      label="Category"
                      placeholder="Select a category"
                      value={form.category}
                      onChange={(v) => {
                        set("category", v);
                        set("selectedTypes", []);
                        set("otherEnabled", false);
                        set("otherText", "");
                        if (v) autoNext();
                      }}
                      options={CATEGORY_OPTIONS}
                      data-testid="field-category-edit"
                    />
                  )}

                  {s.key === "subtypes" && (
                    <div>
                      {!form.category ? (
                        <p className="text-sm text-zinc-400">
                          Pick a category first.
                        </p>
                      ) : SUBTYPE_OPTIONS.length === 0 ? (
                        <p className="text-sm text-zinc-400">
                          No sub-types available for this category.
                        </p>
                      ) : (
                        <>
                          <div className="text-xs text-zinc-400 mb-3">
                            Select all that apply
                          </div>
                          <div
                            id={ids.subtypes}
                            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                            data-testid="field-subtypes-edit"
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
                                    onChange={() => toggleSubtype(t)}
                                  />
                                  <span className="text-sm text-zinc-800">{t}</span>
                                </label>
                              );
                            })}
                          </div>

                          <div className="mt-3 rounded-xl border-2 border-zinc-200 p-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                className="checkbox"
                                checked={form.otherEnabled}
                                onChange={(e) =>
                                  set("otherEnabled", e.target.checked)
                                }
                                data-testid="chk-other-edit"
                              />
                              <span className="text-sm text-zinc-700">Other…</span>
                            </label>
                            {form.otherEnabled && (
                              <input
                                className="mt-2 w-full rounded-xl border-2 border-zinc-200 px-4 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors text-sm"
                                placeholder="Describe another type of work"
                                value={form.otherText}
                                onChange={(e) =>
                                  set("otherText", e.target.value)
                                }
                                onKeyDown={handleEnter}
                                data-testid="input-other-edit"
                              />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {s.key === "location" && (
                    <div>
                      <label
                        htmlFor={ids.location}
                        className="text-xs text-zinc-500"
                      >
                        Location
                      </label>
                      <div
                        id={ids.location}
                        className="mt-1 rounded-2xl border-2 border-zinc-100 bg-zinc-50 px-4 py-2.5 text-zinc-800"
                        data-testid="field-location-readonly"
                      >
                        {form.location || "—"}
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">
                        Location is fixed for this project. If it’s wrong,
                        please close this project and create a new one.
                      </p>
                    </div>
                  )}

                  {s.key === "propertyType" && (
                    <Select
                      id={ids.propertyType}
                      label="Property type"
                      placeholder="Select property type"
                      value={form.propertyType || null}
                      onChange={(v) => set("propertyType", v)}
                      options={Array.from(PROPERTY_TYPES)}
                      data-testid="field-property-edit"
                    />
                  )}

                  {s.key === "bedrooms" && (
                    <BedroomsSelect
                      id={ids.bedrooms}
                      label="Number of rooms"
                      value={Number(form.bedrooms) || 0}
                      onChange={(n) => set("bedrooms", n)}
                      data-testid="field-bedrooms-edit"
                    />
                  )}

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

                  {s.key === "description" && (
                    <DescriptionBuilder
                      value={form.description}
                      onChange={(next) => set("description", next)}
                      className="mt-1"
                    />
                  )}

                  {s.key === "review" && (
                    <div
                      className="space-y-3 text-sm"
                      data-testid="review-edit"
                    >
                      <ReviewRow
                        label="Project name (auto)"
                        value={reviewAutoName}
                        dataTestId="review-name-edit"
                      />
                      <ReviewRow
                        label="Category"
                        value={form.category || "—"}
                        dataTestId="review-category-edit"
                      />
                      <ReviewRow
                        label="Type(s) of work"
                        value={
                          [
                            ...form.selectedTypes,
                            ...(form.otherEnabled &&
                            form.otherText.trim().length
                              ? [normalize(form.otherText)]
                              : []),
                          ].join(", ") || "—"
                        }
                        dataTestId="review-types-edit"
                      />
                      <ReviewRow
                        label="Location"
                        value={form.location}
                        dataTestId="review-location-edit"
                      />
                      <ReviewRow
                        label="Property type"
                        value={form.propertyType}
                        dataTestId="review-property-edit"
                      />
                      <ReviewRow
                        label="Number of rooms"
                        value={String(form.bedrooms || 0)}
                        dataTestId="review-bedrooms-edit"
                      />
                      <ReviewRow
                        label="Description"
                        value={form.description}
                        multiline
                        dataTestId="review-description-edit"
                      />
                    </div>
                  )}
                </div>

                {formErr && active && (
                  <p
                    className="mt-3 max-w-3xl mx-auto text-sm text-red-500 font-medium"
                    role="alert"
                    data-testid="edit-error"
                  >
                    {formErr}
                  </p>
                )}

                {active && (
                  <div className="mt-10 flex max-w-3xl mx-auto items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={back}
                      disabled={step === 0 || busy}
                      className="inline-flex items-center gap-2 rounded-full border-2 border-zinc-200 bg-white px-6 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition-all"
                      aria-label="Back"
                      data-testid="wizard-back-edit"
                    >
                      Previous
                    </button>

                    {step < maxStep ? (
                      <button
                        type="button"
                        onClick={next}
                        disabled={!isStepValid(step) || busy}
                        className="inline-flex items-center gap-2 rounded-full bg-red-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] disabled:opacity-40 disabled:scale-100 disabled:shadow-none transition-all"
                        aria-label={`Next: ${s.title}`}
                        data-testid="wizard-next-edit"
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onSave}
                        disabled={!isStepValid(step) || busy}
                        className="inline-flex items-center gap-2 rounded-full bg-red-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] disabled:opacity-40 disabled:scale-100 disabled:shadow-none transition-all"
                        aria-label="Save changes"
                        data-testid="wizard-save-edit"
                      >
                        {busy ? "Saving…" : "Save changes"}
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
    </>
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
      <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
        {label}
      </div>
      {multiline ? (
        <p
          className="whitespace-pre-wrap rounded-2xl border-2 border-zinc-100 bg-zinc-50 p-4 text-zinc-800"
          data-testid={dataTestId}
        >
          {value || "—"}
        </p>
      ) : (
        <div
          className="rounded-2xl border-2 border-zinc-100 bg-zinc-50 px-4 py-2.5 text-zinc-800"
          data-testid={dataTestId}
        >
          {value || "—"}
        </div>
      )}
    </div>
  );
}
