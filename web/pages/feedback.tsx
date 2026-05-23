import Head from "next/head";
import { useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import Link from "next/link";
import { useRouter } from "next/router";
import WizardProgressBar from "@/components/wizard/WizardProgressBar";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";

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
  { value: "swiping", label: "Swiping through tradespeople" },
  { value: "browsing_jobs", label: "Browsing jobs (tradespeople)" },
  { value: "chat", label: "Chat with a homeowner / tradesperson" },
  { value: "recommending", label: "Recommending a tradesperson" },
  { value: "favourites", label: "Saving favourites" },
  { value: "paid_unlock", label: "Paid pass or one-off unlock" },
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

  if (submitted) {
    return (
      <>
        <Head>
          <title>Thanks - VetMyBuilder</title>
          <style>{`body { background: #fef6e9 !important; }`}</style>
        </Head>
        <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-12 relative overflow-hidden">
          <BrandWatermarkScatter />
          <div className="relative z-10 mx-auto max-w-md px-4 sm:px-6 lg:px-8 pt-6 pb-8">
            <div className="w-full bg-white rounded-3xl border border-amber-100 shadow-sm p-8 sm:p-10 text-center">
              <div className="text-6xl mb-4">{"🙏"}</div>
              <h1 className="text-[22px] font-extrabold tracking-tight text-gray-900 mb-2">
                Thanks! We hear you
              </h1>
              <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs mx-auto mb-6">
                Your feedback helps us build a better platform for everyone.
              </p>
              <Link
                href={user ? "/projects" : "/"}
                className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
              >
                Back to {user ? "projects" : "home"}
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Give Feedback - VetMyBuilder</title>
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-24 md:pb-6 relative overflow-hidden">
        <BrandWatermarkScatter />
        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-2 pb-2 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start">
          {/* Illustration column. Left on desktop, top on mobile. */}
          <div className="order-1 md:order-1 md:sticky md:top-20">
            <div
              className="relative rounded-3xl overflow-hidden shadow-lg aspect-[16/9] md:aspect-[4/3] md:max-h-[320px] flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg,#fef3c7 0%,#fde68a 55%,#fbbf24 100%)",
              }}
            >
              {/* faint dot grid */}
              <svg className="absolute inset-0" width="100%" height="100%" aria-hidden>
                {Array.from({ length: 22 }).map((_, i) => {
                  const cx = (i * 53) % 600;
                  const cy = (i * 91) % 700;
                  return (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r="3"
                      fill="#92400e"
                      opacity={0.12}
                    />
                  );
                })}
              </svg>

              {/* Speech bubble with stars + small companion bubble */}
              <svg
                viewBox="0 0 260 260"
                width="68%"
                height="68%"
                aria-hidden
                style={{ filter: "drop-shadow(0 14px 30px rgba(146,64,14,0.25))" }}
              >
                {/* small companion bubble */}
                <path
                  d="M30 168 Q30 152 46 152 L84 152 Q100 152 100 168 L100 188 Q100 204 84 204 L66 204 L54 218 L56 204 L46 204 Q30 204 30 188 Z"
                  fill="#ffffff"
                  stroke="#b45309"
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
                <circle cx="50" cy="178" r="4" fill="#b45309" />
                <circle cx="65" cy="178" r="4" fill="#b45309" />
                <circle cx="80" cy="178" r="4" fill="#b45309" />

                {/* main bubble */}
                <path
                  d="M70 30 Q50 30 50 60 L50 132 Q50 158 80 158 L188 158 L210 184 L206 158 L218 158 Q244 158 244 132 L244 60 Q244 30 222 30 Z"
                  fill="#ffffff"
                  stroke="#b45309"
                  strokeWidth="5"
                  strokeLinejoin="round"
                />

                {/* 5 stars inside */}
                {Array.from({ length: 5 }).map((_, i) => {
                  const cx = 78 + i * 30;
                  const cy = 96;
                  const r = 11;
                  // 5-point star path
                  const points: string[] = [];
                  for (let k = 0; k < 10; k++) {
                    const ang = (Math.PI / 5) * k - Math.PI / 2;
                    const rad = k % 2 === 0 ? r : r * 0.45;
                    const x = cx + rad * Math.cos(ang);
                    const y = cy + rad * Math.sin(ang);
                    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
                  }
                  return (
                    <polygon
                      key={i}
                      points={points.join(" ")}
                      fill="#fcd34d"
                      stroke="#b45309"
                      strokeWidth="2.2"
                      strokeLinejoin="round"
                    />
                  );
                })}
              </svg>
            </div>

            {/* Lead-in copy below the illustration on desktop. */}
            <div className="hidden md:block mt-3">
              <h2 className="text-[17px] font-black tracking-tight text-amber-900 leading-tight">
                Tell us what's working
              </h2>
              <p className="mt-1 text-[12.5px] text-amber-900/80 leading-snug max-w-sm">
                A minute of your time helps us decide what to fix next.
              </p>
            </div>
          </div>

          {/* Form column. Right on desktop, below on mobile. */}
          <div className="order-2 md:order-2 w-full overflow-hidden rounded-3xl bg-white border border-amber-100 shadow-sm">
            {/* Progress bar */}
            <WizardProgressBar step={step} total={3} tone="indigo" />

            {/* Step heading */}
            <div className="px-5 sm:px-7 pt-3 pb-0">
              <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-indigo-600">
                {STEP_LABELS[step - 1]}
              </p>
            </div>

            <div className="pb-1">
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
            </div>

            {/* Desktop footer: Back + Next inline inside the card so the
                action sits on the same surface as the form, not in a
                detached strip below it. Hidden on mobile where the
                sticky-to-viewport footer below handles it. */}
            <div className="hidden md:flex items-center justify-between gap-3 border-t border-gray-100 px-5 sm:px-7 py-3">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-white text-gray-900 border-[1.5px] border-gray-200 text-[13px] font-extrabold disabled:opacity-50 hover:border-gray-300 transition-colors"
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleNext}
                disabled={!stepValid || submitting}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-extrabold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
              >
                {step === 3 ? (submitting ? "Sending..." : "Send feedback") : "Next →"}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile sticky footer - thumb-zone CTA on a translucent panel so
            it doesn't read as a second detached card. */}
        <div
          className="md:hidden fixed inset-x-0 bottom-0 z-20 bg-[#fef6e9]/95 backdrop-blur border-t border-amber-100"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center gap-2 px-4 py-3">
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={submitting}
                className="px-4 py-3 rounded-xl bg-white text-gray-900 border-[1.5px] border-gray-200 text-[13px] font-extrabold disabled:opacity-50"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={!stepValid || submitting}
              className="flex-1 bg-indigo-600 text-white px-3 py-3 rounded-xl text-[14px] font-extrabold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === 3 ? (submitting ? "Sending..." : "Send feedback") : "Next →"}
            </button>
          </div>
        </div>
      </div>
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
    <div className="px-3 space-y-2">
      {/* User type card */}
      <div className="bg-white rounded-2xl p-3">
        <p className="text-[15px] font-extrabold text-gray-900 leading-tight">
          What are you using VetMyBuilder for?{" "}
          <span className="text-red-500">*</span>
        </p>
        <p className="text-[11.5px] text-gray-500 leading-snug mb-2">
          Tick all that apply
        </p>
        <div className="flex flex-wrap gap-1.5">
          {USER_TYPES.map((opt) => {
            const isOn = userTypes.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleUserType(opt.value)}
                className={`border-2 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
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
      <div className="bg-white rounded-2xl p-3">
        <p className="text-[15px] font-extrabold text-gray-900 leading-tight">
          Which features have you used?
        </p>
        <p className="text-[11.5px] text-gray-500 leading-snug mb-2">
          Tick all that apply
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FEATURES.map((feat) => {
            const isOn = featuresUsed.includes(feat.value);
            return (
              <button
                key={feat.value}
                type="button"
                onClick={() => toggleFeature(feat.value)}
                className={`border-2 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
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
    <div className="px-3 space-y-2">
      {/* Overall rating card */}
      <div className="bg-white rounded-2xl p-3">
        <p className="text-[15px] font-extrabold text-gray-900 leading-tight mb-2">
          How would you rate your experience?{" "}
          <span className="text-red-500">*</span>
        </p>
        <div className="flex gap-1.5">
          {EMOJI_SCALE.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setRating(item.value)}
              className={`flex-1 border-2 rounded-xl flex flex-col items-center gap-0.5 p-2 transition-colors ${
                rating === item.value
                  ? "border-indigo-500 bg-indigo-50 scale-105"
                  : "border-gray-200"
              }`}
            >
              <span className="text-xl leading-none">{item.emoji}</span>
              <span className="text-[10px] text-gray-500 font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ease of use card */}
      <div className="bg-white rounded-2xl p-3">
        <p className="text-[15px] font-extrabold text-gray-900 leading-tight mb-2">
          How easy was it to use?
        </p>
        <div className="flex gap-1.5">
          {EMOJI_SCALE.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setEaseOfUse(item.value)}
              className={`flex-1 border-2 rounded-xl flex flex-col items-center gap-0.5 p-2 transition-colors ${
                easeOfUse === item.value
                  ? "border-indigo-500 bg-indigo-50 scale-105"
                  : "border-gray-200"
              }`}
            >
              <span className="text-xl leading-none">{item.emoji}</span>
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
    <div className="px-3 space-y-2">
      {/* Free text card */}
      <div className="bg-white rounded-2xl p-3 space-y-2.5">
        <div>
          <label htmlFor="feedback-positives" className="block text-[15px] font-extrabold text-gray-900 leading-tight mb-1.5">
            What's working well?
          </label>
          <textarea
            id="feedback-positives"
            value={positives}
            onChange={(e) => setPositives(e.target.value)}
            placeholder="Tell us what you like about VetMyBuilder..."
            className="w-full rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none px-3 py-2 text-gray-900 placeholder:text-gray-400 text-[13.5px] resize-none"
            style={{ minHeight: 64 }}
          />
        </div>
        <div>
          <label htmlFor="feedback-improvements" className="block text-[15px] font-extrabold text-gray-900 leading-tight mb-1.5">
            What's one thing you'd change?
          </label>
          <textarea
            id="feedback-improvements"
            value={improvements}
            onChange={(e) => setImprovements(e.target.value)}
            placeholder="If you could change one thing, what would it be?"
            className="w-full rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none px-3 py-2 text-gray-900 placeholder:text-gray-400 text-[13.5px] resize-none"
            style={{ minHeight: 64 }}
          />
        </div>
      </div>

      {/* Recommend card */}
      <div className="bg-white rounded-2xl p-3">
        <p className="text-[15px] font-extrabold text-gray-900 leading-tight mb-2">
          Would you recommend VetMyBuilder to a friend?{" "}
          <span className="text-red-500">*</span>
        </p>
        <div className="flex gap-2">
          {RECOMMEND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRecommend(opt.value)}
              className={`flex-1 py-2 rounded-xl border-2 text-[13px] font-bold transition-colors ${
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
        <p className="px-1 text-[12.5px] text-red-600 font-medium">{error}</p>
      )}
    </div>
  );
}
