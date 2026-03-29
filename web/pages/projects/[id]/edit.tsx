// web/pages/projects/[id]/edit.tsx
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

        const initialForm: FormShape = {
          category: inferredCategory,
          selectedTypes: primaryType ? [primaryType] : [],
          otherEnabled: false,
          otherText: "",
          location: p.location ?? "",
          description: p.description ?? "",
          propertyType: p.propertyType ?? "",
          bedrooms: Number(p.bedrooms ?? 0),
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

  const STEPS = useMemo(
    () =>
      [
        { key: "category", title: "Category" as const },
        { key: "subtypes", title: "Type of work" as const },
        { key: "location", title: "Location" as const },
        { key: "propertyType", title: "Property type" as const },
        { key: "bedrooms", title: "Number of rooms" as const },
        { key: "description", title: "Brief description" as const },
        { key: "review", title: "Review & save" as const },
      ] as const,
    [],
  );
  type StepKey = (typeof STEPS)[number]["key"];
  const maxStep = STEPS.length - 1;

  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));

  function hasAnySubtype(): boolean {
    if (!form) return false;
    const picked = form.selectedTypes.length > 0;
    const otherOk = form.otherEnabled && form.otherText.trim().length >= 2;
    return picked || otherOk;
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

      const payload = {
        name: autoName,
        type: primaryType,
        location: form.location,
        description: normalize(form.description || ""),
        propertyType: form.propertyType,
        bedrooms: Number(form.bedrooms) || 0,
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

  const next = () => {
    if (step < maxStep && isStepValid(step)) {
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
        className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10"
        data-testid="project-edit-loading"
      >
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
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
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 text-sm text-slate-500">
        Project not found.
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"
      data-testid="project-edit-page"
      aria-label="Edit Project Page"
    >
      <div
        className="mb-6 flex items-center justify-between"
        data-testid="project-edit-header"
      >
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            data-testid="project-edit-title"
          >
            Edit Project
          </h1>
          <p
            className="mt-1 text-sm text-slate-500"
            data-testid="project-edit-subtitle"
          >
            Update the key details for your project. Location can’t be changed
            here.
          </p>
        </div>
        <Link
          href={`/projects/${id}`}
          className="btn-back"
          data-testid="btn-back"
          aria-label="Back to project"
          title="Back to project"
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
          <span className="sr-only">Back to project</span>
        </Link>
      </div>

      <div
        className="mb-6 flex items-center gap-2"
        aria-label="Progress"
        data-testid="wizard-progress-edit"
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

      <div
        ref={wizardRef}
        tabIndex={-1}
        className="relative w-full overflow-hidden rounded-2xl bg-white border border-gray-200"
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
                className="w-full shrink-0 px-6 py-6 sm:px-10 sm:py-10"
              >
                <h2 id={titleId} className="text-lg font-semibold">
                  {s.title}
                </h2>

                <div className="mt-5 grid max-w-3xl gap-4">
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
                      }}
                      options={CATEGORY_OPTIONS}
                      data-testid="field-category-edit"
                    />
                  )}

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
                            data-testid="field-subtypes-edit"
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
                                    onChange={() => toggleSubtype(t)}
                                  />
                                  <span className="text-sm">{t}</span>
                                </label>
                              );
                            })}
                          </div>

                          <div className="mt-3 rounded-xl border border-slate-200 p-3">
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
                        className="text-xs text-slate-500"
                      >
                        Location
                      </label>
                      <div
                        id={ids.location}
                        className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900"
                        data-testid="field-location-readonly"
                      >
                        {form.location || "—"}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
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
                    className="mt-3 text-sm text-red-600"
                    role="alert"
                    data-testid="edit-error"
                  >
                    {formErr}
                  </p>
                )}

                <div className="mt-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={back}
                    disabled={step === 0 || busy}
                    className="btn-outline disabled:opacity-50"
                    aria-label="Back"
                    data-testid="wizard-back-edit"
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
                      data-testid="wizard-next-edit"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onSave}
                      disabled={!isStepValid(step) || busy}
                      className="btn disabled:opacity-50"
                      aria-label="Save changes"
                      data-testid="wizard-save-edit"
                    >
                      {busy ? "Saving..." : "Save changes"}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
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
