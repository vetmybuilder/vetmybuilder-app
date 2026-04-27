import Head from "next/head";
import { useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import Link from "next/link";
import { useRouter } from "next/router";
import { ChevronLeft } from "lucide-react";

const EMOJI_SCALE = [
  { value: 1, emoji: "😞", label: "Poor" },
  { value: 2, emoji: "😕", label: "Not great" },
  { value: 3, emoji: "😐", label: "OK" },
  { value: 4, emoji: "😊", label: "Good" },
  { value: 5, emoji: "🤩", label: "Amazing" },
];

const USER_TYPES = [
  { value: "posted_job", label: "I posted a job" },
  { value: "recommended", label: "I recommended a tradesperson" },
  { value: "browsing", label: "Just browsing" },
  { value: "tradesperson", label: "I'm a tradesperson" },
];

const FEATURES = [
  { value: "posting", label: "Posting a job" },
  { value: "sharing", label: "Sharing with friends" },
  { value: "recommendations", label: "Viewing recommendations" },
];

const RECOMMEND_OPTIONS = [
  { value: "yes", label: "Yes", onClass: "border-emerald-500 bg-emerald-50 text-emerald-700" },
  { value: "maybe", label: "Maybe", onClass: "border-amber-500 bg-amber-50 text-amber-700" },
  { value: "no", label: "No", onClass: "border-red-500 bg-red-50 text-red-700" },
];

const STEP_LABELS = ["ABOUT YOU", "YOUR EXPERIENCE", "TELL US MORE"];

export default function FeedbackPage() {
  const api = useApi();
  const { user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [userTypes, setUserTypes] = useState<string[]>([]);
  const [featuresUsed, setFeaturesUsed] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [easeOfUse, setEaseOfUse] = useState(0);
  const [positives, setPositives] = useState("");
  const [improvements, setImprovements] = useState("");
  const [recommend, setRecommend] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleUserType(value: string) {
    setUserTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function toggleFeature(value: string) {
    setFeaturesUsed((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value]
    );
  }

  async function handleSubmit() {
    if (!recommend) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/feedback", {
        userType: userTypes.length > 0 ? userTypes.join(",") : undefined,
        featuresUsed: featuresUsed.length > 0 ? featuresUsed : undefined,
        rating,
        easeOfUse: easeOfUse || undefined,
        positives: positives.trim() || undefined,
        improvements: improvements.trim() || undefined,
        recommend: recommend || undefined,
      });
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    if (step === 1) {
      router.back();
    } else {
      setStep((s) => (s - 1) as 1 | 2 | 3);
    }
  }

  function handleNext() {
    if (step < 3) {
      setStep((s) => (s + 1) as 1 | 2 | 3);
    } else {
      handleSubmit();
    }
  }

  const step1Valid = userTypes.length > 0;
  const step2Valid = rating > 0;
  const step3Valid = recommend !== "";

  const stepValid = step === 1 ? step1Valid : step === 2 ? step2Valid : step3Valid;

  const progressPercent = step === 1 ? 33 : step === 2 ? 66 : 100;

  if (submitted) {
    return (
      <main
        className="fixed inset-0 bg-white flex flex-col items-center justify-center px-6"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
      >
        <div className="text-6xl mb-4">{"🙏"}</div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-gray-900 mb-2 text-center">
          Thanks! We hear you
        </h1>
        <p className="text-[13px] text-gray-500 leading-relaxed text-center max-w-xs mb-6">
          Your feedback helps us build a better platform for everyone.
        </p>
        <Link
          href={user ? "/projects" : "/"}
          className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-sm font-extrabold text-white"
        >
          Back to {user ? "projects" : "home"}
        </Link>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Give Feedback - VetMyBuilder</title>
      </Head>

      <main
        className="fixed inset-0 bg-gray-50 flex flex-col"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
      >
        <div className="h-[env(safe-area-inset-top)]" />

        {/* Top bar */}
        <div className="bg-white border-b border-gray-100 flex items-center gap-3 px-[14px] py-[11px] flex-shrink-0">
          <button
            type="button"
            aria-label="Back"
            onClick={handleBack}
            className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4 text-gray-900" />
          </button>
          <span className="text-[15px] font-extrabold text-gray-900">Feedback</span>
        </div>

        {/* Progress bar */}
        <div className="bg-white px-[14px] pt-3 pb-2 flex-shrink-0">
          <div className="h-[5px] w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11.5px] font-bold text-gray-500">
            Step {step} of 3
          </p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Step heading */}
          <div className="px-[14px] pt-[18px] pb-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">
              {STEP_LABELS[step - 1]}
            </p>
          </div>

          {step === 1 && (
            <Step1
              userTypes={userTypes}
              featuresUsed={featuresUsed}
              toggleUserType={toggleUserType}
              toggleFeature={toggleFeature}
            />
          )}

          {step === 2 && (
            <Step2
              rating={rating}
              easeOfUse={easeOfUse}
              setRating={setRating}
              setEaseOfUse={setEaseOfUse}
            />
          )}

          {step === 3 && (
            <Step3
              positives={positives}
              improvements={improvements}
              recommend={recommend}
              setPositives={setPositives}
              setImprovements={setImprovements}
              setRecommend={setRecommend}
              error={error}
            />
          )}

          <div className="h-4" />
        </div>

        {/* Bottom nav */}
        <div className="bg-white border-t border-gray-100 px-3 pt-3 flex gap-2 flex-shrink-0"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting}
              className="px-5 py-3 rounded-xl bg-white border-2 border-gray-200 text-[13px] font-extrabold text-gray-600 disabled:opacity-60"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={!stepValid || submitting}
            className={`flex-1 py-3 rounded-xl bg-indigo-600 text-white text-[13px] font-extrabold transition-opacity ${
              !stepValid || submitting ? "opacity-40 cursor-not-allowed" : ""
            }`}
          >
            {step === 3 ? (submitting ? "Sending…" : "Send feedback") : "Next"}
          </button>
        </div>
      </main>
    </>
  );
}

