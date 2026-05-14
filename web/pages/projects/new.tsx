import Head from "next/head";
import Layout from "@/components/Layout";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import PreviewMatchesPanel from "@/components/project/PreviewMatchesPanel";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { PROJECT_TYPES, type ProjectTypeCategory } from "@/types/projectTypes";
import LocationField from "@/components/forms/LocationField";
import PilotAreasBanner from "@/components/PilotAreasBanner";
import { trackProjectCreated } from "@/utils/analytics";
import DynamicFieldGroup, {
  validateGroup,
} from "@/components/forms/DynamicFieldGroup";
import { getSpecForSelection, type AnswersShape } from "@/config/jobFields";
import PostJobMobile from "@/components/project/PostJobMobile";
import MatchShuffleAnimation from "@/components/project/MatchShuffleAnimation";

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

/* ===== Constants & helpers ===== */

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

type AccessChip = { label: string; value: string };

const INSULATION_ACCESS_CHIPS: AccessChip[] = [
  { label: "Side access available", value: "side_access_available" },
  { label: "Narrow side access (<800mm)", value: "narrow_side_access" },
  { label: "Rear access available", value: "rear_access_available" },
  { label: "No rear access", value: "no_rear_access" },
  { label: "Scaffolding required", value: "scaffolding_required" },
  { label: "Scaffolding already present", value: "scaffolding_present" },
  { label: "Loft easy to access", value: "loft_easy" },
  { label: "Restricted loft height", value: "loft_restricted" },
  { label: "Boarded loft", value: "loft_boarded" },
  { label: "Small loft hatch", value: "small_loft_hatch" },
  { label: "Parking close to property", value: "parking_close" },
  { label: "Long hose needed (no close parking)", value: "long_hose_needed" },
  { label: "Asbestos suspected", value: "asbestos_suspected" },
  { label: "Waste removal needed", value: "waste_removal" },
];

const CONSTRUCTION_ACCESS_CHIPS: AccessChip[] = [
  { label: "Skip can be placed on driveway", value: "skip_driveway" },
  { label: "Skip must be placed on road", value: "skip_road" },
  { label: "Scaffolding required", value: "scaffolding_required" },
  { label: "Rear access available", value: "rear_access" },
  { label: "No rear access", value: "no_rear_access" },
  { label: "Parking available", value: "parking_available" },
  { label: "Permit required", value: "permit_required" },
];

const GENERAL_ACCESS_CHIPS: AccessChip[] = [
  { label: "Easy access", value: "easy_access" },
  { label: "Restricted access", value: "restricted_access" },
  { label: "Parking available", value: "parking_available" },
  { label: "Street parking only", value: "street_parking" },
  { label: "Permit required", value: "permit_required" },
  { label: "Pets at home", value: "pets" },
  { label: "Someone home to let in", value: "someone_home" },
  { label: "Keys can be left", value: "keys_left" },
];

function getAccessChips(category: string | null | undefined): AccessChip[] {
  if (!category) return GENERAL_ACCESS_CHIPS;
  if (category === "Insulation") return INSULATION_ACCESS_CHIPS;
  if (
    category === "Extensions & Conversions" ||
    category === "Roofing" ||
    category === "Exterior & Structure" ||
    category === "Masonry & Structural"
  ) return CONSTRUCTION_ACCESS_CHIPS;
  return GENERAL_ACCESS_CHIPS;
}

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
export type PreviewMatch = {
  id: string;
  company: string;
  trade: string | null;
  location: string | null;
  rating: number | null;
  reviewCount: number;
  friendCount: number;
  photoUrl: string | null;
  blurb: string | null;
  isLocal: boolean;
};

type FormShape = {
  category: string | null;
  selectedTypes: string[];
  otherEnabled: boolean;
  otherText: string;

  location: string;
  locationDisplay: string;
  // Outward code from a confirmed LocationField pick (autocomplete or
  // typed-then-resolved). Empty string until the user confirms a real
  // postcode - prevents Continue at the location step on raw typing
  // (e.g. "SW10" without selecting from the dropdown). Server gate is
  // belt-and-braces; this is the user-facing block.
  locationOutward: string;
  propertyType: string;
  bedrooms: number;

  timeframe: string;
  budget: string;
  materials: string;
  access: string[];
  description: string;

  answers: AnswersShape;
};

