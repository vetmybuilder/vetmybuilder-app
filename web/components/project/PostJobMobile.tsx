// web/components/project/PostJobMobile.tsx
//
// Mobile-only wizard shell shared by /projects/new and /projects/[id]/edit.
// Drives the same wizard state (`form`, `step`, etc.) as the desktop view —
// no business logic lives here, only presentation. The /edit page passes
// optional overrides (submitLabel, onCancel, descriptionMax,
// accessOptionsSingle, ...) to adapt the shell to the update flow.

import { useState } from "react";
import { useRouter } from "next/router";
import { Search, X } from "lucide-react";
import LocationField from "@/components/forms/LocationField";
import DynamicFieldGroup from "@/components/forms/DynamicFieldGroup";
import PreviewMatchesPanel from "@/components/project/PreviewMatchesPanel";
import MatchShuffleAnimation from "@/components/project/MatchShuffleAnimation";
import type { Spec } from "@/config/jobFields";
import type { PreviewMatch } from "@/pages/projects/new";

type Step = { key: string; title: string; subtitle: string };

type AccessChip = { label: string; value: string };

type PostJobMobileProps = {
  // Wizard state
  form: any;
  set: <K extends string>(k: K, v: any) => void;
  setForm: (updater: (prev: any) => any) => void;
  step: number;
  setStep: (s: number | ((prev: number) => number)) => void;
  STEPS: Step[];
  currentStep: Step;
  isStepValid: (idx: number) => boolean;
  goNext: () => void;
  goBack: () => void;
  goToStep: (idx: number) => void;
  submit: () => void | Promise<void>;
  busy: boolean;
  err: string | null;

  // Derived data
  filteredCategories: string[];
  filteredSubtypes: string[];
  SUBTYPE_OPTIONS: string[];
  toggleSubtype: (label: string) => void;
  categorySearch: string;
  setCategorySearch: (v: string) => void;
  subtypeSearch: string;
  setSubtypeSearch: (v: string) => void;
  categorySpec: Spec | null | undefined;
  answerErrors: Record<string, string>;
  CATEGORY_ICONS: Record<string, string>;
  PROPERTY_TYPES: ReadonlyArray<{ label: string; icon: string }>;
  BEDROOM_OPTIONS: ReadonlyArray<string>;
  TIMEFRAMES: ReadonlyArray<string>;
  BUDGETS: ReadonlyArray<string>;
  MATERIALS_OPTIONS: ReadonlyArray<string>;
  getAccessChips: (category: string | null | undefined) => AccessChip[];
  normalize: (s: string) => string;

  // Optional overrides — let the same shell drive both /new and /edit.
  /** Submit button label when not busy. Default: "Post job". */
  submitLabel?: string;
  /** Submit button label while busy. Default: "Posting...". */
  busyLabel?: string;
  /** Cancel/X handler. Default: router.push("/projects"). */
  onCancel?: () => void;
  /** Description textarea placeholder. */
  descriptionPlaceholder?: string;
  /** Description max length. Default 600. */
  descriptionMax?: number;
  /**
   * If supplied, the "Access" section in the extras step renders
   * single-select string options instead of the multi-select chip list
   * with `value`/`label`. Used by the edit wizard whose `form.access`
   * is a single string parsed from the saved description.
   */
  accessOptionsSingle?: ReadonlyArray<string>;

  // Preview-step props (engagement-first signup). Optional - the /edit
  // wizard doesn't surface a preview step.
  previewMatches?: PreviewMatch[] | null;
  previewLoading?: boolean;
  previewErr?: string | null;
  isGuest?: boolean;

  // Shuffle-then-reveal flow on the preview step. The parent (new.tsx)
  // owns `matchingPhase` and the commit handler; this shell just renders
  // the right view per phase and forwards the settle callback.
  matchingPhase?: "idle" | "shuffling" | "revealed";
  onShuffleSettled?: () => void;
  /** True when the wizard is being driven by a guest. Determines the
   *  revealed-state CTA (sign-up vs. commit-and-view). */
  guestFlow?: boolean;
  /** Authed-user revealed-state CTA. POSTs the job then routes to the
   *  swipe deck. Required when guestFlow=false. */
  onCommitAndView?: () => void | Promise<void>;
  /** Real tradesperson photos to cycle through the shuffle frame.
   *  Falls back to the gradient/initial defaults when undefined (e.g.
   *  while previewMatches is still loading). */
  shuffleFaces?: import("./MatchShuffleAnimation").ShuffleFace[];

  /** Set of categories with at least one live pilot leaf. `null` means
   *  the pilot list hasn't loaded yet - treat everything as live so the
   *  picker isn't blank. */
  pilotCategoryNames?: Set<string> | null;
  /** Set of live pilot leaf type-names. Same `null` semantics as above. */
  pilotTypeNames?: Set<string> | null;
  /** Triggered when the homeowner taps a disabled-at-launch category
   *  tile - the parent opens ComingSoonSheet to capture demand. */
  onComingSoonCategory?: (category: string) => void;
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif";

export default function PostJobMobile(props: PostJobMobileProps) {
  const {
    form,
    set,
    step,
    setStep,
    STEPS,
    currentStep,
    isStepValid,
    goNext,
    goBack,
    goToStep,
    submit,
    busy,
    err,
    filteredCategories,
    filteredSubtypes,
    SUBTYPE_OPTIONS,
    toggleSubtype,
    categorySearch,
    setCategorySearch,
    subtypeSearch,
    setSubtypeSearch,
    categorySpec,
    answerErrors,
    setForm,
    CATEGORY_ICONS,
    PROPERTY_TYPES,
    BEDROOM_OPTIONS,
    TIMEFRAMES,
    BUDGETS,
    MATERIALS_OPTIONS,
    getAccessChips,
    normalize,
    submitLabel,
    busyLabel,
    onCancel,
    descriptionPlaceholder,
    descriptionMax,
    accessOptionsSingle,
    previewMatches,
    previewLoading,
    previewErr,
    isGuest,
    matchingPhase = "idle",
    onShuffleSettled,
    guestFlow,
    onCommitAndView,
    shuffleFaces,
    pilotCategoryNames,
    pilotTypeNames,
    onComingSoonCategory,
  } = props;

  const router = useRouter();

  // Local typed query for the location field. Kept separate from
  // `form.location` (the committed value) so a single keystroke doesn't
  // immediately treat the typed text as a chosen location and dismiss
  // the input. We only commit to form.location when LocationField fires
  // an onChange with structured `meta` (i.e. user picked a suggestion
  // or typed a complete postcode that resolved).
  const [locationQuery, setLocationQuery] = useState("");

  const isLastStep = step === STEPS.length - 1;
  const canContinue = isStepValid(step) && !busy;

  const submitText = submitLabel ?? "Post job";
  const busyText = busyLabel ?? "Posting...";
  const handleCancel = onCancel ?? (() => router.push("/projects"));

  return (
    <main
      className="fixed inset-0 bg-white overflow-y-auto flex flex-col"
      style={{ fontFamily: FONT_STACK }}
      data-testid="post-job-mobile"
    >
      {/* safe-area-inset-top spacer */}
      <div style={{ paddingTop: "env(safe-area-inset-top)" }} />

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          type="button"
          onClick={handleCancel}
          aria-label="Cancel and return"
          className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center"
          data-testid="btn-cancel"
        >
          <X size={18} />
        </button>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-indigo-600">
          Step {step + 1} of {STEPS.length}
        </div>
        <div className="w-9" />
      </div>

      {/* PROGRESS BAR */}
      <div className="px-5 pt-1 pb-3">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto px-5 pb-32">
        <h1
          className="text-[26px] font-extrabold tracking-[-0.02em] leading-[1.15] text-gray-900 mt-2"
          data-testid="step-title"
        >
          {currentStep.title}
        </h1>
        <p className="mt-1.5 text-[14px] text-gray-500 leading-snug">
          {currentStep.subtitle}
        </p>

        <div className="mt-6">
          {currentStep.key === "category" && (
            <CategoryStep
              filteredCategories={filteredCategories}
              categorySearch={categorySearch}
              setCategorySearch={setCategorySearch}
              CATEGORY_ICONS={CATEGORY_ICONS}
              currentCategory={form.category}
              pilotCategoryNames={pilotCategoryNames ?? null}
              onComingSoon={onComingSoonCategory}
              onSelect={(cat) => {
                set("category", cat);
                set("selectedTypes", []);
                set("otherEnabled", false);
                set("otherText", "");
                setSubtypeSearch("");
                setTimeout(
                  () => setStep((s) => (typeof s === "number" ? s + 1 : 1)),
                  150,
                );
              }}
            />
          )}

          {currentStep.key === "subtypes" && (
            <SubtypesStep
              category={form.category}
              filteredSubtypes={filteredSubtypes}
              SUBTYPE_OPTIONS={SUBTYPE_OPTIONS}
              subtypeSearch={subtypeSearch}
              setSubtypeSearch={setSubtypeSearch}
              selectedTypes={form.selectedTypes}
              toggleSubtype={toggleSubtype}
              otherEnabled={form.otherEnabled}
              otherText={form.otherText}
              setOtherEnabled={(v) => set("otherEnabled", v)}
              setOtherText={(v) => set("otherText", v)}
              pilotTypeNames={pilotTypeNames ?? null}
            />
          )}

          {currentStep.key === "location" && (
            <div className="text-left" data-testid="field-location-wrap">
              {/* Pill renders only after the user picks a suggestion (or
                  types a full postcode that resolves). Typing alone keeps
                  the input visible so single keystrokes don't dismiss it. */}
              {form.location ? (
                <div className="flex items-center gap-2 rounded-2xl border-2 border-indigo-500 bg-indigo-50 px-3 py-3">
                  <span className="flex-1 text-[15px] font-bold text-indigo-700">
                    {form.locationDisplay || form.location}
                  </span>
                  <button
                    type="button"
                    aria-label="Clear location"
                    onClick={() => {
                      set("location", "");
                      set("locationDisplay", "");
                      setLocationQuery("");
                    }}
                    className="w-7 h-7 rounded-full bg-white text-indigo-700 flex items-center justify-center font-bold"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <LocationField
                  id="np-location-mobile"
                  label=""
                  value={locationQuery}
                  onChange={(v, meta) => {
                    setLocationQuery(v);
                    // Only commit to form.location when a structured
                    // selection arrives (suggestion clicked or full
                    // postcode resolved).
                    if (
                      meta &&
                      (meta.borough ||
                        meta.outward ||
                        meta.sector ||
                        meta.postcode)
                    ) {
                      const display = meta.borough
                        ? meta.borough.name
                        : meta.outward ?? meta.sector ?? meta.postcode ?? v;
                      const stored = display.toUpperCase();
                      set("location", stored);
                      set("locationDisplay", display);
                      // Clear input so the pill takes over visually.
                      setLocationQuery("");
                    }
                  }}
                  onDisplayChange={(display) =>
                    set("locationDisplay", display)
                  }
                  dataTestId="field-location-mobile"
                />
              )}
            </div>
          )}

          {currentStep.key === "propertyType" && (
            <PropertyTypeStep
              PROPERTY_TYPES={PROPERTY_TYPES}
              selected={form.propertyType}
              onSelect={(label) => {
                set("propertyType", label);
                setTimeout(
                  () => setStep((s) => (typeof s === "number" ? s + 1 : 1)),
                  150,
                );
              }}
            />
          )}

          {currentStep.key === "bedrooms" && (
            <BedroomsStep
              BEDROOM_OPTIONS={BEDROOM_OPTIONS}
              selected={form.bedrooms}
              onSelect={(num) => {
                set("bedrooms", num);
                setTimeout(
                  () => setStep((s) => (typeof s === "number" ? s + 1 : 1)),
                  150,
                );
              }}
            />
          )}

          {currentStep.key === "details" && categorySpec && (
            <div className="text-left space-y-6">
              {categorySpec.groups.map((g: any) => (
                <DynamicFieldGroup
                  key={g.id}
                  group={g}
                  value={form.answers}
                  onChange={(nextAnswers: any) => set("answers", nextAnswers)}
                  errors={answerErrors}
                />
              ))}
            </div>
          )}

          {currentStep.key === "extras" && (
            <ExtrasStep
              form={form}
              set={set}
              TIMEFRAMES={TIMEFRAMES}
              BUDGETS={BUDGETS}
              MATERIALS_OPTIONS={MATERIALS_OPTIONS}
              getAccessChips={getAccessChips}
              accessOptionsSingle={accessOptionsSingle}
            />
          )}

          {currentStep.key === "description" && (
            <DescriptionStep
              value={form.description}
              onChange={(v) => set("description", v)}
              placeholder={descriptionPlaceholder}
              max={descriptionMax}
            />
          )}

          {currentStep.key === "review" && (
            <ReviewStep
              form={form}
              STEPS={STEPS}
              goToStep={goToStep}
              categorySpec={categorySpec}
              normalize={normalize}
              getAccessChips={getAccessChips}
            />
          )}

          {currentStep.key === "preview" && matchingPhase !== "revealed" && (
            // Shuffle phase. Auto-fires from the parent's useEffect the
            // moment we land on the preview step, so the user never sees
            // a static "3 cards visible" intermediate state.
            <div className="pt-4">
              <MatchShuffleAnimation
                active={matchingPhase === "shuffling"}
                onSettled={() => onShuffleSettled?.()}
                faces={shuffleFaces}
              />
              <p className="mt-2 text-[13px] text-slate-500 leading-relaxed text-center">
                Finding tradespeople near you...
              </p>
            </div>
          )}

          {currentStep.key === "preview" && matchingPhase === "revealed" && (
            <div>
              <PreviewMatchesPanel
                matches={previewMatches ?? null}
                loading={!!previewLoading}
                err={previewErr ?? null}
                isGuest={!!isGuest}
              />
            </div>
          )}
        </div>

        {err && (
          <p
            className="mt-4 text-[13px] text-red-600 font-semibold"
            role="alert"
          >
            {err}
          </p>
        )}
      </div>

      {/* FOOTER. Behaviour on the preview step matches desktop:
          - shuffling: footer hidden (no Back / no Post buttons)
          - revealed: single CTA - sign-up for guests, View tradespeople
            (POST + redirect) for authed users
          - any other step: Back + Continue/Post as before */}
      <div
        className="fixed inset-x-0 bottom-0 bg-white border-t border-gray-100 px-5 pt-3"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        {currentStep.key === "preview" && matchingPhase === "shuffling" ? null : currentStep.key === "preview" && matchingPhase === "revealed" ? (
          <div className="flex">
            {guestFlow ? (
              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-extrabold text-[15px] tracking-tight shadow-[0_8px_22px_rgba(99,102,241,0.3)]"
                data-testid="btn-signup"
              >
                Sign up to message them &#8594;
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onCommitAndView?.()}
                disabled={busy}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-extrabold text-[15px] tracking-tight shadow-[0_8px_22px_rgba(99,102,241,0.3)] disabled:opacity-60"
                data-testid="btn-view-tradespeople"
              >
                {busy ? "Posting your job..." : "View tradespeople →"}
              </button>
            )}
          </div>
        ) : (
        <div className="flex gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={goBack}
              disabled={busy}
              className="px-5 py-3.5 rounded-2xl bg-white border-[1.5px] border-gray-200 text-gray-700 font-bold text-[14px] disabled:opacity-50"
              data-testid="btn-prev"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={isLastStep ? () => submit() : goNext}
            disabled={!canContinue}
            className="flex-1 py-3.5 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-extrabold text-[15px] tracking-tight shadow-[0_8px_22px_rgba(99,102,241,0.3)] disabled:opacity-50 disabled:shadow-none"
            data-testid={isLastStep ? "btn-create" : "btn-next"}
          >
            {busy ? busyText : isLastStep ? submitText : "Continue"}
          </button>
        </div>
        )}
      </div>
    </main>
  );
}