/* ----- Step 1: About you ----- */

function Step1({
  userTypes,
  featuresUsed,
  toggleUserType,
  toggleFeature,
}: {
  userTypes: string[];
  featuresUsed: string[];
  toggleUserType: (v: string) => void;
  toggleFeature: (v: string) => void;
}) {
  return (
    <div className="px-3 space-y-3">
      {/* User type card */}
      <div className="bg-white rounded-2xl p-3.5">
        <p className="text-[18px] font-extrabold text-gray-900 leading-tight mb-0.5">
          What are you using VetMyBuilder for?{" "}
          <span className="text-red-500">*</span>
        </p>
        <p className="text-[12px] text-gray-500 leading-relaxed mb-3">
          Tick all that apply
        </p>
        <div className="flex flex-wrap gap-2">
          {USER_TYPES.map((opt) => {
            const isOn = userTypes.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleUserType(opt.value)}
                className={`border-2 px-3.5 py-2 rounded-full text-sm font-medium transition-colors ${
                  isOn
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                {isOn && <span className="mr-1">&#10003;</span>}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Features card */}
      <div className="bg-white rounded-2xl p-3.5">
        <p className="text-[18px] font-extrabold text-gray-900 leading-tight mb-0.5">
          Which features have you used?
        </p>
        <p className="text-[12px] text-gray-500 leading-relaxed mb-3">
          Tick all that apply
        </p>
        <div className="flex flex-wrap gap-2">
          {FEATURES.map((feat) => {
            const isOn = featuresUsed.includes(feat.value);
            return (
              <button
                key={feat.value}
                type="button"
                onClick={() => toggleFeature(feat.value)}
                className={`border-2 px-3.5 py-2 rounded-full text-sm font-medium transition-colors ${
                  isOn
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                {isOn && <span className="mr-1">&#10003;</span>}
                {feat.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ----- Step 2: Your experience ----- */

function Step2({
  rating,
  easeOfUse,
  setRating,
  setEaseOfUse,
}: {
  rating: number;
  easeOfUse: number;
  setRating: (v: number) => void;
  setEaseOfUse: (v: number) => void;
}) {
  return (
    <div className="px-3 space-y-3">
      {/* Overall rating card */}
      <div className="bg-white rounded-2xl p-3.5">
        <p className="text-[18px] font-extrabold text-gray-900 leading-tight mb-3">
          How would you rate your experience?{" "}
          <span className="text-red-500">*</span>
        </p>
        <div className="flex gap-2">
          {EMOJI_SCALE.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setRating(item.value)}
              className={`flex-1 border-2 rounded-xl flex flex-col items-center gap-1 p-3 transition-colors ${
                rating === item.value
                  ? "border-indigo-500 bg-indigo-50 scale-110"
                  : "border-gray-200"
              }`}
            >
              <span className="text-2xl">{item.emoji}</span>
              <span className="text-[10px] text-gray-500 font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ease of use card */}
      <div className="bg-white rounded-2xl p-3.5">
        <p className="text-[18px] font-extrabold text-gray-900 leading-tight mb-3">
          How easy was it to use?
        </p>
        <div className="flex gap-2">
          {EMOJI_SCALE.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setEaseOfUse(item.value)}
              className={`flex-1 border-2 rounded-xl flex flex-col items-center gap-1 p-3 transition-colors ${
                easeOfUse === item.value
                  ? "border-indigo-500 bg-indigo-50 scale-110"
                  : "border-gray-200"
              }`}
            >
              <span className="text-2xl">{item.emoji}</span>
              <span className="text-[10px] text-gray-500 font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----- Step 3: Tell us more ----- */

function Step3({
  positives,
  improvements,
  recommend,
  setPositives,
  setImprovements,
  setRecommend,
  error,
}: {
  positives: string;
  improvements: string;
  recommend: string;
  setPositives: (v: string) => void;
  setImprovements: (v: string) => void;
  setRecommend: (v: string) => void;
  error: string | null;
}) {
  return (
    <div className="px-3 space-y-3">
      {/* Free text card */}
      <div className="bg-white rounded-2xl p-3.5 space-y-4">
        <div>
          <label htmlFor="feedback-positives" className="block text-[18px] font-extrabold text-gray-900 leading-tight mb-2">
            What's working well?
          </label>
          <textarea
            id="feedback-positives"
            value={positives}
            onChange={(e) => setPositives(e.target.value)}
            placeholder="Tell us what you like about VetMyBuilder…"
            className="w-full rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none px-4 py-3 text-gray-900 placeholder:text-gray-400 text-[14px] resize-none"
            style={{ minHeight: 100 }}
          />
        </div>
        <div>
          <label htmlFor="feedback-improvements" className="block text-[18px] font-extrabold text-gray-900 leading-tight mb-2">
            What's one thing you'd change?
          </label>
          <textarea
            id="feedback-improvements"
            value={improvements}
            onChange={(e) => setImprovements(e.target.value)}
            placeholder="If you could change one thing, what would it be?"
            className="w-full rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none px-4 py-3 text-gray-900 placeholder:text-gray-400 text-[14px] resize-none"
            style={{ minHeight: 100 }}
          />
        </div>
      </div>

      {/* Recommend card */}
      <div className="bg-white rounded-2xl p-3.5">
        <p className="text-[18px] font-extrabold text-gray-900 leading-tight mb-3">
          Would you recommend VetMyBuilder to a friend?{" "}
          <span className="text-red-500">*</span>
        </p>
        <div className="flex gap-3">
          {RECOMMEND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRecommend(opt.value)}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-colors ${
                recommend === opt.value
                  ? opt.onClass
                  : "border-gray-200 text-gray-500"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="px-1 text-sm text-red-600 font-medium">{error}</p>
      )}
    </div>
  );
}