export default function NewProject() {
  const api = useApi();
  const router = useRouter();
  const { user, loading } = useAuth();

  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { setRoleChecked(true); return; }
    api.get("/api/tradesmen/me").then((res: any) => {
      const data = res?.data ?? res;
      const role = String(data?.role || "user").toLowerCase();
      if (role === "tradesman" || !!data?.profile) {
        router.replace("/tradesman/jobs");
      } else {
        setRoleChecked(true);
      }
    }).catch(() => { setRoleChecked(true); });
  }, [loading, user, router, api]);

  const [form, setForm] = useState<FormShape>({
    category: null,
    selectedTypes: [],
    otherEnabled: false,
    otherText: "",

    location: "",
    locationDisplay: "",
    locationOutward: "",
    propertyType: "",
    bedrooms: 0,

    timeframe: "",
    budget: "",
    materials: "",
    access: [],
    description: "",

    answers: { _version: 1 },
  });

  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});
  const [subtypeSearch, setSubtypeSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");

  // Preview-step matches (engagement-first signup): fetched when the
  // homeowner reaches the final preview step.
  const [previewMatches, setPreviewMatches] = useState<PreviewMatch[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  // Desktop post-job flow: once the user hits "Post your job" the wizard
  // swaps the preview step content for a shuffle animation while the
  // create call is in flight, then reveals the same 3 matches with a
  // single "View tradespeople" CTA into the project's swipe deck.
  // Mobile keeps the PostJobMobile redirect-on-success flow.
  const [matchingPhase, setMatchingPhase] = useState<
    "idle" | "shuffling" | "revealed"
  >("idle");
  const [shuffleSettled, setShuffleSettled] = useState(false);
  // Track whether the in-flight shuffle was kicked off by a guest. Guests
  // can't POST a project until they've signed up, so their revealed-state
  // button routes to /signup instead of a project id. A ref (not state)
  // so flipping it doesn't force a re-render mid-shuffle.
  const guestFlowRef = useRef(false);
  useEffect(() => {
    if (matchingPhase !== "shuffling") return;
    if (!shuffleSettled) return;
    // POST is deferred for both paths: guests do it post-signup
    // (flushPendingProject); authed users do it on the "View
    // tradespeople" click (commitAndView). So the shuffle settling is
    // the only gate for entering the revealed state.
    setMatchingPhase("revealed");
  }, [matchingPhase, shuffleSettled]);

  // Auto-trigger the shuffle the moment the homeowner lands on the
  // preview step (after Continue on Review). The static "3 cards visible
  // immediately" intermediate state is gone - they go straight from
  // Review -> shuffle -> reveal.
  // Guard: only fire once per visit. The creatingRef inside onCreate
  // also prevents double-fires from a re-render mid-shuffle.
  // NOTE: this useEffect must live AFTER `STEPS` is declared further
  // down (TDZ would throw at render time otherwise).
  const previewAutoFiredRef = useRef(false);
  // LocationField reports pilot-area validity here. When non-null, the
  // postcode the user typed is outside the pilot and we block Continue
  // on the location step.
  const [locationPilotErr, setLocationPilotErr] = useState<string | null>(null);

  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

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

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return CATEGORY_OPTIONS;
    const q = categorySearch.toLowerCase();
    return CATEGORY_OPTIONS.filter((c) => c.toLowerCase().includes(q));
  }, [CATEGORY_OPTIONS, categorySearch]);

  const filteredSubtypes = useMemo(() => {
    if (!subtypeSearch.trim()) return SUBTYPE_OPTIONS;
    const q = subtypeSearch.toLowerCase();
    return SUBTYPE_OPTIONS.filter((t) => t.toLowerCase().includes(q));
  }, [SUBTYPE_OPTIONS, subtypeSearch]);

  /* ===== Steps ===== */

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
    const base: Array<{ key: string; title: string; subtitle: string }> = [
      { key: "category", title: "What do you need done?", subtitle: "Pick a category to get started." },
      { key: "subtypes", title: form.category ? `What type of ${(form.category || "").toLowerCase()} work?` : "Type of work", subtitle: "Select all that apply." },
      { key: "location", title: "Where is the job?", subtitle: "Enter a postcode or area name." },
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
      { key: "description", title: "Describe the job", subtitle: "Add any details that will help tradespeople understand what you need." },
      { key: "review", title: "Review your job", subtitle: "Check everything looks right before posting." },
      { key: "preview", title: "Your local matches", subtitle: "We've found tradespeople who can do this job." },
    ];
  }, [categorySpec, form.category]);

  const maxStep = STEPS.length - 1;

  // Auto-trigger the shuffle the moment the homeowner lands on the
  // preview step (after Continue on Review). No "3 cards visible
  // immediately" intermediate state - they go straight from Review ->
  // shuffle -> reveal. Lives here (rather than next to the other
  // matchingPhase effects above) because it reads STEPS, which is
  // declared just above.
  useEffect(() => {
    if (STEPS[step]?.key !== "preview") {
      previewAutoFiredRef.current = false;
      return;
    }
    if (previewAutoFiredRef.current) return;
    if (matchingPhase !== "idle") return;
    previewAutoFiredRef.current = true;
    onCreate();
    // onCreate is stable on a ref-protected creatingRef; suppress
    // exhaustive-deps so the auto-trigger doesn't re-fire just because
    // onCreate's identity changes between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, STEPS, matchingPhase]);

  // Fetch preview matches the first time the homeowner reaches the
  // preview step. We pass the wizard's current trade type + location as
  // query params; the API filters live tradesmen and pads with nearby
  // when local supply is thin (see preview-matches.get.js).
  useEffect(() => {
    if (STEPS[step]?.key !== "preview") return;
    if (previewMatches !== null || previewLoading) return;

    const primaryType =
      form.selectedTypes[0] ||
      (form.otherEnabled ? form.otherText.trim() : "") ||
      form.category ||
      "";
    if (!primaryType) {
      setPreviewMatches([]);
      return;
    }

    setPreviewLoading(true);
    setPreviewErr(null);
    const qs = new URLSearchParams({
      type: primaryType,
      ...(form.location ? { location: form.location } : {}),
    }).toString();

    api
      .get<{ items: PreviewMatch[] }>(`/api/projects/preview-matches?${qs}`)
      .then((res: any) => {
        const data = res?.data ?? res;
        setPreviewMatches(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((e: any) => {
        setPreviewErr(e?.message || "Failed to load matches");
        setPreviewMatches([]);
      })
      .finally(() => setPreviewLoading(false));
  }, [STEPS, step, previewMatches, previewLoading, form.selectedTypes, form.otherEnabled, form.otherText, form.category, form.location, api]);

  // Auth-aware + match-aware submit text. Guest with matches sees "Sign
  // up to message them" so the value of signing up stays visible at the
  // action moment. Guest with no matches sees "Sign up to post your job"
  // (no point selling a message they can't send to nobody). Authed users
  // always see "Post your job".
  const isPreviewStep = STEPS[step]?.key === "preview";
  const hasPreviewMatches = (previewMatches?.length || 0) > 0;
  const submitText = !user
    ? hasPreviewMatches
      ? "Sign up to message them"
      : "Sign up to post your job"
    : "Post your job";

  // Override the preview step's title + subtitle when we found nothing -
  // the default copy ("Your local matches" / "We've found tradespeople...")
  // is misleading when matches.length === 0.
  function previewStepTitle(): string {
    if (!isPreviewStep) return STEPS[step].title;
    if (previewLoading) return "Your local matches";
    if (hasPreviewMatches) return "Your local matches";
    return "We're still looking";
  }
  function previewStepSubtitle(): string {
    if (!isPreviewStep) return STEPS[step].subtitle;
    if (previewLoading) return "Finding tradespeople in your area...";
    if (hasPreviewMatches) return "Tradespeople nearby who can do this job.";
    return "No local trades for this job just yet - we'll notify you when one's a fit.";
  }

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
        // Continue requires text AND (when LocationField has flagged the
        // typed postcode as outside the pilot) no active pilot error.
        // The server is still the source of truth - this client gate
        // just avoids the user hitting Continue with a clearly invalid
        // postcode while the "Not in our area yet" alert is on screen.
        return !!form.location.trim() && !locationPilotErr;
      case "propertyType":
        return !!form.propertyType.trim();
      case "bedrooms":
        return Number(form.bedrooms) >= 0;
      case "details":
        return Object.keys(detailsStepErrors()).length === 0;
      case "extras":
        return true;
      case "description":
        return true;
      case "review":
        return (
          !!form.category &&
          hasAnySubtype() &&
          !!form.location.trim() &&
          !!form.propertyType.trim() &&
          Object.keys(detailsStepErrors()).length === 0
        );
      case "preview":
        return true;
      default:
        return true;
    }
  }

  /* ===== Navigation ===== */

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
      setErr(null);
      setStep((s) => s + 1);
    }
  };

  const back = () => {
    if (step === 0) return;
    setErr(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const goToStep = (idx: number) => {
    if (idx < step) {
      setErr(null);
      setStep(idx);
    }
  };

  /* ===== Submit ===== */

  // Holds the built payload from onCreate while the shuffle plays so
  // commitAndView (authed "View tradespeople" click) can POST it without
  // re-deriving the form. Stored on a ref so it survives renders without
  // triggering re-shuffles when set.
  const authedPayloadRef = useRef<Record<string, unknown> | null>(null);
  const creatingRef = useRef(false);

  /**
   * Build the payload + kick off the shuffle. Does NOT POST.
   * - Guest: payload is stashed in sessionStorage for SignupForm to flush
   *   after auth; revealed-state CTA routes to /signup.
   * - Authed: payload is held in `authedPayloadRef`; revealed-state CTA
   *   ("View tradespeople") triggers commitAndView which actually POSTs.
   *
   * Deferring the POST until the button click means there's no race
   * between the shuffle ending and the POST returning - the homeowner
   * physically clicks the button to commit, then we await the response
   * before redirecting.
   */
  function onCreate() {
    if (!isStepValid(maxStep)) return;

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

    const descLines: string[] = [];
    if (form.timeframe) descLines.push(`Timeframe: ${form.timeframe}.`);
    if (form.budget) descLines.push(`Budget: ${form.budget}.`);
    if (form.materials) descLines.push(`Materials: ${form.materials}.`);
    if (form.access.length > 0) {
      const accessChips = getAccessChips(form.category);
      const labels = form.access.map((v) => {
        const chip = accessChips.find((c) => c.value === v);
        return chip ? chip.label : v;
      });
      descLines.push(`Access: ${labels.join(", ")}.`);
    }
    if (form.description.trim()) descLines.push(form.description.trim());
    const fullDescription = normalize(descLines.join("\n") + descExtras);

    const payload: Record<string, unknown> = {
      name: autoName,
      type: primaryType,
      location: form.location,
      description: fullDescription,
      propertyType: form.propertyType,
      bedrooms: Number(form.bedrooms) || 0,
      ...(hasAnswers ? { answers: form.answers } : {}),
    };

    if (!user) {
      try {
        sessionStorage.setItem(
          "vmb:pendingProjectPayload",
          JSON.stringify(payload),
        );
        sessionStorage.setItem("vmb:returnTo", "/projects");
      } catch {}
      guestFlowRef.current = true;
      authedPayloadRef.current = null;
    } else {
      guestFlowRef.current = false;
      authedPayloadRef.current = payload;
    }

    setErr(null);
    setMatchingPhase("shuffling");
    setShuffleSettled(false);
  }

  /**
   * Authed-user click handler for "View tradespeople". POSTs the project
   * the wizard built, then routes to its swipe deck. Button is disabled
   * while in flight so a second click can't fire the POST twice.
   */
  async function commitAndView() {
    if (creatingRef.current) return;
    const payload = authedPayloadRef.current;
    if (!payload) {
      setErr("Couldn't find your job details. Please go back and try again.");
      return;
    }
    creatingRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post("/api/projects", payload);
      trackProjectCreated(data.project.id, (payload as { type: string }).type);
      router.replace(`/projects/${data.project.id}?justCreated=1`);
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.error === "location_not_in_pilot") {
        setErr(data?.message || "We're not in your area yet.");
      } else {
        setErr(data?.message || data?.error || "Failed to create");
      }
      creatingRef.current = false;
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

  /* ===== Preview ===== */

  const primaryPreview =
    form.selectedTypes[0] || (form.otherEnabled ? form.otherText.trim() : "");

  const reviewAutoName = buildAutoNameSimple(
    primaryPreview || "Project",
    form.location,
    form.propertyType,
  );

  /* ===== Render ===== */

  if (!roleChecked) return null;

  const currentStep = STEPS[step];

  return (
    <>
      <Head>
        <title>Post a Job — VetMyBuilder</title>
      </Head>

      {/* MOBILE — bare, app-like wizard */}
      <div className="md:hidden">
        <PostJobMobile
          form={form}
          set={set as any}
          setForm={setForm}
          step={step}
          setStep={setStep}
          STEPS={STEPS}
          currentStep={currentStep}
          isStepValid={isStepValid}
          goNext={next}
          goBack={back}
          goToStep={goToStep}
          submit={onCreate}
          busy={busy}
          err={err}
          filteredCategories={filteredCategories}
          filteredSubtypes={filteredSubtypes}
          SUBTYPE_OPTIONS={SUBTYPE_OPTIONS}
          toggleSubtype={toggleSubtype}
          categorySearch={categorySearch}
          setCategorySearch={setCategorySearch}
          subtypeSearch={subtypeSearch}
          setSubtypeSearch={setSubtypeSearch}
          categorySpec={categorySpec}
          answerErrors={answerErrors}
          CATEGORY_ICONS={CATEGORY_ICONS}
          PROPERTY_TYPES={PROPERTY_TYPES}
          BEDROOM_OPTIONS={BEDROOM_OPTIONS}
          TIMEFRAMES={TIMEFRAMES}
          BUDGETS={BUDGETS}
          MATERIALS_OPTIONS={MATERIALS_OPTIONS}
          getAccessChips={getAccessChips}
          normalize={normalize}
          previewMatches={previewMatches}
          previewLoading={previewLoading}
          previewErr={previewErr}
          isGuest={!user}
          submitLabel={submitText}
          matchingPhase={matchingPhase}
          onShuffleSettled={() => setShuffleSettled(true)}
          guestFlow={!user}
          onCommitAndView={commitAndView}
        />
      </div>

      {/* DESKTOP - wizard on cream backdrop, brand-toned chrome */}
      <div className="hidden md:block" data-testid="wizard-new">
      <Layout>
      <Head>
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>
      <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-12 relative overflow-hidden">
        <BrandWatermarkScatter />
        <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-1 sm:pt-1 pb-8">
          <div className="relative w-full overflow-hidden rounded-3xl bg-white border border-amber-100 shadow-sm">

            {/* Progress dots + step counter. Preview step uses tighter
                top padding so the matches + CTA sit inside the fold. */}
            <div className={`flex items-center gap-1.5 px-6 sm:px-10 ${
              currentStep.key === "preview" ? "pt-4 sm:pt-5" : "pt-6 sm:pt-8"
            }`}>
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { if (i < step) goToStep(i); }}
                  className={`h-2 rounded-full transition-all duration-300 flex-1 ${
                    i < step ? "bg-indigo-600 cursor-pointer hover:bg-indigo-700" : i === step ? "bg-indigo-400 cursor-default" : "bg-zinc-200 cursor-default"
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                  disabled={i >= step}
                />
              ))}
            </div>

            {/* Active step content. On the preview step the matches +
                reveal CTA add up to a tall layout; trim padding + drop
                the min-height so the View tradespeople button sits
                inside the fold on common laptop viewports. */}
            <div className={`px-6 sm:px-10 flex flex-col items-center text-center relative ${
              currentStep.key === "preview"
                ? "py-2 sm:py-3"
                : "py-6 sm:py-10 min-h-[28rem]"
            }`}>

              {/* Close button */}
              <button
                type="button"
                onClick={() => router.push("/projects")}
                className="absolute top-1 right-1 sm:top-2 sm:right-2 w-8 h-8 rounded-full border-2 border-zinc-200 bg-white text-zinc-400 hover:text-zinc-900 hover:border-zinc-300 flex items-center justify-center text-sm transition-colors"
                aria-label="Cancel"
                data-testid="btn-cancel"
              >
                &#10005;
              </button>

              {/* Step counter is redundant on the preview step - the
                  progress bar at the top already shows we're on the
                  final step, and dropping it lets the matches + CTA
                  sit higher in the fold. */}
              {currentStep.key !== "preview" && (
                <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600 mb-2">
                  Step {step + 1} of {STEPS.length}
                </div>
              )}
              <h2
                className={`font-black tracking-tight text-slate-900 mb-1 ${
                  currentStep.key === "preview"
                    ? "text-xl sm:text-2xl"
                    : "text-2xl sm:text-3xl"
                }`}
                style={{ fontFamily: "'Sora', sans-serif" }}
                data-testid="step-title"
              >
                {previewStepTitle()}
              </h2>
              <p className={`text-sm text-slate-500 ${
                currentStep.key === "preview" ? "mb-3" : "mb-8"
              }`}>
                {previewStepSubtitle()}
              </p>

              {/* ===== CATEGORY ===== */}
              {currentStep.key === "category" && (
                <div className="max-w-lg w-full" data-testid="field-category">
                  <div className="relative mb-5">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">&#128269;</span>
                    <input
                      type="text"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-zinc-200 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors"
                      placeholder="Search categories..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      data-testid="category-search"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                  {filteredCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        set("category", cat);
                        set("selectedTypes", []);
                        set("otherEnabled", false);
                        set("otherText", "");
                        setSubtypeSearch("");
                        setTimeout(() => setStep((s) => s + 1), 150);
                      }}
                      aria-pressed={form.category === cat}
                      className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-colors text-center ${
                        form.category === cat
                          ? "border-indigo-500 bg-indigo-50"
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
                <div className="max-w-lg w-full" data-testid="field-subtypes">
                  {!form.category ? (
                    <p className="text-sm text-zinc-400">Pick a category first.</p>
                  ) : (
                    <>
                      {/* Search */}
                      {SUBTYPE_OPTIONS.length > 6 && (
                        <div className="relative mb-5">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">&#128269;</span>
                          <input
                            type="text"
                            className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-zinc-200 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors"
                            placeholder="Search work types..."
                            value={subtypeSearch}
                            onChange={(e) => setSubtypeSearch(e.target.value)}
                            data-testid="subtypes-search"
                          />
                        </div>
                      )}

                      {/* Selected pills */}
                      {form.selectedTypes.length > 0 && (
                        <div className="flex flex-wrap gap-2 justify-center mb-4">
                          {form.selectedTypes.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 border-2 border-indigo-500 text-indigo-700"
                            >
                              {t}
                              <button
                                type="button"
                                onClick={() => toggleSubtype(t)}
                                className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold leading-none"
                              >
                                x
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Chip list */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" id="np-subtypes">
                        {filteredSubtypes.map((t) => {
                          const checked = form.selectedTypes.some(
                            (x) => x.toLowerCase() === t.toLowerCase(),
                          );
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => toggleSubtype(t)}
                              className={`flex items-center gap-2.5 px-4 h-12 rounded-xl border-2 text-sm font-medium transition-colors text-left ${
                                checked
                                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                  : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                              }`}
                            >
                              <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 text-[10px] font-bold ${
                                checked ? "bg-indigo-600 border-indigo-600 text-white" : "border-zinc-300"
                              }`}>
                                {checked && "\u2713"}
                              </span>
                              {t}
                            </button>
                          );
                        })}
                        {filteredSubtypes.length === 0 && subtypeSearch && (
                          <p className="col-span-2 text-sm text-zinc-400 text-center py-4">No matches for &ldquo;{subtypeSearch}&rdquo;</p>
                        )}
                      </div>

                      {/* Other */}
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => set("otherEnabled", !form.otherEnabled)}
                          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                            form.otherEnabled
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                              : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                          }`}
                        >
                          Other...
                        </button>
                        {form.otherEnabled && (
                          <input
                            className="mt-3 w-full rounded-xl border-2 border-zinc-200 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors"
                            placeholder="Describe another type of work"
                            value={form.otherText}
                            onChange={(e) => set("otherText", e.target.value)}
                            data-testid="field-other-text"
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ===== LOCATION ===== */}
              {currentStep.key === "location" && (
                <div className="max-w-sm w-full text-left" data-testid="field-location-wrap">
                  <PilotAreasBanner />
                  <LocationField
                    id="np-location"
                    label=""
                    value={form.location}
                    onChange={(v, meta) => {
                      const upper = v.toUpperCase();
                      set("location", upper);
                      // Prefer the outward from a confirmed pick (meta).
                      // Otherwise extract it from the typed text so the
                      // Continue button doesn't sit disabled while we
                      // wait for an async commit. The server-side pilot
                      // gate is the source of truth either way - if the
                      // typed outward turns out to be unsupported, the
                      // POST is rejected with the friendly message.
                      const fromMeta = meta?.outward
                        ? String(meta.outward).toUpperCase()
                        : "";
                      const fromText = (() => {
                        const m = upper.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
                        return m ? m[1] : "";
                      })();
                      set("locationOutward", fromMeta || fromText);
                    }}
                    onDisplayChange={(display) => set("locationDisplay", display)}
                    onPilotErrChange={setLocationPilotErr}
                    dataTestId="field-location"
                    pilotOnly
                  />
                </div>
              )}

              {/* ===== PROPERTY TYPE ===== */}
              {currentStep.key === "propertyType" && (
                <div className="grid grid-cols-2 gap-3 max-w-md w-full">
                  {PROPERTY_TYPES.map((pt) => (
                    <button
                      key={pt.label}
                      type="button"
                      onClick={() => {
                        set("propertyType", pt.label);
                        setTimeout(() => setStep((s) => s + 1), 150);
                      }}
                      className={`flex items-center gap-3 px-4 h-14 rounded-2xl border-2 text-left transition-colors ${
                        form.propertyType === pt.label
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                      }`}
                      data-testid={`property-${pt.label}`}
                    >
                      <span className="text-xl">{pt.icon}</span>
                      <span className="text-sm font-semibold text-zinc-700">{pt.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* ===== BEDROOMS ===== */}
              {currentStep.key === "bedrooms" && (
                <div className="flex flex-wrap gap-2 sm:gap-3 justify-center" data-testid="field-bedrooms">
                  {BEDROOM_OPTIONS.map((b) => {
                    const numVal = b.endsWith("+") ? parseInt(b, 10) : parseInt(b, 10);
                    const selected = form.bedrooms === numVal;
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => {
                          set("bedrooms", numVal);
                          setTimeout(() => setStep((s) => s + 1), 150);
                        }}
                        className={`w-11 h-11 sm:w-14 sm:h-14 rounded-2xl border-2 text-base sm:text-lg font-bold transition-colors ${
                          selected
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                        }`}
                        data-testid={`beds-${b}`}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ===== CATEGORY-SPECIFIC DETAILS ===== */}
              {currentStep.key === "details" && categorySpec && (
                <div className="max-w-md w-full text-left space-y-6">
                  {categorySpec.groups.map((g) => (
                    <DynamicFieldGroup
                      key={g.id}
                      group={g}
                      value={form.answers}
                      onChange={(nextAnswers) => set("answers", nextAnswers)}
                      errors={answerErrors}
                    />
                  ))}
                </div>
              )}

              {/* ===== EXTRAS (timeframe, budget, materials, access) ===== */}
              {currentStep.key === "extras" && (
                <div className="max-w-lg w-full text-left space-y-8">
                  <div>
                    <div className="text-sm font-semibold text-zinc-700 mb-3">When do you need this done?</div>
                    <div className="grid grid-cols-2 gap-2" data-testid="field-timeframe">
                      {TIMEFRAMES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => set("timeframe", form.timeframe === t ? "" : t)}
                          className={`px-4 h-11 rounded-xl border-2 text-sm font-medium transition-colors ${
                            form.timeframe === t
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                              : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-zinc-700 mb-3">What is your budget?</div>
                    <div className="grid grid-cols-3 gap-2" data-testid="field-budget">
                      {BUDGETS.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => set("budget", form.budget === b ? "" : b)}
                          className={`px-4 h-11 rounded-xl border-2 text-sm font-medium transition-colors ${
                            form.budget === b
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                              : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-zinc-700 mb-3">Who is supplying materials?</div>
                    <div className="grid grid-cols-2 gap-2" data-testid="field-materials">
                      {MATERIALS_OPTIONS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => set("materials", form.materials === m ? "" : m)}
                          className={`px-4 h-11 rounded-xl border-2 text-sm font-medium transition-colors ${
                            form.materials === m
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                              : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-zinc-700 mb-3">Access and constraints</div>
                    <div className="grid grid-cols-2 gap-2" data-testid="field-access">
                      {getAccessChips(form.category).map((a) => {
                        const selected = form.access.includes(a.value);
                        return (
                          <button
                            key={a.value}
                            type="button"
                            onClick={() => {
                              set("access", selected
                                ? form.access.filter((v) => v !== a.value)
                                : [...form.access, a.value]
                              );
                            }}
                            className={`px-4 h-11 rounded-xl border-2 text-sm font-medium transition-colors text-left ${
                              selected
                                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                            }`}
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ===== DESCRIPTION ===== */}
              {currentStep.key === "description" && (
                <div className="max-w-lg w-full">
                  <textarea
                    className="w-full min-h-[160px] p-4 rounded-2xl border-2 border-zinc-200 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors resize-vertical leading-relaxed"
                    placeholder="e.g. We have a 3-bed semi and want external wall insulation on the front and side walls. The house was built in the 1930s and has no cavity..."
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
                <div className="max-w-lg w-full text-left space-y-0">
                  <ReviewSection label="Category" value={form.category || ""} onEdit={() => goToStep(0)} />
                  <ReviewSection
                    label="Type of work"
                    value={[
                      ...form.selectedTypes,
                      ...(form.otherEnabled && form.otherText.trim() ? [normalize(form.otherText)] : []),
                    ].join(", ")}
                    onEdit={() => goToStep(1)}
                  />
                  <ReviewSection label="Location" value={form.locationDisplay || form.location} onEdit={() => goToStep(2)} />
                  <ReviewSection label="Property" value={`${form.propertyType}, ${form.bedrooms} bedroom${form.bedrooms !== 1 ? "s" : ""}`} onEdit={() => goToStep(3)} />
                  {categorySpec && (() => {
                    const specAnswers = form.answers[categorySpec.groups[0].id];
                    if (!specAnswers || typeof specAnswers !== "object") return null;
                    const parts: string[] = [];
                    for (const field of categorySpec.groups[0].fields) {
                      const val = specAnswers[field.key];
                      if (val == null || val === "") continue;
                      if (field.kind === "number") {
                        const unit = field.unit === "m2" ? "m\u00B2" : field.unit === "count" ? " rooms" : "";
                        parts.push(`${field.label}: ${val}${unit}`);
                      } else if (field.kind === "select") {
                        const opt = field.options.find((o) => o.value === val);
                        parts.push(`${field.label}: ${opt ? opt.label : val}`);
                      } else if (field.kind === "boolean") {
                        if (val === true) parts.push(field.label);
                      } else if (field.kind === "either" && val && typeof val === "object") {
                        const unit = val.kind === "m2" ? "m\u00B2" : val.kind === "rooms" ? " rooms" : "";
                        parts.push(`${field.branches ? field.branches.find((b: any) => b.key === val.kind)?.label || val.kind : val.kind}: ${val.value}${unit}`);
                      }
                    }
                    if (parts.length === 0) return null;
                    return (
                      <ReviewSection
                        label={categorySpec.groups[0].title}
                        value={parts.join(" \u2022 ")}
                        onEdit={() => {
                          const detIdx = STEPS.findIndex((s) => s.key === "details");
                          if (detIdx >= 0) goToStep(detIdx);
                        }}
                      />
                    );
                  })()}
                  <ReviewSection
                    label="Details"
                    value={[
                      form.timeframe,
                      form.budget ? `Budget: ${form.budget}` : "",
                      form.materials,
                      ...(form.access.length > 0 ? [form.access.map((v) => {
                        const chip = getAccessChips(form.category).find((c) => c.value === v);
                        return chip ? chip.label : v;
                      }).join(", ")] : []),
                    ].filter(Boolean).join(" \u2022 ")}
                    onEdit={() => {
                      const extrasIdx = STEPS.findIndex((s) => s.key === "extras");
                      if (extrasIdx >= 0) goToStep(extrasIdx);
                    }}
                  />
                  <ReviewSection
                    label="Description"
                    value={form.description}
                    onEdit={() => {
                      const descIdx = STEPS.findIndex((s) => s.key === "description");
                      if (descIdx >= 0) goToStep(descIdx);
                    }}
                    last
                  />
                </div>
              )}

              {/* Shuffle phase. Auto-fires the moment the user lands on
                  the preview step (no idle "3 cards visible" intermediate
                  state). idle is only present for the single render tick
                  before the auto-trigger useEffect promotes us to
                  shuffling. */}
              {currentStep.key === "preview" && matchingPhase !== "revealed" && (
                <div className="px-6 sm:px-10 pt-2 pb-6">
                  <MatchShuffleAnimation
                    active={matchingPhase === "shuffling"}
                    onSettled={() => setShuffleSettled(true)}
                  />
                  <p className="mt-2 text-[13px] text-slate-500 leading-relaxed text-center">
                    Finding tradespeople near you...
                  </p>
                </div>
              )}

              {/* Revealed: matches fade back in and the wizard offers a
                  single CTA into the next destination (signup for guests,
                  the project's swipe deck for authed users). */}
              {currentStep.key === "preview" && matchingPhase === "revealed" && (
                <div className="px-6 sm:px-10 pt-2 pb-6">
                  <PreviewMatchesPanel
                    matches={previewMatches}
                    loading={previewLoading}
                    err={previewErr}
                    isGuest={!user}
                  />
                </div>
              )}
            </div>

            {/* Error */}
            {err && (
              <p className="px-6 sm:px-10 -mt-4 pb-2 text-sm text-red-500 font-medium text-center" role="alert">
                {err}
              </p>
            )}

            {/* Bottom navigation. Hidden on the preview step entirely -
                that step auto-triggers the shuffle on entry, so the
                user never needs Previous / Post your job there. The
                only action on preview is the revealed-state CTA below. */}
            {currentStep.key !== "preview" && (
            <div className="flex items-center justify-between px-6 pb-6 sm:px-10 sm:pb-8">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={back}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl border-2 border-zinc-200 text-xs sm:text-sm font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-40 transition-colors"
                    data-testid="btn-prev"
                  >
                    &#8592; Previous
                  </button>
                ) : <div />}

                {step < maxStep ? (
                  step === 0 ? null : (
                  <button
                    type="button"
                    onClick={next}
                    disabled={!isStepValid(step) || busy}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:shadow-none disabled:scale-100 transition-all"
                    style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                    data-testid="btn-next"
                  >
                    Continue &#8594;
                  </button>)
                ) : (
                  <button
                    type="button"
                    onClick={onCreate}
                    disabled={!isStepValid(step) || busy}
                    className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:shadow-none ${
                      busy ? "cursor-not-allowed" : "hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
                    }`}
                    style={
                      busy
                        ? { background: "#94a3b8" }
                        : { background: "linear-gradient(135deg,#6366f1,#4f46e5)" }
                    }
                    data-testid="btn-create"
                  >
                    {busy && (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                      </svg>
                    )}
                    {busy ? "Creating..." : `${submitText} \u2192`}
                  </button>
                )}
              </div>
            )}

            {/* Revealed-state CTA. Guests get a sign-up push with a
                value-prop line (message tradespeople, get free quotes).
                Authed users get a direct route into the project's swipe
                deck. */}
            {matchingPhase === "revealed" && (
              <div className="flex flex-col items-center gap-3 px-6 pb-6 sm:px-10 sm:pb-8">
                {guestFlowRef.current ? (
                  <>
                    <p className="text-[13px] text-slate-600 leading-relaxed text-center max-w-md">
                      Sign up to message these tradespeople, get free quotes
                      and track your job - all in one place.
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/signup")}
                      className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xl text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                      style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                      data-testid="btn-signup"
                    >
                      Sign up to message them &#8594;
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={commitAndView}
                    disabled={busy}
                    className={`inline-flex items-center gap-1.5 px-6 py-3 rounded-xl text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                      busy ? "" : "hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
                    }`}
                    style={{
                      background: busy
                        ? "#94a3b8"
                        : "linear-gradient(135deg,#6366f1,#4f46e5)",
                    }}
                    data-testid="btn-view-tradespeople"
                  >
                    {busy && (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                      </svg>
                    )}
                    {busy ? "Posting your job..." : "View tradespeople →"}
                  </button>
                )}
              </div>
            )}

            {/* Progress dots at bottom */}
            <div className="flex items-center justify-center gap-1.5 pb-6">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? "w-5 bg-indigo-600" : i < step ? "w-1.5 bg-indigo-600" : "w-1.5 bg-zinc-200"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      </Layout>
      </div>
    </>
  );
}

/* ====== Review Section ====== */

function ReviewSection({
  label,
  value,
  onEdit,
  last,
}: {
  label: string;
  value: string;
  onEdit: () => void;
  last?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between py-4 ${last ? "" : "border-b border-zinc-100"}`}>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">{label}</div>
        <div className="text-sm font-medium text-zinc-900">{value || "\u2014"}</div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 ml-4 flex-shrink-0 mt-0.5"
      >
        Edit
      </button>
    </div>
  );
}
