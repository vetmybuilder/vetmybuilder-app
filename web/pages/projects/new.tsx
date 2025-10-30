import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import AutoCompleteInput from "@/components/forms/AutoCompleteInput";
import {
  suggestProjectTypes,
  suggestProjectTypesWithScores,
  toCanonicalType,
  buildAutoName,
} from "@/types/projectTypes";
import { logProjectTypeQuery } from "@/utils/pt-analytics";
import useProjectTypeSuggester from "@/hooks/useProjectTypeSuggester";

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

/* ===== Types ===== */

type FormShape = {
  // No explicit "name" field anymore; we'll auto-generate it from other fields
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number | string;
};

export default function NewProject() {
  const api = useApi();
  const router = useRouter();

  const { get: getTypeSuggestions, defaults: DEFAULT_QUICK_PICKS } =
    useProjectTypeSuggester(api, 8);

  const [form, setForm] = useState<FormShape>({
    type: "",
    location: "",
    description: "",
    propertyType: "",
    bedrooms: 0,
  });
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // prevent duplicate logs per visit
  const loggedTypeOnceRef = useRef(false);

  /** Log low-confidence or unknown "Type of project" inputs */
  async function maybeLogTypeQuery(raw: string) {
    if (!raw || loggedTypeOnceRef.current) return;

    const scored = suggestProjectTypesWithScores(raw, 8);
    const suggestions = scored.map(({ label }) => label);
    const confidence = scored[0]?.score ?? 0;

    // Log if nothing matched OR our top score is weak
    if (suggestions.length === 0 || confidence < 1.2) {
      // fire-and-forget; never block UX
      logProjectTypeQuery(api as any, {
        query: raw,
        matchedLabel: suggestions[0] || null,
        confidence,
        suggestions,
      });
      loggedTypeOnceRef.current = true;
    }
  }

  const set = (k: keyof FormShape, v: any) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const STEPS = useMemo(
    () =>
      [
        {
          key: "type",
          title: "Type of project",
          hint: "Start typing — fuzzy suggestions handle typos (e.g. “kichen” → Kitchen remodel).",
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
          hint: "Add scope, timing, budget band, access constraints.",
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
        !!form.type.trim() &&
        !!form.location.trim() &&
        !!form.propertyType.trim() &&
        Number(form.bedrooms) >= 0 &&
        String(form.description).trim().length >= 2
      );
    }
    switch (k) {
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
      const canonicalType = toCanonicalType(form.type);
      const autoName = buildAutoName(
        canonicalType,
        form.location,
        form.propertyType
      );
      const payload = {
        name: autoName, // ← generated
        type: canonicalType,
        location: form.location,
        description: form.description,
        propertyType: form.propertyType,
        bedrooms: Number(form.bedrooms) || 0,
      };
      // fire-and-forget; do not await
      logProjectTypeQuery(api as any, {
        query: form.type,
        matchedLabel: toCanonicalType(form.type),
        confidence: 2, // confirmed by user on submit
        suggestions: suggestProjectTypes(form.type),
      });
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

  const ids = useMemo(
    () => ({
      type: "np-type",
      location: "np-location",
      propertyType: "np-property",
      bedrooms: "np-beds",
      description: "np-desc",
    }),
    []
  );

  const postcodeLooksValid =
    !form.location || UK_POSTCODE_HINT.test(form.location.trim());

  const reviewAutoName = buildAutoName(
    toCanonicalType(form.type),
    form.location,
    form.propertyType
  );

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
              Tell us about the work you need and we’ll get the ball rolling.
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
              {/* if your linter complains about dName, switch back to d; some linters flag raw <path d> */}
            </svg>
            <span className="sr-only">Back to my projects</span>
          </Link>
        </div>

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
                  {"hint" in s && s.hint && (
                    <p className="mt-1 text-sm text-gray-500">{s.hint}</p>
                  )}

                  <div className="mt-5 grid max-w-3xl gap-4">
                    {s.key === "type" && (
                      <div onBlur={() => maybeLogTypeQuery(form.type)}>
                        <AutoCompleteInput
                          id={ids.type}
                          label="Type of project"
                          placeholder="Start typing (e.g., Kitchen remodel, Bathroom refit, Roofing, Driveway…) — typos OK"
                          value={form.type}
                          onChange={(v) => set("type", v)}
                          onEnter={() => {
                            maybeLogTypeQuery(form.type);
                            next();
                          }}
                          getSuggestions={(q) => getTypeSuggestions(q)}
                          quickPicks={DEFAULT_QUICK_PICKS}
                          onQuickPick={(v) => set("type", v)}
                          ariaLabel="Type of project"
                          data-testid="field-type"
                        />

                        {form.type &&
                          form.type !== toCanonicalType(form.type) && (
                            <p className="text-xs text-gray-500">
                              We’ll save this as{" "}
                              <strong>{toCanonicalType(form.type)}</strong>.
                            </p>
                          )}
                      </div>
                    )}

                    {s.key === "location" && (
                      <>
                        <AutoCompleteInput
                          id={ids.location}
                          label="Location"
                          placeholder="Postcode, borough, or city (e.g. E4, Walthamstow)"
                          value={form.location}
                          onChange={(v) => set("location", v.toUpperCase())}
                          onEnter={next}
                          getSuggestions={(q) => locationSuggestions(q)}
                          quickPicks={LONDON_LOCATIONS}
                          onQuickPick={(v) => set("location", v)}
                          ariaLabel="Location"
                          data-testid="field-location"
                        />
                        {!postcodeLooksValid && (
                          <p
                            className="text-xs text-amber-600"
                            data-testid="postcode-hint"
                          >
                            Tip: UK postcodes look like “E4 7ER” or “N1 9AL”.
                            Borough or city also fine.
                          </p>
                        )}
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
                          aria-label="Property type"
                          value={form.propertyType}
                          onChange={(e) => set("propertyType", e.target.value)}
                          onKeyDown={handleEnter}
                          data-testid="field-property"
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
                          aria-label="Bedrooms"
                          type="number"
                          min={0}
                          value={form.bedrooms}
                          onChange={(e) => set("bedrooms", e.target.value)}
                          onKeyDown={handleEnter}
                          data-testid="field-bedrooms"
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
                          placeholder="Rooms, scope, materials, timing, budget band, access constraints…"
                          aria-label="Description"
                          value={form.description}
                          onChange={(e) => set("description", e.target.value)}
                          onKeyDown={handleEnter}
                          data-testid="field-description"
                        />
                        {/* helper chips */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {[
                            "Budget: £5k–£15k",
                            "Ready to start in 2–4 weeks",
                            "Weekends only",
                            "Materials supplied by tradesman",
                            "Owner-occupied",
                          ].map((hint, i) => (
                            <button
                              key={hint}
                              type="button"
                              className="px-3 py-1 border rounded-full text-sm hover:bg-gray-50"
                              onClick={() =>
                                set(
                                  "description",
                                  normalize(
                                    (form.description + " " + hint).trim()
                                  )
                                )
                              }
                              data-testid={`desc-chip-${i}`}
                            >
                              {hint}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {s.key === "review" && (
                      <div className="space-y-3 text-sm" data-testid="review">
                        <ReviewRow
                          label="Project name (auto)"
                          value={reviewAutoName}
                          dataTestId="review-name"
                        />
                        <ReviewRow
                          label="Type of work"
                          value={toCanonicalType(form.type)}
                          dataTestId="review-type"
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
