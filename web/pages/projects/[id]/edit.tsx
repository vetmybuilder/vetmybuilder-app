// web/pages/projects/[id]/edit.tsx
import Head from "next/head";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/utils/auth";
import { PROJECT_TYPES, type ProjectTypeCategory } from "@/types/projectTypes";
import DynamicFieldGroup, {
  validateGroup,
} from "@/components/forms/DynamicFieldGroup";
import { getSpecForSelection, type AnswersShape } from "@/config/jobFields";

/* ===== Outer page: auth + gate ===== */
export default function EditProjectPage() {
  return (
    <AuthedOnly>
      <EditGate />
    </AuthedOnly>
  );
}

function EditGate() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"checking" | "ok" | "redirect">("checking");

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
        const isT = String(data?.role || "").toLowerCase() === "tradesman" || !!data?.profile;
        if (!alive) return;
        if (isT) {
          try { sessionStorage.setItem("vmb:isTradesman", "1"); } catch {}
          setStatus("redirect");
          router.replace("/tradesman/projects");
          return;
        }
      } catch {}
      if (alive) setStatus("ok");
    })();
    return () => { alive = false; };
  }, [api, router, authLoading]);

  if (status === "redirect" || status !== "ok") {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 text-sm text-slate-500">
        {status === "redirect" ? "Redirecting..." : "Loading..."}
      </div>
    );
  }
  return <EditProjectInner />;
}

/* ===== Category icons ===== */

const CATEGORY_ICONS: Record<string, string> = {
  "Accessibility & Safety": "\u267F",
  "Appliances": "\u2699\uFE0F",
  "Bathroom": "\u{1F6C1}",
  "Bedroom": "\u{1F6CF}\uFE0F",
  "Building & Construction": "\u{1F3D7}\uFE0F",
  "Carpentry & Joinery": "\u{1FA9A}",
  "Cleaning & Waste": "\u{1F9F9}",
  "Damp & Waterproofing": "\u{1F4A7}",
  "Electrical": "\u26A1",
  "Energy & Renewables": "\u{1F33F}",
  "Extensions & Conversions": "\u{1F3E0}",
  "Exterior & Structure": "\u{1F9F1}",
  "Fencing & Gates": "\u{1F3E1}",
  "Flooring": "\u{1FA9E}",
  "Heating & Cooling": "\u{1F525}",
  "Insulation": "\u{1F3E0}",
  "Kitchen": "\u{1F373}",
  "Landscaping & Garden": "\u{1F331}",
  "Metalwork & Fabrication": "\u{1F529}",
  "Painting & Decorating": "\u{1F3A8}",
  "Pest Control": "\u{1F41C}",
  "Plumbing": "\u{1F527}",
  "Repairs & Maintenance": "\u{1F6E0}\uFE0F",
  "Roofing": "\u{1F3E0}",
  "Smart Home & Security": "\u{1F4F1}",
  "Tiling & Plastering": "\u{1F9F1}",
  "Windows & Doors": "\u{1FA9F}",
};

/* ===== Constants ===== */

const PROPERTY_TYPES = [
  { label: "Detached", icon: "\u{1F3E0}" },
  { label: "Semi-Detached", icon: "\u{1F3E0}" },
  { label: "Terraced", icon: "\u{1F3E0}" },
  { label: "End of Terrace", icon: "\u{1F3E0}" },
  { label: "Flat", icon: "\u{1F3E2}" },
  { label: "Bungalow", icon: "\u{1F3E1}" },
  { label: "Cottage", icon: "\u{1F3E1}" },
  { label: "Maisonette", icon: "\u{1F3E2}" },
  { label: "Townhouse", icon: "\u{1F3D8}\uFE0F" },
  { label: "Other", icon: "\u{1F3E0}" },
] as const;

const BEDROOM_OPTIONS = ["0", "1", "2", "3", "4", "5", "6+"] as const;

const TIMEFRAMES = [
  "Urgent (1-2 weeks)",
  "Soon (2-4 weeks)",
  "This quarter (1-3 months)",
  "Flexible (3+ months)",
];

const BUDGETS = ["Under 1k", "1k - 5k", "5k - 15k", "15k - 30k", "30k+", "Not sure"];

const MATERIALS_OPTIONS = [
  "Supplied by tradesman",
  "Supplied by homeowner",
  "Mixed (some provided)",
  "Not sure yet",
];