/* ===== Per-step bodies ===== */

// 16px font is the iOS Safari threshold below which the page auto-zooms
// when the input gets focus. Keep this at >= 16 to suppress that behaviour.
const SEARCH_INPUT_CLS =
  "w-full bg-gray-100 rounded-xl pl-10 pr-4 py-3 text-[16px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-colors";

const TILE_BASE =
  "bg-white border rounded-2xl p-3 flex flex-col items-center justify-center text-center gap-2 transition-colors";
const TILE_UNSELECTED = "border-gray-200 hover:border-gray-300";
const TILE_SELECTED = "border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-50";

function SearchInput({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId?: string;
}) {
  return (
    <div className="relative">
      <Search
        size={16}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        type="text"
        className={SEARCH_INPUT_CLS}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}

function CategoryStep({
  filteredCategories,
  categorySearch,
  setCategorySearch,
  CATEGORY_ICONS,
  currentCategory,
  pilotCategoryNames,
  onComingSoon,
  onSelect,
}: {
  filteredCategories: string[];
  categorySearch: string;
  setCategorySearch: (v: string) => void;
  CATEGORY_ICONS: Record<string, string>;
  currentCategory: string | null;
  pilotCategoryNames: Set<string> | null;
  onComingSoon?: (cat: string) => void;
  onSelect: (cat: string) => void;
}) {
  return (
    <div data-testid="field-category">
      <SearchInput
        value={categorySearch}
        onChange={setCategorySearch}
        placeholder="Search categories..."
        testId="category-search-mobile"
      />
      <div className="grid grid-cols-3 gap-3 mt-4">
        {filteredCategories.map((cat) => {
          const selected = currentCategory === cat;
          const isLive =
            pilotCategoryNames === null ? true : pilotCategoryNames.has(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                if (!isLive) {
                  onComingSoon?.(cat);
                  return;
                }
                onSelect(cat);
              }}
              aria-pressed={selected}
              aria-disabled={!isLive}
              className={`${TILE_BASE} ${
                !isLive
                  ? "border-gray-200 bg-gray-50 opacity-60"
                  : selected
                    ? TILE_SELECTED
                    : TILE_UNSELECTED
              } relative min-h-[88px]`}
              data-testid={`category-${cat}`}
            >
              <span className="text-[28px] leading-none">
                {CATEGORY_ICONS[cat] || "\u{1F3E0}"}
              </span>
              <span className="text-[12px] font-extrabold text-gray-800 leading-tight">
                {cat}
              </span>
              {!isLive && (
                <span className="absolute top-1 right-1 px-1.5 py-[1px] rounded-full bg-zinc-900 text-white text-[8px] font-semibold whitespace-nowrap">
                  Coming soon
                </span>
              )}
            </button>
          );
        })}
        {filteredCategories.length === 0 && categorySearch && (
          <p className="col-span-3 text-[13px] text-gray-400 text-center py-4">
            No categories match &ldquo;{categorySearch}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

function SubtypesStep({
  category,
  filteredSubtypes,
  SUBTYPE_OPTIONS,
  subtypeSearch,
  setSubtypeSearch,
  selectedTypes,
  toggleSubtype,
  otherEnabled,
  otherText,
  setOtherEnabled,
  setOtherText,
  pilotTypeNames,
}: {
  category: string | null;
  filteredSubtypes: string[];
  SUBTYPE_OPTIONS: string[];
  subtypeSearch: string;
  setSubtypeSearch: (v: string) => void;
  selectedTypes: string[];
  toggleSubtype: (label: string) => void;
  otherEnabled: boolean;
  otherText: string;
  setOtherEnabled: (v: boolean) => void;
  setOtherText: (v: string) => void;
  pilotTypeNames: Set<string> | null;
}) {
  if (!category) {
    return <p className="text-[13px] text-gray-400">Pick a category first.</p>;
  }
  return (
    <div data-testid="field-subtypes">
      {SUBTYPE_OPTIONS.length > 6 && (
        <div className="mb-4">
          <SearchInput
            value={subtypeSearch}
            onChange={setSubtypeSearch}
            placeholder="Search work types..."
            testId="subtypes-search-mobile"
          />
        </div>
      )}

      <div className="space-y-2">
        {filteredSubtypes.map((t) => {
          const checked = selectedTypes.some(
            (x) => x.toLowerCase() === t.toLowerCase(),
          );
          const isLive = pilotTypeNames === null ? true : pilotTypeNames.has(t);
          return (
            <button
              key={t}
              type="button"
              disabled={!isLive}
              onClick={() => {
                if (!isLive) return;
                toggleSubtype(t);
              }}
              aria-pressed={checked}
              aria-disabled={!isLive}
              className={`w-full bg-white border rounded-2xl px-4 py-3.5 flex items-center justify-between text-left transition-colors ${
                !isLive
                  ? "border-gray-200 bg-gray-50 text-gray-400 opacity-60 cursor-not-allowed"
                  : checked
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-[14px] font-bold text-gray-800">{t}</span>
              {!isLive ? (
                <span className="px-1.5 py-[1px] rounded-full bg-zinc-900 text-white text-[9px] font-semibold whitespace-nowrap flex-shrink-0">
                  Coming soon
                </span>
              ) : (
                checked && (
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-extrabold">
                    &#10003;
                  </span>
                )
              )}
            </button>
          );
        })}
        {filteredSubtypes.length === 0 && subtypeSearch && (
          <p className="text-[13px] text-gray-400 text-center py-4">
            No matches for &ldquo;{subtypeSearch}&rdquo;
          </p>
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setOtherEnabled(!otherEnabled)}
          className={`w-full bg-white border rounded-2xl px-4 py-3.5 flex items-center justify-between text-left transition-colors ${
            otherEnabled
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <span className="text-[14px] font-bold text-gray-800">Other...</span>
          {otherEnabled && (
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-extrabold">
              &#10003;
            </span>
          )}
        </button>
        {otherEnabled && (
          <input
            className="mt-3 w-full bg-gray-100 rounded-xl px-4 py-3 text-[16px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            placeholder="Describe another type of work"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            data-testid="field-other-text"
          />
        )}
      </div>
    </div>
  );
}

function PropertyTypeStep({
  PROPERTY_TYPES,
  selected,
  onSelect,
}: {
  PROPERTY_TYPES: ReadonlyArray<{ label: string; icon: string }>;
  selected: string;
  onSelect: (label: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3" data-testid="field-property">
      {PROPERTY_TYPES.map((pt) => {
        const isSelected = selected === pt.label;
        return (
          <button
            key={pt.label}
            type="button"
            onClick={() => onSelect(pt.label)}
            aria-pressed={isSelected}
            className={`${TILE_BASE} ${
              isSelected ? TILE_SELECTED : TILE_UNSELECTED
            } min-h-[88px]`}
            data-testid={`property-${pt.label}`}
          >
            <span className="text-[28px] leading-none">{pt.icon}</span>
            <span className="text-[13px] font-extrabold text-gray-800">
              {pt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BedroomsStep({
  BEDROOM_OPTIONS,
  selected,
  onSelect,
}: {
  BEDROOM_OPTIONS: ReadonlyArray<string>;
  selected: number;
  onSelect: (num: number) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2.5"
      data-testid="field-bedrooms"
    >
      {BEDROOM_OPTIONS.map((b) => {
        const numVal = parseInt(b, 10);
        const isSelected = selected === numVal;
        return (
          <button
            key={b}
            type="button"
            onClick={() => onSelect(numVal)}
            aria-pressed={isSelected}
            className={`px-5 py-2.5 rounded-full font-extrabold text-[14px] transition-colors ${
              isSelected
                ? "bg-indigo-600 text-white shadow-[0_6px_16px_rgba(99,102,241,0.25)]"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            data-testid={`beds-${b}`}
          >
            {b}
          </button>
        );
      })}
    </div>
  );
}

const FIELD_LABEL_CLS =
  "text-[12px] font-extrabold uppercase tracking-wider text-gray-500";

function ExtrasStep({
  form,
  set,
  TIMEFRAMES,
  BUDGETS,
  MATERIALS_OPTIONS,
  getAccessChips,
  accessOptionsSingle,
}: {
  form: any;
  set: (k: string, v: any) => void;
  TIMEFRAMES: ReadonlyArray<string>;
  BUDGETS: ReadonlyArray<string>;
  MATERIALS_OPTIONS: ReadonlyArray<string>;
  getAccessChips: (cat: string | null | undefined) => AccessChip[];
  accessOptionsSingle?: ReadonlyArray<string>;
}) {
  const pillCls = (selected: boolean) =>
    `px-4 py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
      selected
        ? "bg-indigo-600 text-white"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <div className="space-y-6 text-left">
      <div>
        <div className={FIELD_LABEL_CLS}>When do you need this done?</div>
        <div className="mt-2 grid grid-cols-2 gap-2" data-testid="field-timeframe">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("timeframe", form.timeframe === t ? "" : t)}
              className={pillCls(form.timeframe === t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={FIELD_LABEL_CLS}>Your budget</div>
        <div className="mt-2 grid grid-cols-3 gap-2" data-testid="field-budget">
          {BUDGETS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => set("budget", form.budget === b ? "" : b)}
              className={pillCls(form.budget === b)}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={FIELD_LABEL_CLS}>Materials</div>
        <div className="mt-2 grid grid-cols-2 gap-2" data-testid="field-materials">
          {MATERIALS_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set("materials", form.materials === m ? "" : m)}
              className={pillCls(form.materials === m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={FIELD_LABEL_CLS}>Access &amp; constraints</div>
        <div className="mt-2 grid grid-cols-2 gap-2" data-testid="field-access">
          {accessOptionsSingle ? (
            accessOptionsSingle.map((opt) => {
              const sel = form.access === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set("access", sel ? "" : opt)}
                  className={pillCls(sel)}
                >
                  {opt}
                </button>
              );
            })
          ) : (
            getAccessChips(form.category).map((a) => {
              const sel = form.access.includes(a.value);
              return (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => {
                    set(
                      "access",
                      sel
                        ? form.access.filter((v: string) => v !== a.value)
                        : [...form.access, a.value],
                    );
                  }}
                  className={pillCls(sel)}
                >
                  {a.label}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function DescriptionStep({
  value,
  onChange,
  placeholder,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  max?: number;
}) {
  const MAX = max ?? 600;
  const len = value.length;
  return (
    <div>
      <textarea
        className="w-full min-h-[180px] bg-gray-100 rounded-2xl p-4 text-[16px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-colors leading-relaxed"
        placeholder={
          placeholder ??
          "e.g. We have a 3-bed semi and want external wall insulation on the front and side walls..."
        }
        value={value}
        maxLength={MAX}
        onChange={(e) => onChange(e.target.value)}
        data-testid="field-description"
      />
      <div
        className={`text-right text-[12px] mt-1.5 ${
          len >= MAX ? "text-red-600 font-semibold" : "text-gray-400"
        }`}
      >
        {len} / {MAX}
      </div>
    </div>
  );
}

function ReviewStep({
  form,
  STEPS,
  goToStep,
  categorySpec,
  normalize,
  getAccessChips,
}: {
  form: any;
  STEPS: Step[];
  goToStep: (idx: number) => void;
  categorySpec: Spec | null | undefined;
  normalize: (s: string) => string;
  getAccessChips: (cat: string | null | undefined) => AccessChip[];
}) {
  const stepIdxOf = (key: string) => STEPS.findIndex((s) => s.key === key);

  const typeOfWork = [
    ...form.selectedTypes,
    ...(form.otherEnabled && form.otherText.trim()
      ? [normalize(form.otherText)]
      : []),
  ].join(", ");

  const propertyValue =
    form.propertyType
      ? `${form.propertyType}, ${form.bedrooms} bedroom${
          form.bedrooms !== 1 ? "s" : ""
        }`
      : "";

  let detailsCardValue = "";
  if (categorySpec) {
    const specAnswers = form.answers[categorySpec.groups[0].id];
    if (specAnswers && typeof specAnswers === "object") {
      const parts: string[] = [];
      for (const field of categorySpec.groups[0].fields as any[]) {
        const val = specAnswers[field.key];
        if (val == null || val === "") continue;
        if (field.kind === "number") {
          const unit =
            field.unit === "m2" ? "m²" : field.unit === "count" ? " rooms" : "";
          parts.push(`${field.label}: ${val}${unit}`);
        } else if (field.kind === "select") {
          const opt = field.options.find((o: any) => o.value === val);
          parts.push(`${field.label}: ${opt ? opt.label : val}`);
        } else if (field.kind === "boolean") {
          if (val === true) parts.push(field.label);
        } else if (field.kind === "either" && val && typeof val === "object") {
          const unit =
            val.kind === "m2" ? "m²" : val.kind === "rooms" ? " rooms" : "";
          parts.push(
            `${
              field.branches
                ? field.branches.find((b: any) => b.key === val.kind)?.label ||
                  val.kind
                : val.kind
            }: ${val.value}${unit}`,
          );
        }
      }
      detailsCardValue = parts.join(" • ");
    }
  }

  const accessText = (() => {
    const a = form.access;
    if (Array.isArray(a)) {
      if (a.length === 0) return "";
      return a
        .map((v: string) => {
          const chip = getAccessChips(form.category).find(
            (c) => c.value === v,
          );
          return chip ? chip.label : v;
        })
        .join(", ");
    }
    return typeof a === "string" ? a : "";
  })();

  const extrasValue = [
    form.timeframe,
    form.budget ? `Budget: ${form.budget}` : "",
    form.materials,
    accessText,
  ]
    .filter(Boolean)
    .join(" • ");

  const locationStepIdx = stepIdxOf("location");
  const locationValue = form.locationDisplay || form.location;

  return (
    <div className="space-y-3">
      <Card label="Category" value={form.category || ""} onEdit={() => goToStep(0)} />
      <Card label="Type of work" value={typeOfWork} onEdit={() => goToStep(1)} />
      {locationValue && (
        <Card
          label="Location"
          value={locationValue}
          onEdit={
            locationStepIdx >= 0
              ? () => goToStep(locationStepIdx)
              : undefined
          }
        />
      )}
      <Card
        label="Property"
        value={propertyValue}
        onEdit={() => goToStep(stepIdxOf("propertyType"))}
      />
      {categorySpec && detailsCardValue && (
        <Card
          label={categorySpec.groups[0].title}
          value={detailsCardValue}
          onEdit={() => goToStep(stepIdxOf("details"))}
        />
      )}
      {extrasValue && (
        <Card
          label="Details"
          value={extrasValue}
          onEdit={() => goToStep(stepIdxOf("extras"))}
        />
      )}
      <Card
        label="Description"
        value={form.description}
        onEdit={() => goToStep(stepIdxOf("description"))}
      />
    </div>
  );
}

function Card({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
          {label}
        </div>
        <div className="mt-1 text-[14px] font-bold text-gray-900 break-words">
          {value || "—"}
        </div>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="text-[13px] font-extrabold text-indigo-600 shrink-0 mt-0.5"
        >
          Edit
        </button>
      )}
    </div>
  );
}