const ACCESS_OPTIONS = [
  "Parking available",
  "Street parking only",
  "No parking",
];

function normalize(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function buildAutoNameSimple(primaryType: string, location: string, propertyType?: string) {
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
  propertyType: string;
  bedrooms: number;
  timeframe: string;
  budget: string;
  materials: string;
  access: string;
  description: string;
  answers: AnswersShape;
};

/* ===== Main edit form ===== */

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
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});
  const [subtypeSearch, setSubtypeSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");

  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));

  // Load project
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
            c.types.some((t) => t.toLowerCase() === String(primaryType).toLowerCase()),
          );
          inferredCategory = bucket?.category ?? null;
        }

        let loadedAnswers: AnswersShape = { _version: 1 };
        const rawAnswers = (p as any)?.answers_json;
        if (rawAnswers && typeof rawAnswers === "string") {
          try { loadedAnswers = JSON.parse(rawAnswers) || loadedAnswers; } catch {}
        } else if (rawAnswers && typeof rawAnswers === "object") {
          loadedAnswers = rawAnswers;
        }

        // Parse structured fields from existing description
        const desc = String(p.description || "");
        let timeframe = "";
        let budget = "";
        let materials = "";
        let access = "";
        const noteLines: string[] = [];
        for (const line of desc.split("\n").map((l: string) => l.trim()).filter(Boolean)) {
          const tf = line.match(/^Timeframe:\s*(.+?)\.?\s*$/i);
          if (tf) { timeframe = tf[1].replace(/\.$/, ""); continue; }
          const bd = line.match(/^Budget:\s*(.+?)\.?\s*$/i);
          if (bd) { budget = bd[1].replace(/\.$/, ""); continue; }
          const mt = line.match(/^Materials:\s*(.+?)\.?\s*$/i);
          if (mt) { materials = mt[1].replace(/\.$/, ""); continue; }
          const ac = line.match(/^Access:\s*(.+?)\.?\s*$/i);
          if (ac) { access = ac[1].replace(/\.$/, ""); continue; }
          noteLines.push(line);
        }

        setForm({
          category: inferredCategory,
          selectedTypes: primaryType ? [primaryType] : [],
          otherEnabled: false,
          otherText: "",
          location: p.location ?? "",
          propertyType: p.propertyType ?? "",
          bedrooms: Number(p.bedrooms ?? 0),
          timeframe: TIMEFRAMES.includes(timeframe) ? timeframe : "",
          budget: BUDGETS.includes(budget) ? budget : "",
          materials: MATERIALS_OPTIONS.includes(materials) ? materials : "",
          access: ACCESS_OPTIONS.includes(access) ? access : "",
          description: noteLines.join("\n"),
          answers: loadedAnswers,
        });
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status;
        const message = e?.data?.error || e?.response?.data?.error || e?.message || "";
        if (status === 401 || /bearer token/i.test(String(message))) {
          setLoadErr("You need to sign in again to edit this project.");
        } else {
          setLoadErr("Failed to load project.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [api, id, router.isReady, authLoading, user]);

  /* ===== Derived ===== */

  const CATEGORY_OPTIONS = useMemo(
    () => [...PROJECT_TYPES].map((c) => c.category).sort((a, b) => a.localeCompare(b)),
    [],
  );

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return CATEGORY_OPTIONS;
    const q = categorySearch.toLowerCase();
    return CATEGORY_OPTIONS.filter((c) => c.toLowerCase().includes(q));
  }, [CATEGORY_OPTIONS, categorySearch]);

  const SUBTYPE_OPTIONS = useMemo(() => {
    if (!form?.category) return [] as string[];
    const bucket = PROJECT_TYPES.find((c: ProjectTypeCategory) => c.category === form.category);
    return bucket ? [...bucket.types].sort((a, b) => a.localeCompare(b)) : [];
  }, [form?.category]);

  const filteredSubtypes = useMemo(() => {
    if (!subtypeSearch.trim()) return SUBTYPE_OPTIONS;
    const q = subtypeSearch.toLowerCase();
    return SUBTYPE_OPTIONS.filter((t) => t.toLowerCase().includes(q));
  }, [SUBTYPE_OPTIONS, subtypeSearch]);

  const categorySpec = useMemo(
    () => getSpecForSelection(form?.selectedTypes ?? null),
    [form?.selectedTypes],
  );

  const STEPS = useMemo(() => {
    const base: Array<{ key: string; title: string; subtitle: string }> = [
      { key: "category", title: "What do you need done?", subtitle: "Pick a category to get started." },
      { key: "subtypes", title: form?.category ? `What type of ${(form.category || "").toLowerCase()} work?` : "Type of work", subtitle: "Select all that apply." },
      { key: "propertyType", title: "What type of property?", subtitle: "This helps tradespeople prepare an accurate quote." },
      { key: "bedrooms", title: "How many bedrooms?", subtitle: "Helps tradespeople estimate the size of the job." },
    ];
    const details = categorySpec
      ? [{ key: "details", title: categorySpec.groups[0].title, subtitle: "These details help us match you with the right tradesperson." }]
      : [];
    return [
      ...base,
      ...details,
      { key: "extras", title: "A few more details", subtitle: "These help tradespeople give you an accurate quote." },
      { key: "description", title: "Describe the job", subtitle: "Add any extra details." },
      { key: "review", title: "Review your changes", subtitle: "Check everything looks right before saving." },
    ];
  }, [categorySpec, form?.category]);

  const maxStep = STEPS.length - 1;

  function hasAnySubtype(): boolean {
    if (!form) return false;
    return form.selectedTypes.length > 0 || (form.otherEnabled && form.otherText.trim().length >= 2);
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
    const key = STEPS[idx].key;
    switch (key) {
      case "category": return !!form.category;
      case "subtypes": return hasAnySubtype();
      case "propertyType": return !!form.propertyType.trim();
      case "bedrooms": return Number(form.bedrooms) >= 0;
      case "details": return Object.keys(detailsStepErrors()).length === 0;
      case "extras": return true;
      case "description": return true;
      case "review": return hasAnySubtype() && !!form.propertyType.trim() && Object.keys(detailsStepErrors()).length === 0;
      default: return true;
    }
  }

  const next = () => {
    if (step >= maxStep) return;
    if (STEPS[step].key === "details") {
      const errs = detailsStepErrors();
      if (Object.keys(errs).length > 0) { setAnswerErrors(errs); return; }
      setAnswerErrors({});
    }
    if (isStepValid(step)) { setFormErr(null); setStep((s) => s + 1); }
  };

  const back = () => { setFormErr(null); setStep((s) => Math.max(0, s - 1)); };

  const goToStep = (idx: number) => { if (idx < step) { setFormErr(null); setStep(idx); } };

  function toggleSubtype(label: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const exists = prev.selectedTypes.some((t) => t.toLowerCase() === label.toLowerCase());
      const next = exists
        ? prev.selectedTypes.filter((t) => t.toLowerCase() !== label.toLowerCase())
        : [...prev.selectedTypes, label];
      return { ...prev, selectedTypes: next };
    });
  }

  async function onSave() {
    if (!form || !isStepValid(maxStep)) return;
    setBusy(true);
    setFormErr(null);
    try {
      const primaryType = form.selectedTypes[0] || normalize(form.otherText || "General work");
      const autoName = buildAutoNameSimple(primaryType, form.location, form.propertyType);
      const hasAnswers = !!categorySpec && Object.keys(form.answers).some((k) => k !== "_version");

      const descLines: string[] = [];
      if (form.timeframe) descLines.push(`Timeframe: ${form.timeframe}.`);
      if (form.budget) descLines.push(`Budget: ${form.budget}.`);
      if (form.materials) descLines.push(`Materials: ${form.materials}.`);
      if (form.access) descLines.push(`Access: ${form.access}.`);
      if (form.description.trim()) descLines.push(form.description.trim());
      const fullDescription = normalize(descLines.join("\n"));

      const payload = {
        name: autoName,
        type: primaryType,
        location: form.location,
        description: fullDescription,
        propertyType: form.propertyType,
        bedrooms: Number(form.bedrooms) || 0,
        answers: hasAnswers ? form.answers : null,
      };

      const { data } = await api.put(`/api/projects/${id}`, payload);
      router.replace(`/projects/${data.project.id}`);
    } catch (e: any) {
      setFormErr(e?.response?.data?.error || e?.data?.error || e?.message || "Failed to update");
      setBusy(false);
    }
  }

  const primaryPreview = (form?.selectedTypes[0] || "") || (form?.otherEnabled ? form?.otherText.trim() : "") || "";
  const reviewAutoName = buildAutoNameSimple(primaryPreview || "Project", form?.location || "", form?.propertyType || "");

  /* ===== Render ===== */

  if (authLoading || loading) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-zinc-500" data-testid="project-edit-loading">Loading...</div>;
  }
  if (loadErr) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10" data-testid="project-edit-error">
        <p className="text-red-600 text-sm" data-testid="project-edit-error-message">{loadErr}</p>
        <Link href="/login" className="btn mt-3" data-testid="btn-go-to-sign-in">Go to sign in</Link>
      </div>
    );
  }
  if (!form) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-zinc-500">Project not found.</div>;
  }

  const currentStep = STEPS[step];

  return (
    <>
      <Head><title>Edit Project — VetMyBuilder</title></Head>
      <div className="relative min-h-screen overflow-hidden" data-testid="project-edit-page">
        <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-20 pb-8">
          <div className="relative w-full overflow-hidden rounded-3xl bg-white shadow-xl shadow-zinc-200/60" data-testid="wizard-edit">

            {/* Progress segments */}
            <div className="flex items-center gap-1.5 px-6 pt-6 sm:px-10 sm:pt-8">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { if (i < step) goToStep(i); }}
                  className={`h-2 rounded-full transition-all duration-300 flex-1 ${
                    i < step ? "bg-green-500 cursor-pointer hover:bg-green-400" : i === step ? "bg-amber-500 cursor-default" : "bg-zinc-200 cursor-default"
                  }`}
                  disabled={i >= step}
                />
              ))}
            </div>

            {/* Content */}
            <div className="px-6 py-6 sm:px-10 sm:py-10 min-h-[28rem] flex flex-col items-center text-center relative">

              {/* Close button */}
              <button
                type="button"
                onClick={() => router.push(`/projects/${id}`)}
                className="absolute top-1 right-1 sm:top-2 sm:right-2 w-8 h-8 rounded-full border-2 border-zinc-200 bg-white text-zinc-400 hover:text-zinc-900 hover:border-zinc-300 flex items-center justify-center text-sm transition-colors"
                aria-label="Cancel"
                data-testid="btn-cancel"
              >
                &#10005;
              </button>

              <div className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2">
                Step {step + 1} of {STEPS.length}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-1" data-testid="step-title">
                {currentStep.title}
              </h2>
              <p className="text-sm text-zinc-500 mb-8">{currentStep.subtitle}</p>

              {/* ===== CATEGORY ===== */}
              {currentStep.key === "category" && (
                <div className="max-w-lg w-full" data-testid="field-category-edit">
                  <div className="relative mb-5">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">&#128269;</span>
                    <input
                      type="text"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-zinc-200 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none transition-colors"
                      placeholder="Search categories..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {filteredCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          const changed = form.category !== cat;
                          set("category", cat);
                          if (changed) {
                            set("selectedTypes", []);
                            set("otherEnabled", false);
                            set("otherText", "");
                          }
                          setSubtypeSearch("");
                          setTimeout(() => setStep((s) => s + 1), 150);
                        }}
                        className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all text-center ${
                          form.category === cat
                            ? "border-amber-500 bg-amber-50"
                            : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                        }`}
                        data-testid={`category-${cat}`}
                      >
                        <span className="text-2xl">{CATEGORY_ICONS[cat] || "\u{1F3E0}"}</span>
                        <span className="text-xs font-semibold text-zinc-700 leading-tight">{cat}</span>
                      </button>
                    ))}
                    {filteredCategories.length === 0 && categorySearch && (
                      <p className="col-span-3 text-sm text-zinc-400 text-center py-4">No categories match &ldquo;{categorySearch}&rdquo;</p>
                    )}
                  </div>
                </div>
              )}

              {/* ===== SUBTYPES ===== */}
              {currentStep.key === "subtypes" && (
                <div className="max-w-lg w-full" data-testid="field-subtypes-edit">
                  {SUBTYPE_OPTIONS.length > 6 && (
                    <div className="relative mb-5">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">&#128269;</span>
                      <input
                        type="text"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-zinc-200 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none transition-colors"
                        placeholder="Search work types..."
                        value={subtypeSearch}
                        onChange={(e) => setSubtypeSearch(e.target.value)}
                      />
                    </div>
                  )}
                  {form.selectedTypes.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center mb-4">
                      {form.selectedTypes.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 border-2 border-amber-500 text-amber-800">
                          {t}
                          <button type="button" onClick={() => toggleSubtype(t)} className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">x</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {filteredSubtypes.map((t) => {
                      const checked = form.selectedTypes.some((x) => x.toLowerCase() === t.toLowerCase());
                      return (
                        <button key={t} type="button" onClick={() => toggleSubtype(t)}
                          className={`flex items-center gap-2.5 px-4 h-12 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                            checked ? "border-amber-500 bg-amber-50 text-amber-800" : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                          }`}>
                          <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 text-[10px] font-bold ${checked ? "bg-amber-500 border-amber-500 text-white" : "border-zinc-300"}`}>
                            {checked && "\u2713"}
                          </span>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ===== PROPERTY TYPE ===== */}
              {currentStep.key === "propertyType" && (
                <div className="grid grid-cols-2 gap-3 max-w-md w-full">
                  {PROPERTY_TYPES.map((pt) => (
                    <button key={pt.label} type="button"
                      onClick={() => { set("propertyType", pt.label); setTimeout(() => setStep((s) => s + 1), 150); }}
                      className={`flex items-center gap-3 px-4 h-14 rounded-2xl border-2 text-left transition-all ${
                        form.propertyType === pt.label ? "border-amber-500 bg-amber-50" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                      }`}
                      data-testid={`property-${pt.label}`}>
                      <span className="text-xl">{pt.icon}</span>
                      <span className="text-sm font-semibold text-zinc-700">{pt.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* ===== BEDROOMS ===== */}
              {currentStep.key === "bedrooms" && (
                <div className="flex gap-3 justify-center" data-testid="field-bedrooms-edit">
                  {BEDROOM_OPTIONS.map((b) => {
                    const numVal = b.endsWith("+") ? parseInt(b, 10) : parseInt(b, 10);
                    const selected = form.bedrooms === numVal;
                    return (
                      <button key={b} type="button"
                        onClick={() => { set("bedrooms", numVal); setTimeout(() => setStep((s) => s + 1), 150); }}
                        className={`w-14 h-14 rounded-2xl border-2 text-lg font-bold transition-all ${
                          selected ? "border-amber-500 bg-amber-50 text-amber-800" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                        }`}
                        data-testid={`beds-${b}`}>{b}</button>
                    );
                  })}
                </div>
              )}

              {/* ===== DETAILS ===== */}
              {currentStep.key === "details" && categorySpec && (
                <div className="max-w-md w-full text-left space-y-6">
                  {categorySpec.groups.map((g) => (
                    <DynamicFieldGroup key={g.id} group={g} value={form.answers} onChange={(a) => set("answers", a)} errors={answerErrors} />
                  ))}
                </div>
              )}

              {/* ===== EXTRAS ===== */}
              {currentStep.key === "extras" && (
                <div className="max-w-lg w-full text-left space-y-8">
                  <div>
                    <div className="text-sm font-semibold text-zinc-700 mb-3">When do you need this done?</div>
                    <div className="grid grid-cols-2 gap-2" data-testid="field-timeframe">
                      {TIMEFRAMES.map((t) => (
                        <button key={t} type="button" onClick={() => set("timeframe", form.timeframe === t ? "" : t)}
                          className={`px-4 h-11 rounded-xl border-2 text-sm font-medium transition-all ${form.timeframe === t ? "border-amber-500 bg-amber-50 text-amber-800" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-700 mb-3">What is your budget?</div>
                    <div className="grid grid-cols-3 gap-2" data-testid="field-budget">
                      {BUDGETS.map((b) => (
                        <button key={b} type="button" onClick={() => set("budget", form.budget === b ? "" : b)}
                          className={`px-4 h-11 rounded-xl border-2 text-sm font-medium transition-all ${form.budget === b ? "border-amber-500 bg-amber-50 text-amber-800" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>{b}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-700 mb-3">Who is supplying materials?</div>
                    <div className="grid grid-cols-2 gap-2" data-testid="field-materials">
                      {MATERIALS_OPTIONS.map((m) => (
                        <button key={m} type="button" onClick={() => set("materials", form.materials === m ? "" : m)}
                          className={`px-4 h-11 rounded-xl border-2 text-sm font-medium transition-all ${form.materials === m ? "border-amber-500 bg-amber-50 text-amber-800" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>{m}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-700 mb-3">Access and parking</div>
                    <div className="grid grid-cols-2 gap-2" data-testid="field-access">
                      {ACCESS_OPTIONS.map((a) => (
                        <button key={a} type="button" onClick={() => set("access", form.access === a ? "" : a)}
                          className={`px-4 h-11 rounded-xl border-2 text-sm font-medium transition-all ${form.access === a ? "border-amber-500 bg-amber-50 text-amber-800" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>{a}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ===== DESCRIPTION ===== */}
              {currentStep.key === "description" && (
                <div className="max-w-lg w-full">
                  <textarea
                    className="w-full min-h-[160px] p-4 rounded-2xl border-2 border-zinc-200 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none transition-colors resize-vertical leading-relaxed"
                    placeholder="Any extra details for tradespeople..."
                    value={form.description}
                    maxLength={200}
                    onChange={(e) => set("description", e.target.value)}
                    data-testid="field-description"
                  />
                  <div className={`text-right text-xs mt-1.5 ${form.description.length >= 200 ? "text-red-500 font-semibold" : "text-zinc-400"}`}>
                    {form.description.length} / 200
                  </div>
                </div>
              )}

              {/* ===== REVIEW ===== */}
              {currentStep.key === "review" && (
                <div className="max-w-lg w-full text-left space-y-0" data-testid="review-edit">
                  <ReviewSection label="Category" value={form.category || ""} onEdit={() => goToStep(0)} />
                  <ReviewSection label="Type of work" value={form.selectedTypes.join(", ")} onEdit={() => goToStep(1)} />
                  <ReviewSection label="Location" value={form.location} />
                  <ReviewSection label="Property" value={`${form.propertyType}, ${form.bedrooms} bedroom${form.bedrooms !== 1 ? "s" : ""}`} onEdit={() => goToStep(2)} />
                  <ReviewSection
                    label="Details"
                    value={[form.timeframe, form.budget ? `Budget: ${form.budget}` : "", form.materials, form.access].filter(Boolean).join(" \u2022 ")}
                    onEdit={() => { const i = STEPS.findIndex((s) => s.key === "extras"); if (i >= 0) goToStep(i); }}
                  />
                  <ReviewSection
                    label="Description"
                    value={form.description}
                    onEdit={() => { const i = STEPS.findIndex((s) => s.key === "description"); if (i >= 0) goToStep(i); }}
                    last
                  />
                </div>
              )}
            </div>

            {/* Error */}
            {formErr && (
              <p className="px-6 sm:px-10 -mt-4 pb-2 text-sm text-red-500 font-medium text-center" role="alert" data-testid="edit-error">{formErr}</p>
            )}

            {/* Bottom nav */}
            <div className="flex items-center justify-between px-6 pb-6 sm:px-10 sm:pb-8">
              {step > 0 ? (
                <button type="button" onClick={back} disabled={busy}
                  className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl border-2 border-zinc-200 text-xs sm:text-sm font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-40 transition-all"
                  data-testid="btn-prev">
                  &#8592; Previous
                </button>
              ) : <div />}

              {step < maxStep ? (
                <button type="button" onClick={next} disabled={!isStepValid(step) || busy}
                  className="inline-flex items-center gap-1 px-5 py-2.5 rounded-xl bg-amber-500 text-xs sm:text-sm font-bold text-white shadow-lg shadow-amber-500/25 hover:bg-amber-600 disabled:opacity-40 disabled:shadow-none transition-all"
                  data-testid="wizard-next-edit">
                  Continue &#8594;
                </button>
              ) : (
                <button type="button" onClick={onSave} disabled={!isStepValid(step) || busy}
                  className={`inline-flex items-center gap-1 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-lg transition-all ${
                    busy ? "bg-zinc-400 cursor-not-allowed shadow-none" : "bg-green-500 shadow-green-500/25 hover:bg-green-600"
                  } disabled:opacity-40 disabled:shadow-none`}
                  data-testid="wizard-save-edit">
                  {busy && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>}
                  {busy ? "Saving..." : "Save changes \u2192"}
                </button>
              )}
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 pb-6">
              {STEPS.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-5 bg-amber-500" : i < step ? "w-1.5 bg-green-500" : "w-1.5 bg-zinc-200"
                }`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ReviewSection({ label, value, onEdit, last }: { label: string; value: string; onEdit?: () => void; last?: boolean }) {
  return (
    <div className={`flex items-start justify-between py-4 ${last ? "" : "border-b border-zinc-100"}`}>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">{label}</div>
        <div className="text-sm font-medium text-zinc-900">{value || "\u2014"}</div>
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="text-xs font-semibold text-amber-500 hover:text-amber-600 ml-4 flex-shrink-0 mt-0.5">Edit</button>
      )}
    </div>
  );
}
